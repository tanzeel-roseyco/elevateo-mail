# frozen_string_literal: true

require_relative "budget_database_helper"
require "active_record"
require_relative "../../db/migrate/20261029000045_add_user_send_budgets"

# AIDEV-NOTE: User admission uses immutable approval identity and the same atomic locks as mailbox admission.
class UserBudgetDatabaseTest < SendBudgetDatabaseTestCase
  def test_migration_restores_role_for_framework_bookkeeping
    original_role = @admin.exec("SELECT current_user").getvalue(0, 0)
    @admin.exec("BEGIN")
    @admin.exec("DELETE FROM app_send_private.budget_limits WHERE kind='user'")
    admin = @admin
    migration = AddUserSendBudgets.new
    migration.define_singleton_method(:execute) { |sql| admin.exec(sql) }
    migration.down
    assert_equal original_role, @admin.exec("SELECT current_user").getvalue(0, 0)
    migration.up
    assert_equal original_role, @admin.exec("SELECT current_user").getvalue(0, 0)
    @admin.exec("SELECT version FROM app_meta.schema_migrations LIMIT 1")
  ensure
    # AIDEV-NOTE: Roll back schema and quota changes so admission tests retain their original fixtures.
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end

  def test_user_quota_is_charged_to_the_approver_and_final_checks_do_not_charge_again
    pair = prepare_submission
    authorization = authorize(pair)
    refute_nil authorization
    row = usage.find { |item| item.fetch("kind") == "user" }
    assert_equal [@user], JSON.parse(row.fetch("scope"))
    assert_equal "1", row.fetch("used")
    before = usage
    2.times { assert final_allowed(pair, authorization) }
    assert_equal before, usage
  end

  def test_missing_user_limit_fails_closed_without_charging_other_axes
    @admin.exec("DELETE FROM app_send_private.budget_limits WHERE kind='user'")
    assert_no_reservation(prepare_submission)
  end

  def test_user_exhaustion_does_not_reserve_any_other_axis
    @admin.exec("UPDATE app_send_private.budget_limits SET ceiling=0,version=2 WHERE kind='user'")
    assert_no_reservation(prepare_submission, reason: "counter_exhausted")
  end

  def test_user_scope_is_global_and_independent_of_mailbox_route
    pair = prepare_submission
    rows = @admin.exec_params("SELECT scope FROM app_send_private.budget_requirements($1) WHERE kind='user'", [pair.last.send_id])
    assert_equal 1, rows.ntuples
    assert_equal [@user], JSON.parse(rows.getvalue(0, 0))
    @admin.exec_params("UPDATE app_send_private.budget_routes SET group_name='personal',version=2 WHERE id=$1", [@budget_route])
    changed = @admin.exec_params("SELECT scope FROM app_send_private.budget_requirements($1) WHERE kind='user'", [pair.last.send_id])
    assert_equal rows.to_a, changed.to_a
  end
  def test_two_mailboxes_concurrently_share_one_user_ceiling
    @admin.exec("UPDATE app_send_private.budget_limits SET ceiling=1,version=2 WHERE kind='user'")
    first_mailbox = @box
    second_connection = connect("BE02_WORKER_DATABASE_URL", "elevateo_worker")
    @box = SecureRandom.uuid
    fixture_change do
      @admin.exec_params("INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES ($1,$2,$3,'private')", [@box, @org, "#{@box}@example.invalid"])
      @admin.exec_params("INSERT INTO app.mailbox_memberships(organization_id,mailbox_id,user_id,compose,approve_send) VALUES ($1,$2,$3,true,true)", [@org, @box, @user])
      @admin.exec_params("INSERT INTO app.mailbox_security(organization_id,mailbox_id,classification) VALUES ($1,$2,'team')", [@org, @box])
      @admin.exec_params("INSERT INTO app.mailbox_grant_ceilings(organization_id,mailbox_id,user_id,compose,manage_members) VALUES ($1,$2,$3,true,true)", [@org, @box, @user])
      @admin.exec_params("INSERT INTO app_send_private.mailbox_policy VALUES ($1,$2,true)", [@org, @box])
    end
    create_smtp_account
    # AIDEV-NOTE: Finish membership changes before either approval; provisioning revokes earlier capability generations.
    second = prepare_submission(connection: second_connection)
    @box = first_mailbox
    first = prepare_submission
    @worker.exec("BEGIN")
    refute_nil authorize(first)
    thread = Thread.new { authorize(second) }
    thread.report_on_exception = false
    wait_for_lock(second_connection, blocker: @worker.backend_pid, seconds: 0.7)
    @worker.exec("COMMIT")
    assert thread.join(3), "second mailbox quota decision did not finish"
    assert_nil thread.value
    # AIDEV-NOTE: Admin sees committed rows only; assert exact winner totals after both workers have finished.
    assert_equal 7, usage.length
    assert(usage.all? { |row| row.fetch("used") == "1" })
    assert_equal "1", @admin.exec("SELECT count(*) FROM app_send_private.attempts").getvalue(0, 0)
    assert_equal "counter_exhausted", @admin.exec_params("SELECT hold_reason FROM app_send_private.jobs WHERE send_id=$1", [second.last.send_id]).getvalue(0, 0)
  ensure
    @worker.exec("ROLLBACK") if @worker && @worker.transaction_status != PG::PQTRANS_IDLE
    thread&.join(4)
    second_connection&.close
  end

end
