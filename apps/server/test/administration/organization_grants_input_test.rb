# frozen_string_literal: true

require_relative "../be_02/write_boundary_test_helper"
require_relative "../../app/controllers/v2/admin/organization_grants_controller"

class OrganizationGrantsInputTest < Minitest::Test
  Subject = V2::Admin::OrganizationGrantsController

  def test_closed_subordinate_role_input
    assert_equal ["organization_admin", 0], Subject.change_input("role" => "organization_admin", "expected_revision" => 0)
    assert_equal ["organization_member", 9], Subject.change_input("role" => "organization_member", "expected_revision" => 9)
    assert_equal ["security_auditor", 3], Subject.change_input("role" => "security_auditor", "expected_revision" => 3)
  end

  def test_owner_and_unknown_roles_are_denied
    %w[organization_owner admin unknown].each do |role|
      assert_raises(Elevateo::CollaborationError) { Subject.change_input("role" => role, "expected_revision" => 0) }
    end
  end

  def test_missing_extra_or_stale_revision_shape_is_denied
    [{ "role" => "organization_member" },
      { "role" => "organization_member", "expected_revision" => "0" },
      { "role" => "organization_member", "expected_revision" => -1 },
      { "role" => "organization_member", "expected_revision" => 0, "user_id" => "forged" }].each do |input|
      assert_raises(Elevateo::CollaborationError) { Subject.change_input(input) }
    end
  end
end
