# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/organization_role_audit"

class OrganizationRoleAuditTest < Minitest::Test
  Audit = Elevateo::OrganizationRoleAudit
  ORG = "33333333-3333-4333-8333-333333333333"
  ACTOR = "11111111-1111-4111-8111-111111111111"
  TARGET = "55555555-5555-4555-8555-555555555555"
  ID = "77777777-7777-4777-8777-777777777777"

  def row
    { "id" => ID, "actor_user_id" => ACTOR, "target_user_id" => TARGET,
      "old_role" => "associate", "new_role" => "auditor", "revision" => 4,
      "operation" => "replace_organization_grant", "occurred_at" => "2026-10-14T00:00:00.000001Z" }
  end

  def test_redacted_change_projection
    assert_equal 50, Audit.limit({})
    item = Audit.items([row], organization: ORG, limit: 1).first
    assert_equal %w[actor_user_id id new_role occurred_at old_role operation organization_id revision target_user_id], item.keys.sort
    assert_equal "security_auditor", item.fetch("new_role")
    assert_equal "organization_member", item.fetch("old_role")
  end

  def test_invalid_bounds_and_unknown_roles_fail
    %w[0 01 51 -1].each do |limit|
      assert_equal "request_invalid", assert_raises(Elevateo::CollaborationError) { Audit.limit("limit" => limit) }.code
    end
    error = assert_raises(Elevateo::CollaborationError) do
      Audit.items([row.merge("new_role" => "root")], organization: ORG, limit: 1)
    end
    assert_equal "internal_error", error.code
  end

  def test_noncanonical_time_is_rejected
    error = assert_raises(Elevateo::CollaborationError) do
      Audit.items([row.merge("occurred_at" => "2026-10-14T00:00:00+00:00")], organization: ORG, limit: 1)
    end
    assert_equal "internal_error", error.code
  end

  def test_content_or_noop_cannot_enter_audit_projection
    [row.merge("email" => "private@example.invalid"), row.merge("new_role" => "associate"),
      row.merge("revision" => 0)].each do |value|
      error = assert_raises(Elevateo::CollaborationError) do
        Audit.items([value], organization: ORG, limit: 1)
      end
      assert_equal "internal_error", error.code
    end
  end
end
