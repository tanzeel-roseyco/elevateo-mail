# frozen_string_literal: true

require_relative "../be_02/write_boundary_test_helper"
require_relative "../../lib/elevateo/assignee_options"

class AssigneeOptionsTest < Minitest::Test
  Subject = Elevateo::AssigneeOptions
  FIRST = "11111111-1111-4111-8111-111111111111"
  SECOND = "22222222-2222-4222-8222-222222222222"

  def test_bounded_uuid_only_page_and_empty_result
    assert_equal 50, Subject.limit({})
    assert_equal 1, Subject.limit("limit" => "1")
    result = { "status" => "ok", "items" => [{ "user_id" => FIRST }], "next_user_id" => FIRST }
    assert_equal [[{ "user_id" => FIRST }], FIRST], Subject.project(result, after: nil, limit: 1)
    assert_equal [[], nil], Subject.project({ "status" => "ok", "items" => [], "next_user_id" => nil },
      after: FIRST, limit: 1)
    assert_equal [[{ "user_id" => SECOND }], nil], Subject.project(
      { "status" => "ok", "items" => [{ "user_id" => SECOND }], "next_user_id" => nil }, after: FIRST, limit: 1)
  end

  def test_rejects_invalid_limits_and_cursor_position
    %w[0 01 51 999 -1].each do |value|
      assert_raises(Elevateo::CollaborationError) { Subject.limit("limit" => value) }
    end
    [{}, { "user_id" => "bad" }, { "user_id" => FIRST, "other" => "x" }].each do |value|
      assert_raises(Elevateo::CollaborationError) { Subject.position(value) }
    end
  end

  def test_rejects_leaked_fields_duplicate_out_of_order_and_bad_lookahead
    invalid = [
      { "status" => "ok", "items" => [{ "user_id" => FIRST, "email" => "hidden@example.test" }], "next_user_id" => nil },
      { "status" => "ok", "items" => [{ "user_id" => FIRST }, { "user_id" => FIRST }], "next_user_id" => nil },
      { "status" => "ok", "items" => [{ "user_id" => FIRST }], "next_user_id" => SECOND },
      { "status" => "ok", "items" => [], "next_user_id" => FIRST },
      { "status" => "ok", "items" => [{ "user_id" => FIRST }], "next_user_id" => nil, "debug" => "secret" }
    ]
    invalid.each do |result|
      assert_raises(Elevateo::CollaborationError) { Subject.project(result, after: nil, limit: 2) }
    end
    assert_raises(Elevateo::CollaborationError) do
      Subject.project({ "status" => "ok", "items" => [{ "user_id" => FIRST }], "next_user_id" => nil },
        after: SECOND, limit: 1)
    end
  end
end
