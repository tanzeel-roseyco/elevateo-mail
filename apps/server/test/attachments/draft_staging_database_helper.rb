# frozen_string_literal: true

require_relative "../be_02/draft_database_test_helper"

# AIDEV-NOTE: Actual API/worker logins exercise staging; only fixture setup and exact cleanup use admin authority.
class DraftStagingDatabaseTestCase < DraftDatabaseTestCase
  def setup
    super
    assert_equal 1, save.fetch("version")
    @stage_operation, @attachment, @reservation = Array.new(3) { SecureRandom.uuid }
    @stage_digest = "d" * 64
    @bytes_digest = "e" * 64
  end

  def prepare_organization_fixture_cleanup
    if @admin && @org
      @admin.exec_params("DELETE FROM app.draft_attachments WHERE organization_id=$1", [@org])
      @admin.exec_params("DELETE FROM app_drafts_private.attachment_stage_operations WHERE organization_id=$1", [@org])
    end
    super
  end

  def reserve_values(**changes)
    {session_digest: @digest, mailbox: @box, draft: @draft, operation: @stage_operation,
     request_digest: @stage_digest, attachment: @attachment, token: @reservation,
     filename: "proof.txt", content_type: "text/plain", byte_size: 12, sha256: @bytes_digest}.merge(changes).values
  end

  def reserve_sql(connection: @api, **changes)
    JSON.parse(connection.exec_params(<<~SQL, reserve_values(**changes)).getvalue(0, 0))
      SELECT app.reserve_draft_attachment($1::text,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::uuid,
        $8::text,$9::text,$10::integer,$11::text)
    SQL
  end

  def stage_transaction(connection: @api)
    begin_write(connection: connection)
    assert_equal "ok", write_guard(connection: connection).fetch("status")
    result = yield
    connection.exec("COMMIT")
    result
  ensure
    connection.exec("ROLLBACK") if connection && !connection.finished? && connection.transaction_status != PG::PQTRANS_IDLE
  end

  def reserve(connection: @api, **changes)
    stage_transaction(connection: connection) { reserve_sql(connection: connection, **changes) }
  end

  def finalize_sql(connection: @api, **changes)
    values = {session_digest: @digest, mailbox: @box, draft: @draft, operation: @stage_operation,
              request_digest: @stage_digest, token: @reservation}.merge(changes).values
    JSON.parse(connection.exec_params(<<~SQL, values).getvalue(0, 0))
      SELECT app.finalize_draft_attachment($1::text,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid)
    SQL
  end

  def finalize(**changes)
    stage_transaction { finalize_sql(**changes) }
  end

  def attachment_list(draft: @draft)
    begin_write
    JSON.parse(@api.exec_params("SELECT app.list_draft_attachments($1::uuid,$2::uuid)", [@box, draft]).getvalue(0, 0))
  ensure
    @api.exec("ROLLBACK") if @api && @api.transaction_status != PG::PQTRANS_IDLE
  end

  def stage_rows
    @admin.exec_params("SELECT * FROM app_drafts_private.attachment_stage_operations WHERE organization_id=$1 ORDER BY operation_id", [@org]).to_a
  end

  def scan_row
    @admin.exec_params("SELECT * FROM app.draft_attachments WHERE id=$1", [@attachment]).first
  end

  def claim(token = SecureRandom.uuid)
    [token, @worker.exec_params("SELECT * FROM app.claim_draft_attachment_scan($1::uuid,$2::uuid)", [@attachment, token]).to_a]
  end

  def verdict(token, attempt, status, digest: @bytes_digest)
    @worker.exec_params("SELECT app.record_draft_attachment_scan($1::uuid,$2::text,$3::uuid,$4::integer,$5::text)",
      [@attachment, digest, token, attempt, status]).getvalue(0, 0)
  end
end
