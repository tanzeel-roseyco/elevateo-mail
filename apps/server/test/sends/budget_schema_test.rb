# frozen_string_literal: true

require_relative "budget_database_helper"

class SendBudgetSchemaTest < SendBudgetDatabaseTestCase
  def test_scope_and_integer_boundaries_reject_invalid_configuration
    [["organization", []], ["organization", [@org, @box]], ["group", [@org, "unknown"]],
      ["mailbox", [@org, "invalid"]], ["sender_domain", ["UPPER.invalid"]],
      ["destination_domain", ["a@domain.invalid"]], ["egress", [nil]], ["other", [@org]]].each do |kind, scope|
      assert_raises(PG::CheckViolation) do
        @admin.exec_params(<<~SQL, [SecureRandom.uuid, kind, JSON.generate(scope)])
          INSERT INTO app_send_private.budget_limits(id,kind,scope,version,ceiling) VALUES ($1,$2,$3,1,1)
        SQL
      end
    end
    [-1, 1_000_001].each do |ceiling|
      assert_raises(PG::CheckViolation) { update_limit("ceiling=#{ceiling}") }
    end
    update_limit("ceiling=1000000")
    pair = prepare_submission(recipients: Array.new(100) { |n| [nil, "recipient#{n}@example.invalid"] })
    refute_nil authorize(pair)
    assert(usage.all? { |row| row.fetch("used") == "100" })
  end

  def test_effective_changes_require_monotonic_versions_and_stable_identity
    ["id=gen_random_uuid()", "kind='egress'", "scope='[]'::jsonb", "enabled=false", "ceiling=0", "version=0"].each do |assignment|
      assert_raises(PG::ObjectNotInPrerequisiteState) { @admin.exec("UPDATE app_send_private.budget_limits SET #{assignment}") }
    end
    ["id=gen_random_uuid()", "organization_id=gen_random_uuid()", "mailbox_id=gen_random_uuid()",
      "group_name='seed'", "egress_id=gen_random_uuid()", "enabled=false", "version=0"].each do |assignment|
      assert_raises(PG::ObjectNotInPrerequisiteState) { @admin.exec("UPDATE app_send_private.budget_routes SET #{assignment}") }
    end
  end

  def test_lowering_ceiling_below_recorded_usage_preserves_history_and_blocks_new_attempts
    first_pair = prepare_submission
    authorization = authorize(first_pair)
    before = usage
    update_limit("ceiling=0")
    refute final_allowed(first_pair, authorization)
    assert_nil authorize(prepare_submission)
    assert_equal before, usage
    assert_equal "1", @admin.exec("SELECT count(*) FROM app_send_private.attempts").getvalue(0, 0)
  end

  def test_nonempty_down_preserves_every_budget_table
    @admin.exec("BEGIN")
    assert_raises(PG::ObjectNotInPrerequisiteState) { @admin.exec(File.read(File.join(budget_root, "budget_down.sql"))) }
    @admin.exec("ROLLBACK")
    assert_equal "7", @admin.exec("SELECT count(*) FROM app_send_private.budget_limits").getvalue(0, 0)
    assert_equal "1", @admin.exec("SELECT count(*) FROM app_send_private.budget_routes").getvalue(0, 0)
  end
end
