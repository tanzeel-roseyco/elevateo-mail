# frozen_string_literal: true

require_relative "approval_database_helper"

class SendApprovalDatabaseTest < SendDatabaseTestCase
  def test_atomic_queue_and_saved_operation_replay_after_consumption
    result = approve
    assert_match(/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\z/, result.fetch("approved_at"))
    assert_equal [1, 1, 1, 1], counts
    assert_equal "consumed", draft_row.fetch("state")
    assert_equal "1", draft_row.fetch("version")
    assert_equal result, approve(bytes: nil, epoch: nil)
    assert_equal result, approve(operation: SecureRandom.uuid, bytes: nil, epoch: nil)
    assert_equal [1, 1, 1, 2], counts
    assert_equal "editable", save(@saved).fetch("state")
    assert_equal "draft_consumed", save(payload(operation_id: SecureRandom.uuid)).fetch("code")
    queued = status(result.fetch("send_id"))
    assert_match(/Z\z/, queued.fetch("updated_at"))
    assert_equal "queued", queued.fetch("state")
    assert_equal 0, queued.fetch("attempts")
    assert queued.fetch("cancellable")
    refute status(result.fetch("send_id"), epoch: nil).fetch("cancellable")
    refute queued.key?("snapshot_bytes")
  end

  def test_operation_mismatch_and_distinct_key_consumed_conflict
    approve
    assert_equal "operation_mismatch", approve(review_digest: "b" * 64).fetch("code")
    assert_equal "draft_consumed", approve(operation: SecureRandom.uuid, review_digest: "b" * 64).fetch("code")
    assert_equal [1, 1, 1, 2], counts
  end

  def test_stale_snapshot_conflict_is_durable_and_cannot_be_corrected_under_same_key
    assert_equal "review_stale", approve(bytes: @bytes + " ").fetch("code")
    assert_equal [0, 0, 0, 1], counts
    assert_equal "review_stale", approve.fetch("code")
    assert_equal "editable", draft_row.fetch("state")
    refute approve(operation: SecureRandom.uuid).key?("code")
  end

  def test_version_conflict_and_missing_epoch_have_no_partial_intent
    assert_equal "draft_conflict", approve(version: 2).fetch("code")
    assert_equal [0, 0, 0, 1], counts
    assert_equal "dispatch_held", approve(operation: SecureRandom.uuid, epoch: nil).fetch("code")
    assert_equal [0, 0, 0, 1], counts
  end

  def test_disabled_policy_and_suppression_fail_readiness
    @admin.exec_params("INSERT INTO app_send_private.recipient_suppressions VALUES ($1, 'Recipient@example.invalid', clock_timestamp())", [@org])
    assert_equal ["Recipient@example.invalid"], review.fetch("suppressed_addresses")
    assert_equal "send_not_ready", approve.fetch("code")
    assert_equal [0, 0, 0, 1], counts
    @admin.exec_params("DELETE FROM app_send_private.recipient_suppressions WHERE organization_id = $1", [@org])
    @admin.exec_params("UPDATE app_send_private.mailbox_policy SET enabled = false WHERE mailbox_id = $1", [@box])
    assert_equal "send_not_ready", approve(operation: SecureRandom.uuid).fetch("code")
  end

  def test_changed_policy_invalidates_review_digest
    @admin.exec_params("UPDATE app_send_private.organization_policy SET revision = 2 WHERE organization_id = $1", [@org])
    assert_equal "review_stale", approve.fetch("code")
    assert_equal [0, 0, 0, 1], counts
  end

  def test_scope_revocation_precedes_replay
    approve
    fixture_change { @admin.exec_params("UPDATE app.mailbox_memberships SET approve_send = false WHERE mailbox_id = $1", [@box]) }
    assert_equal "not_available", approve(bytes: nil).fetch("code")
    assert_equal [1, 1, 1, 1], counts
  end

  def test_guessed_gucs_cannot_replace_cookie_guard
    begin_write
    assert_raises(PG::InsufficientPrivilege) { approve_sql }
    @api.exec("ROLLBACK")
    assert_equal [0, 0, 0, 0], counts
  end

  def test_rollback_after_all_inserts_removes_every_effect
    begin_write
    assert_equal "ok", write_guard.fetch("status")
    refute approve_sql.key?("code")
    @api.exec("ROLLBACK")
    assert_equal [0, 0, 0, 0], counts
    assert_equal "editable", draft_row.fetch("state")
  end

  def test_same_and_distinct_key_concurrent_approvals_converge
    results = parallel_api_calls(2) { |connection, _| approve(connection: connection) }
    assert_equal results.first, results.last
    assert_equal [1, 1, 1, 1], counts
    results = parallel_api_calls(2) { |connection, _| approve(connection: connection, operation: SecureRandom.uuid, bytes: nil) }
    assert_equal results.first, results.last
    assert_equal [1, 1, 1, 3], counts
  end
  def test_distinct_keys_compete_on_fresh_draft_under_real_lock_barrier
    second_digest = SecureRandom.hex(32)
    assert_equal "ok", create(digest: second_digest).fetch("status")
    with_api_connections(2) do |connections|
      first, second = connections
      begin_write(connection: first)
      assert_equal "ok", write_guard(connection: first).fetch("status")
      initial = approve_sql(connection: first, operation: SecureRandom.uuid)
      thread = Thread.new { approve(connection: second, digest: second_digest, operation: SecureRandom.uuid) }
      thread.report_on_exception = false
      begin
        wait_for_lock(second, blocker: first.backend_pid)
        first.exec("COMMIT")
        assert_equal initial, guard_result(thread)
        assert_equal [1, 1, 1, 2], counts
      ensure
        first.exec("ROLLBACK") if first.transaction_status != PG::PQTRANS_IDLE
        thread.join(12) || raise("concurrent approval did not drain")
      end
    end
  end

  def test_expiry_during_draft_lock_wait_denies_existing_and_distinct_key_replay
    result = approve
    [@operation, SecureRandom.uuid].each do |operation|
      @admin.exec_params("UPDATE app_auth.sessions SET access_expires_at = clock_timestamp() + interval '500 milliseconds' WHERE cookie_digest = $1", [@digest])
      @admin.exec("BEGIN")
      @admin.exec_params("SELECT id FROM app.drafts WHERE id = $1 FOR UPDATE", [@draft])
      thread = Thread.new { approve(operation: operation, bytes: nil) }
      thread.report_on_exception = false
      begin
        wait_for_lock(@api)
        sleep 0.55
        @admin.exec("COMMIT")
        assert_equal "unauthenticated", guard_result(thread).fetch("code")
        assert_equal [1, 1, 1, 1], counts
        assert_equal "queued", status(result.fetch("send_id")).fetch("state")
      ensure
        @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
        thread.join(12) || raise("expiry replay did not drain")
      end
    end
  end

end
