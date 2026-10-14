# frozen_string_literal: true

require_relative "../be_02/write_boundary_test_helper"
require_relative "../../app/controllers/v2/admin/user_display_preferences_controller"

class UserDisplayPreferencesInputTest < Minitest::Test
  Subject = V2::Admin::UserDisplayPreferencesController

  def test_display_name_and_clear_are_closed_inputs
    assert_equal ["Ada", 0], Subject.input("display_name" => "Ada", "expected_revision" => 0)
    assert_equal [nil, 9], Subject.input("display_name" => nil, "expected_revision" => 9)
  end

  def test_rejects_forged_identity_and_invalid_name
    [{ "display_name" => "Ada", "expected_revision" => 0, "user_id" => "forged" },
      { "display_name" => "", "expected_revision" => 0 },
      { "display_name" => " \n", "expected_revision" => 0 },
      { "display_name" => "A" * 257, "expected_revision" => 0 }].each do |input|
      assert_raises(Elevateo::CollaborationError) { Subject.input(input) }
    end
  end

  def test_rejects_stale_revision_shape_and_malformed_projection
    [{ "display_name" => "Ada", "expected_revision" => "0" },
      { "display_name" => "Ada", "expected_revision" => -1 }].each do |input|
      assert_raises(Elevateo::CollaborationError) { Subject.input(input) }
    end
    assert_raises(Elevateo::CollaborationError) do
      Subject.projection("status" => "ok", "display_name" => "Ada", "revision" => "1")
    end
  end
end
