# frozen_string_literal: true

require_relative "budget_database_helper"

class SendBudgetDatabaseTest < SendBudgetDatabaseTestCase
  def test_recipient_axes_are_atomic_and_unknown_does_not_refund
    pair = prepare_submission(recipients: [[nil, "a@example.invalid"], [nil, "b@example.invalid"], [nil, "c@other.invalid"]])
    authorization = authorize(pair)
    refute_nil authorization
    rows = usage
    assert_equal 8, rows.length
    assert_equal [1, 2], rows.select { |row| row.fetch("kind") == "destination_domain" }.map { |row| row.fetch("used").to_i }.sort
    assert(rows.reject { |row| row.fetch("kind") == "destination_domain" }.all? { |row| row.fetch("used") == "3" })
    2.times { assert final_allowed(pair, authorization) }
    assert_equal rows, usage
    result = pair.first.mark_unknown(claim: pair.last, attempt_id: authorization.attempt_id, reason: "local_paused")
    assert_equal "unknown", result.fetch("state")
    assert_equal rows, usage
    assert_raises(PG::ObjectNotInPrerequisiteState) { @admin.exec("DELETE FROM app_send_private.attempt_budgets") }
  end

  def test_last_axis_exhaustion_rolls_back_all_earlier_charges_and_attempt
    pair = prepare_submission
    @admin.exec(<<~SQL)
      UPDATE app_send_private.budget_limits SET ceiling=0,version=2 WHERE id=(
        SELECT l.id FROM app_send_private.budget_limits l
          JOIN app_send_private.budget_requirements('#{pair.last.send_id}') r USING(kind,scope)
          ORDER BY l.id DESC LIMIT 1)
    SQL
    assert_no_reservation(pair, reason: "counter_exhausted")
    assert_equal "1", @admin.exec("SELECT count(*) FROM app_send_private.audit_events").getvalue(0, 0)
  end

  def test_missing_limit_holds_without_a_partial_attempt
    @admin.exec("DELETE FROM app_send_private.budget_limits WHERE kind='mailbox'")
    assert_no_reservation(prepare_submission)
  end

  def test_disabled_limit_holds_without_a_partial_attempt
    update_limit("enabled=false")
    assert_no_reservation(prepare_submission)
  end

  def test_missing_route_holds_without_a_partial_attempt
    @admin.exec_params("DELETE FROM app_send_private.budget_routes WHERE id=$1", [@budget_route])
    assert_no_reservation(prepare_submission)
  end

  def test_disabled_route_holds_without_a_partial_attempt
    @admin.exec_params("UPDATE app_send_private.budget_routes SET enabled=false,version=2 WHERE id=$1", [@budget_route])
    assert_no_reservation(prepare_submission)
  end

  def test_yesterdays_usage_does_not_consume_todays_ceiling
    update_limit("ceiling=1")
    @admin.exec(<<~SQL)
      INSERT INTO app_send_private.budget_usage SELECT id,(clock_timestamp() AT TIME ZONE 'UTC')::date-1,1
        FROM app_send_private.budget_limits
    SQL
    pair = prepare_submission
    assert final_allowed(pair, authorize(pair))
    assert_equal "7", @admin.exec("SELECT count(*) FROM app_send_private.budget_usage WHERE day=(clock_timestamp() AT TIME ZONE 'UTC')::date").getvalue(0, 0)
    assert_equal "8", @admin.exec("SELECT count(*) FROM app_send_private.budget_usage WHERE day=(clock_timestamp() AT TIME ZONE 'UTC')::date-1").getvalue(0, 0)
  end

  def test_disable_reenable_and_limit_rotation_do_not_restore_authority
    pair = prepare_submission
    authorization = authorize(pair)
    assert final_allowed(pair, authorization)
    update_limit("enabled=false")
    refute final_allowed(pair, authorization)
    update_limit("enabled=true")
    refute final_allowed(pair, authorization)
    assert_equal 7, usage.length
  end

  def test_route_change_requires_new_reservations
    pair = prepare_submission
    authorization = authorize(pair)
    @admin.exec_params("UPDATE app_send_private.budget_routes SET group_name='seed',version=2 WHERE id=$1", [@budget_route])
    refute final_allowed(pair, authorization)
    @admin.exec_params("UPDATE app_send_private.budget_routes SET group_name='outreach',version=3 WHERE id=$1", [@budget_route])
    refute final_allowed(pair, authorization)
  end

  def test_missing_reservation_denies_final_check_without_refunding
    pair = prepare_submission
    authorization = authorize(pair)
    @admin.exec("BEGIN; SET LOCAL session_replication_role=replica")
    @admin.exec("DELETE FROM app_send_private.attempt_budgets WHERE limit_id=(SELECT min(id::text)::uuid FROM app_send_private.budget_limits WHERE kind='mailbox')")
    @admin.exec("COMMIT")
    refute final_allowed(pair, authorization)
    assert_equal 7, usage.length
  end

  def test_previous_day_reservations_are_denied
    pair = prepare_submission
    authorization = authorize(pair)
    @admin.exec("BEGIN; SET LOCAL session_replication_role=replica")
    @admin.exec("UPDATE app_send_private.attempt_budgets SET reserved_at=reserved_at-interval '1 day',day=day-1")
    @admin.exec("COMMIT")
    refute final_allowed(pair, authorization)
  end

  def test_same_day_disagreement_between_reservation_timestamps_is_denied
    pair = prepare_submission
    authorization = authorize(pair)
    @admin.exec("BEGIN; SET LOCAL session_replication_role=replica")
    @admin.exec(<<~SQL)
      UPDATE app_send_private.attempt_budgets SET reserved_at=reserved_at+interval '1 microsecond'
        WHERE limit_id=(SELECT id FROM app_send_private.budget_limits WHERE kind='mailbox')
    SQL
    @admin.exec("COMMIT")
    refute final_allowed(pair, authorization)
    assert_equal 7, usage.length
  end

  def test_runtime_roles_cannot_manipulate_limits_or_call_reservation_helpers
    [@worker, @api].each do |connection|
      %w[budget_routes budget_limits budget_usage attempt_budgets].each do |table|
        assert_raises(PG::InsufficientPrivilege) { connection.exec("SELECT * FROM app_send_private.#{table}") }
        assert_raises(PG::InsufficientPrivilege) { connection.exec("DELETE FROM app_send_private.#{table}") }
      end
      assert_raises(PG::InsufficientPrivilege) do
        connection.exec_params("SELECT app_send_private.reserve_budget($1::uuid,$2::uuid)", [SecureRandom.uuid, SecureRandom.uuid])
      end
    end
  end
end
