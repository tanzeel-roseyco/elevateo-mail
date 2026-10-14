# frozen_string_literal: true

require_relative "../be_02/draft_database_test_helper"
require "digest"

class ImapAttachmentDatabaseTest < DraftDatabaseTestCase
  ADDRESS = JSON.generate("display_name" => nil, "address" => "sender@example.invalid")
  RECIPIENTS = JSON.generate([{ "display_name" => nil, "address" => "inbox@example.invalid" }])

  def setup
    super
    @account = SecureRandom.uuid
    @admin.exec_params("INSERT INTO app.inbound_imap_accounts(id,organization_id,mailbox_id,credential_ref,credential_version,active) VALUES($1,$2,$3,'test:attachment',1,true)", [@account, @org, @box])
  end

  def teardown
    if @admin && @account
      @admin.exec_params("DELETE FROM app.inbound_imap_receipts WHERE account_id=$1", [@account])
      @admin.exec_params("DELETE FROM app.inbound_imap_accounts WHERE id=$1", [@account])
    end
    super
  end

  def test_attachment_binding_is_visible_and_replay_has_one_row
    first = ingest
    assert_equal "created", first.fetch("result")
    assert_equal "duplicate", ingest.fetch("result")
    rows = @admin.exec_params("SELECT organization_id,mailbox_id,thread_id,message_id,scan_status,storage_key FROM app.inbox_attachments WHERE source_account_id=$1", [@account])
    assert_equal 1, rows.ntuples
    assert_equal [@org, @box, first.fetch("thread_id"), first.fetch("message_id"), "pending_scan"],
      rows[0].values_at("organization_id", "mailbox_id", "thread_id", "message_id", "scan_status")
    assert_equal "quarantine/imap/#{@account}/42/1/0", rows[0].fetch("storage_key")
  end

  def test_invalid_handle_rolls_back_receipt_message_and_cursor
    assert_raises(PG::InvalidParameterValue) { ingest(storage_key: "quarantine/imap/other/42/1/0") }
    assert_equal "0", @admin.exec_params("SELECT last_uid FROM app.inbound_imap_accounts WHERE id=$1", [@account]).getvalue(0, 0)
    assert_equal 0, @admin.exec_params("SELECT count(*) FROM app.inbound_imap_receipts WHERE account_id=$1", [@account]).getvalue(0, 0).to_i
    assert_equal "created", ingest.fetch("result")
  end

  def test_worker_scope_and_cross_account_handle_rejected
    other = SecureRandom.uuid
    assert_raises(PG::InvalidParameterValue) { ingest(storage_key: "quarantine/imap/#{other}/42/1/0") }
    assert_raises(PG::InsufficientPrivilege) do
      @api.exec("SELECT app.ingest_imap_mail_with_attachments(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)")
    end
  end

  private

  def ingest(storage_key: "quarantine/imap/#{@account}/42/1/0")
    handles = [{ ordinal: 0, storage_key: storage_key, filename: "report.pdf", content_type: "application/pdf",
      byte_size: 4, sha256: Digest::SHA256.hexdigest("data") }]
    values = [@account, 1, 42, 1, Digest::SHA256.hexdigest("mime"), ADDRESS, RECIPIENTS, "Subject", "body", JSON.generate(handles)]
    JSON.parse(@worker.exec_params(<<~SQL, values).getvalue(0, 0))
      SELECT app.ingest_imap_mail_with_attachments($1::uuid,$2::integer,$3::bigint,$4::bigint,$5::text,
        $6::jsonb,$7::jsonb,$8::text,$9::text,$10::jsonb)
    SQL
  end
end
