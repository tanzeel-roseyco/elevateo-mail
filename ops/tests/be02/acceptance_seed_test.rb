# frozen_string_literal: true

require "minitest/autorun"
require_relative "acceptance_seed"

# AIDEV-NOTE: Fixture authority is case-specific; these tests never contact Auth or a database.
class AcceptanceSeedTest < Minitest::Test
  Runtime = Struct.new(:seed)
  Result = Struct.new(:values)
  Database = Struct.new(:rows) do
    def exec(sql)
      raise "unexpected fixture query" unless sql ==
        "SELECT organization_id,user_id,role,revision FROM app.organization_access"
      Result.new(rows)
    end
  end

  def fixture(case_id)
    seed = {
      "fixture_identity" => { "case_id" => case_id }, "data" => {},
      "organizations" => { "primary" => "primary-org", "other" => "other-org" },
      "actors" => {
        "manager_primary" => { "organization" => "primary", "user_id" => "primary-manager" },
        "other_org" => { "organization" => "other", "user_id" => "foreign-manager" },
        "reader" => { "organization" => "primary", "user_id" => "reader" }
      }
    }
    [Be02Acceptance::Fixture.new(Runtime.new(seed)), seed]
  end

  def test_only_named_admin_and_outreach_cases_receive_primary_admin
    %w[SCN-QA-819-F1 SCN-QA-820-P SCN-QA-820-F1 SCN-QA-821-P].each do |case_id|
      candidate, = fixture(case_id)
      assert_equal [{ organization_id: "primary-org", user_id: "primary-manager", role: "admin" }],
        candidate.send(:organization_grants)
    end
  end

  def test_foreign_case_grants_each_actor_only_its_own_organization
    candidate, = fixture("SCN-QA-820-F2")
    assert_equal [
      { organization_id: "primary-org", user_id: "primary-manager", role: "admin" },
      { organization_id: "other-org", user_id: "foreign-manager", role: "admin" }
    ], candidate.send(:organization_grants)
  end

  def test_default_unrelated_and_unrecognized_cases_receive_no_grants
    ["shared-diagnostic", "SCN-QA-819-P", "SCN-QA-821-F1", "SCN-QA-820-P-extra", nil].each do |case_id|
      candidate, = fixture(case_id)
      assert_empty candidate.send(:organization_grants)
    end
  end

  def test_missing_identity_fails_before_grant_generation
    candidate, seed = fixture("SCN-QA-820-P")
    seed.delete("fixture_identity")
    assert_raises(KeyError) { candidate.send(:organization_grants) }
  end

  def test_committed_set_requires_exact_roles_scopes_and_initial_revisions
    candidate, = fixture("SCN-QA-820-F2")
    expected = [["other-org", "foreign-manager", "admin", "0"],
      ["primary-org", "primary-manager", "admin", "0"]]
    candidate.instance_variable_set(:@db, Database.new(expected.reverse))
    candidate.send(:verify_organization_grants)
    invalid_sets = [[], expected.take(1), expected + [["primary-org", "reader", "admin", "0"]],
      [expected.first, ["other-org", "primary-manager", "admin", "0"]],
      [expected.first, ["primary-org", "primary-manager", "owner", "0"]],
      [expected.first, ["primary-org", "primary-manager", "admin", "1"]]]
    invalid_sets.each do |rows|
      candidate.instance_variable_set(:@db, Database.new(rows))
      error = assert_raises(Be02Acceptance::Failure) { candidate.send(:verify_organization_grants) }
      assert_equal "organization_grant_set_mismatch", error.message
    end
  end

  def test_unrelated_case_rejects_any_committed_role
    candidate, = fixture("SCN-QA-819-P")
    candidate.instance_variable_set(:@db, Database.new([]))
    candidate.send(:verify_organization_grants)
    candidate.instance_variable_set(:@db, Database.new([["primary-org", "primary-manager", "admin", "0"]]))
    assert_raises(Be02Acceptance::Failure) { candidate.send(:verify_organization_grants) }
  end
end
