# frozen_string_literal: true

require_relative "draft_staging_database_helper"

class DraftStagingDatabaseTest < DraftStagingDatabaseTestCase
  def test_reservation_replay_never_grants_another_upload_and_finalization_is_idempotent
    first = reserve
    assert_equal "reserved", first.fetch("stage_state")
    assert_equal "drafts/#{@org}/#{@attachment}", first.fetch("object_key")
    assert_nil scan_row
    assert_empty attachment_list.fetch("items")
    replay = reserve(attachment: SecureRandom.uuid, token: SecureRandom.uuid)
    assert_equal first.merge("stage_state" => "reconcile"), replay
    assert_equal 1, stage_rows.length
    expected = {"attachment_id" => @attachment, "operation_id" => @stage_operation, "stage_state" => "committed"}
    assert_equal expected, finalize
    original = scan_row
    assert_equal expected, finalize
    assert_equal original, scan_row
    assert_equal "committed", reserve.fetch("stage_state")
    assert_equal [{"id" => @attachment, "filename" => "proof.txt", "content_type" => "text/plain",
                   "byte_size" => 12, "status" => "pending_scan"}], attachment_list.fetch("items")
    assert_equal "1", draft_row.fetch("version")
    assert_equal "editable", draft_row.fetch("state")
  end

  def test_operation_changes_and_distinct_operations_cannot_duplicate_reserved_or_committed_slot
    reserve
    before = stage_rows
    [{request_digest: "a" * 64}, {filename: "other.txt"}, {content_type: "application/pdf"},
     {byte_size: 13}, {sha256: "b" * 64}].each do |change|
      assert_equal({"code" => "operation_mismatch"}, reserve(**change))
    end
    assert_equal({"code" => "operation_mismatch"}, finalize(token: SecureRandom.uuid))
    assert_equal({"code" => "operation_mismatch"}, finalize(request_digest: "a" * 64))
    assert_equal before, stage_rows
    assert_equal({"code" => "attachment_slot_occupied"}, reserve(operation: SecureRandom.uuid))
    finalize
    assert_equal({"code" => "attachment_slot_occupied"}, reserve(operation: SecureRandom.uuid))
    assert_equal 1, stage_rows.length
  end

  def test_missing_foreign_and_consumed_drafts_cannot_reserve_or_finalize
    assert_equal({"code" => "not_available"}, reserve(draft: SecureRandom.uuid))
    assert_equal({"code" => "not_available"}, finalize)
    @admin.exec_params("UPDATE app.drafts SET actor_id=$1 WHERE id=$2", [SecureRandom.uuid, @draft])
    assert_equal({"code" => "not_available"}, reserve)
    assert_equal({"code" => "not_available"}, attachment_list)
    @admin.exec_params("UPDATE app.drafts SET actor_id=$1 WHERE id=$2", [@user, @draft])
    reserve
    @admin.exec_params("UPDATE app.drafts SET state='consumed' WHERE id=$1", [@draft])
    assert_equal({"code" => "draft_consumed"}, reserve)
    assert_equal({"code" => "draft_consumed"}, finalize)
    assert_nil scan_row
    assert_equal "reserved", stage_rows.fetch(0).fetch("stage_state")
  end

  def test_revocation_between_reservation_and_finalization_keeps_private_quarantine
    reserve
    before = stage_rows
    fixture_change do
      @admin.exec_params("UPDATE app.mailbox_memberships SET compose=false WHERE organization_id=$1 AND mailbox_id=$2 AND user_id=$3", [@org, @box, @user])
    end
    assert_equal({"code" => "not_available"}, reserve)
    assert_equal({"code" => "not_available"}, finalize)
    assert_equal({"code" => "not_available"}, attachment_list)
    assert_equal before, stage_rows
    assert_nil scan_row
  end

  def test_nulls_invalid_names_types_hashes_and_size_limits_fail_before_reserving
    %i[mailbox draft operation request_digest attachment token filename content_type byte_size sha256].each do |field|
      assert_equal({"code" => "request_invalid"}, reserve(**{field => nil}), field.to_s)
    end
    [{filename: ""}, {filename: "../escape"}, {filename: "a\\b"}, {filename: "a\nb"}, {filename: "a" * 256},
     {filename: "."}, {filename: " proof.txt"}, {content_type: "text/html"}, {sha256: "E" * 64},
     {request_digest: "d" * 63}, {byte_size: 0}, {byte_size: 1_048_577}].each do |change|
      assert_equal({"code" => "request_invalid"}, reserve(**change))
    end
    assert_empty stage_rows
    assert_equal "reserved", reserve(byte_size: 1_048_576, filename: "x" * 255).fetch("stage_state")
  end

  def test_api_and_worker_cannot_bypass_guard_or_directly_read_private_ledger
    begin_write
    assert_raises(PG::InsufficientPrivilege) { reserve_sql }
    @api.exec("ROLLBACK")
    [@api, @worker].each do |connection|
      assert_raises(PG::InsufficientPrivilege) { connection.exec("SELECT * FROM app_drafts_private.attachment_stage_operations") }
      assert_raises(PG::InsufficientPrivilege) { connection.exec("UPDATE app.draft_attachments SET scan_status='clean'") }
    end
    assert_raises(PG::InsufficientPrivilege) { @api.exec("SELECT * FROM app.due_draft_attachment_scans(1)") }
    assert_raises(PG::InsufficientPrivilege) { reserve_sql(connection: @worker) }
    reserve
    begin_write
    assert_raises(PG::InsufficientPrivilege) { finalize_sql }
    @api.exec("ROLLBACK")
    %w[app.draft_attachments app_drafts_private.attachment_stage_operations].each do |table|
      assert_equal({"relrowsecurity" => "t", "relforcerowsecurity" => "t"},
        @admin.exec_params("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid=$1::regclass", [table]).first)
    end
  end
end
