# frozen_string_literal: true

require_relative "budget_database_helper"
require_relative "authorized_peer_fixture"

# AIDEV-NOTE: One advisory-locked fixture owns both tenants; each has separate identities, sessions, logins and cleanup.
class SendBudgetCrossTenantTest < SendBudgetDatabaseTestCase
  include AuthorizedPeerFixture

  def build_peer
    peer = build_send_peer(SendBudgetDatabaseTestCase)
    peer.create_smtp_account
    peer
  end

  def test_global_domain_budget_is_shared_by_independently_authorized_tenants
    peer = build_peer
    # AIDEV-NOTE: Refuse to alter a pre-existing shared limit; only this fixture's newly created limit is mutable.
    changed = @admin.exec_params("UPDATE app_send_private.budget_limits SET ceiling=1,version=version+1 WHERE kind='sender_domain' AND id=ANY($1::uuid[])", ["{#{@budget_limit_ids.join(',')}}"])
    assert_equal 1, changed.cmd_tuples
    pair = prepare_submission
    other = peer.prepare_submission
    @worker.exec("BEGIN")
    authorization = authorize(pair)
    refute_nil authorization
    second = peer.instance_variable_get(:@worker)
    thread = Thread.new { peer.authorize(other) }
    thread.report_on_exception = false
    wait_for_lock(second, blocker: @worker.backend_pid, seconds: 0.7)
    @worker.exec("COMMIT")
    assert thread.join(3), "second tenant worker failed to finish"
    assert_nil thread.value
    assert final_allowed(pair, authorization)
    assert_equal "counter_exhausted", @admin.exec_params("SELECT hold_reason FROM app_send_private.jobs WHERE send_id=$1", [other.last.send_id]).getvalue(0, 0)
    assert_equal "1", @admin.exec("SELECT count(*) FROM app_send_private.attempts").getvalue(0, 0)
    before = usage
    peer.teardown
    @peer = nil
    assert_equal before, usage, "peer disposal changed another tenant's shared quota or evidence"
    assert final_allowed(pair, authorization)
  ensure
    @worker.exec("ROLLBACK") if @worker && @worker.transaction_status != PG::PQTRANS_IDLE
    thread&.join(4)
  end

  def teardown
    @peer&.teardown
  ensure
    super
  end
end
