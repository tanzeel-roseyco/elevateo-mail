# frozen_string_literal: true

require_relative "mailbox_membership_test_helper"

class MailboxMembershipTest < MailboxMembershipUnitCase
  Input = Elevateo::MailboxMembershipInput

  def test_closed_capabilities_and_bounded_mathematical_revision
    assert_equal [7, @flags], Input.put("expected_membership_version" => 7.0, "capabilities" => @flags)
    [-1, 0.5, "1", nil, 2_147_483_648].each do |version|
      assert_code("request_invalid") { Input.put("expected_membership_version" => version, "capabilities" => @flags) }
    end
    [nil, {}, @flags.merge("compose" => "true"), @flags.merge("read" => true)].each do |flags|
      assert_code("request_invalid") { Input.put("expected_membership_version" => 0, "capabilities" => flags) }
    end
    assert_code("request_invalid") { Input.put("expected_membership_version" => 0, "capabilities" => @flags, "user_id" => @user) }
    assert_equal 2_147_483_647, Input.delete("expected_membership_version" => "2147483647")
    ["01", "+1", "-1", "1.0", "1e1", " 1", "2147483648", ""].each do |revision|
      assert_code("request_invalid") { Input.delete("expected_membership_version" => revision) }
    end
    assert_code("request_invalid") { Input.delete({}) }
  end

  def test_manager_roster_projection_bound_and_revision_cursor
    connection = Connection.new([{ "membership_version" => 8 }], [member_row, member_row(@target)])
    first = JSON.parse(roster(connection, "limit" => "1"))
    assert_equal ["authorization_version", "context_id", "items", "mailbox_id", "membership_version", "next_cursor"], first.keys.sort
    assert_equal [{ "user_id" => @user, "capabilities" => @flags }], first.fetch("items")
    assert_equal [@box, nil, "2"], connection.calls.last.last
    next_connection = Connection.new([{ "membership_version" => 8 }], [])
    roster(next_connection, "limit" => "1", "cursor" => first.fetch("next_cursor"))
    assert_equal [@box, @user, "2"], next_connection.calls.last.last
    assert_code("cursor_invalid") do
      roster(Connection.new([{ "membership_version" => 9 }]), "limit" => "1", "cursor" => first.fetch("next_cursor"))
    end
    rows = Array.new(51) { member_row }
    body = roster(Connection.new([{ "membership_version" => 8 }], rows))
    assert_operator body.bytesize, :<=, 131_072
    assert_equal 50, JSON.parse(body).fetch("items").length
    assert_code("request_invalid") { roster(Connection.new, "limit" => "51") }
  end

  def test_missing_manager_authority_precedes_bad_cursor
    error = assert_raises(Error) { roster(Connection.new([{ "membership_version" => nil }]), "cursor" => "invalid") }
    assert_equal [404, "This item is unavailable."], [error.status, error.message]
    assert_equal [], JSON.parse(roster(Connection.new([{ "membership_version" => 0 }], []))).fetch("items")
  end

  def test_mutation_signs_fresh_actor_generation_and_keeps_closed_wire_shape
    metadata = { "status" => "ok", "user_id" => @user, "organization_id" => @org, "authorization_generation" => 42 }
    result = { "status" => "ok", "metadata" => metadata, "membership_version" => 9,
      "member" => { "user_id" => @user, "capabilities" => @flags } }
    connection = Connection.new([{ "result" => result }])
    response = service(Elevateo::MailboxMemberships, connection).put(mailbox_id: @box, user_id: @user,
      input: { "expected_membership_version" => 8, "capabilities" => @flags }, digest: "d" * 64, presentation: @presentation)
    body = JSON.parse(response.json)
    assert_equal 200, response.status
    assert_operator response.json.bytesize, :<=, 4096
    assert_equal @presentation.version(metadata), body.fetch("authorization_version")
    refute_equal @presentation.version(metadata.merge("authorization_generation" => 41)), body.fetch("authorization_version")
    assert_equal %w[authorization_version context_id mailbox_id member membership_version user_id], body.keys.sort
    assert_equal ["d" * 64, @box, @user, "8", "false", "true", "false", "false"], connection.calls.last.last
  end

  def test_mutation_conflict_and_malformed_database_output_fail_deliberately
    results = [{ "status" => "membership_conflict" }, { "status" => "ok", "metadata" => {} },
      { "status" => "ok", "metadata" => { "user_id" => @user, "organization_id" => @org } }]
    results.zip(%w[membership_conflict internal_error internal_error]).each do |result, code|
      assert_code(code) do
        service(Elevateo::MailboxMemberships, Connection.new([{ "result" => result }])).delete(
          mailbox_id: @box, user_id: @target, query: { "expected_membership_version" => "8" }, digest: "d" * 64, presentation: @presentation)
      end
    end
  end

  def test_malformed_database_capabilities_are_server_errors
    metadata = { "user_id" => @user, "organization_id" => @org, "authorization_generation" => 42 }
    [nil, @flags.merge("compose" => "true"), @flags.merge("extra" => true)].each do |capabilities|
      result = { "status" => "ok", "metadata" => metadata, "membership_version" => 9,
        "member" => { "user_id" => @user, "capabilities" => capabilities } }
      assert_code("internal_error") do
        service(Elevateo::MailboxMemberships, Connection.new([{ "result" => result }])).put(
          mailbox_id: @box, user_id: @user, input: { "expected_membership_version" => 8, "capabilities" => @flags },
          digest: "d" * 64, presentation: @presentation)
      end
    end
  end
end
