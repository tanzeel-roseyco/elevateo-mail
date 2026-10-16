# frozen_string_literal: true

require_relative "draft_staging_database_helper"

class DraftStagingRaceDatabaseTest < DraftStagingDatabaseTestCase
  # AIDEV-NOTE: Lost responses are modeled by discarding results after COMMIT; only durable state authorizes retry.
  def test_rolled_back_reservation_can_be_created_but_lost_commit_reuses_original_identity
    begin_write
    assert_equal "ok", write_guard.fetch("status")
    assert_equal "reserved", reserve_sql.fetch("stage_state")
    @api.exec("ROLLBACK")
    assert_empty stage_rows
    reserve
    original = stage_rows
    result = reserve(attachment: SecureRandom.uuid, token: SecureRandom.uuid)
    assert_equal "reconcile", result.fetch("stage_state")
    assert_equal @attachment, result.fetch("attachment_id")
    assert_equal @reservation, result.fetch("reservation_token")
    assert_equal original, stage_rows
    finalize
    committed = scan_row
    assert_equal "committed", finalize.fetch("stage_state")
    assert_equal committed, scan_row
  end

  def test_concurrent_same_operation_yields_only_one_upload_permission
    results = parallel_api_calls(2) do |connection, _index|
      reserve(connection: connection, attachment: SecureRandom.uuid, token: SecureRandom.uuid)
    end
    assert_equal %w[reconcile reserved], results.map { |result| result.fetch("stage_state") }.sort
    assert_equal 1, results.map { |result| result.fetch("attachment_id") }.uniq.length
    assert_equal 1, results.map { |result| result.fetch("reservation_token") }.uniq.length
    assert_equal 1, stage_rows.length
    assert_nil scan_row
  end

  def test_concurrent_distinct_operations_cannot_consume_two_slots
    results = parallel_api_calls(2) do |connection, _index|
      reserve(connection: connection, operation: SecureRandom.uuid, attachment: SecureRandom.uuid, token: SecureRandom.uuid)
    end
    assert_equal 1, (results.count { |result| result["stage_state"] == "reserved" })
    assert_equal 1, (results.count { |result| result["code"] == "attachment_slot_occupied" })
    assert_equal 1, stage_rows.length
    assert_equal "1", draft_row.fetch("version")
  end

  def test_concurrent_finalizers_commit_one_pending_attachment
    reserve
    results = parallel_api_calls(2) do |connection, _index|
      stage_transaction(connection: connection) { finalize_sql(connection: connection) }
    end
    assert_equal 1, results.uniq.length
    assert_equal "committed", results.first.fetch("stage_state")
    assert_equal 1, attachment_list.fetch("items").length
    assert_equal "0", scan_row.fetch("scan_attempt")
    assert_equal 1, stage_rows.length
  end

  def test_deleted_reserved_draft_cannot_finalize_old_bytes_after_id_recreation
    assert_retired_after_recreation(committed: false)
  end

  def test_deleted_committed_draft_cannot_report_stale_success_after_id_recreation
    assert_retired_after_recreation(committed: true)
  end

  # AIDEV-NOTE: Draft deletion terminalizes both reserved and committed operations without recycling object identity.
  def assert_retired_after_recreation(committed:)
    reserve
    finalize if committed
    before = stage_rows.first
    @admin.exec_params("DELETE FROM app.drafts WHERE id=$1", [@draft])
    assert_nil scan_row
    retired = stage_rows.first
    assert_equal "aborted", retired.fetch("stage_state")
    assert_equal before.reject { |key, _| %w[stage_state completed_at].include?(key) },
      (retired.reject { |key, _| %w[stage_state completed_at].include?(key) })
    assert_equal({"code" => "not_available"}, attachment_list)
    assert_equal({"code" => "not_available"}, finalize)
    @operation = SecureRandom.uuid
    assert_equal 1, save.fetch("version")
    assert_equal({"code" => "operation_retired"}, reserve)
    assert_equal({"code" => "operation_retired"}, finalize)
    assert_empty attachment_list.fetch("items")
    @stage_operation, @attachment, @reservation = Array.new(3) { SecureRandom.uuid }
    assert_equal "reserved", reserve.fetch("stage_state")
    assert_equal "committed", finalize.fetch("stage_state")
    assert_equal [@attachment], (attachment_list.fetch("items").map { |item| item.fetch("id") })
    assert_equal 2, stage_rows.length
  end
end
