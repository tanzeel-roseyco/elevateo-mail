# frozen_string_literal: true

require_relative "../be_02/draft_database_test_helper"
require "digest"

class MailIdentityDatabaseTest < DraftDatabaseTestCase
  # AIDEV-NOTE: Actual worker/API roles prove immutable identity survives replay without opening table access.
  IDENTITY = "<original@example.invalid>"

  def setup
    super
    @account = SecureRandom.uuid
    @admin.exec_params(<<~SQL, [@account, @org, @box])
      INSERT INTO app.inbound_imap_accounts(id,organization_id,mailbox_id,credential_ref,credential_version,active)
      VALUES($1,$2,$3,'test:synthetic-only',1,true)
    SQL
  end

  def teardown
    if @admin && @account
      @admin.exec_params("DELETE FROM app.inbound_imap_receipts WHERE account_id=$1", [@account])
      @admin.exec_params("DELETE FROM app.inbound_imap_accounts WHERE id=$1", [@account])
    end
    super
  end

  def ingest(identity: IDENTITY, connection: @worker, lease: nil)
    values = [@account, Digest::SHA256.hexdigest("body"),
      JSON.generate("display_name" => nil, "address" => "sender@example.invalid"),
      JSON.generate([{ "display_name" => nil, "address" => "inbox@example.invalid" }]), identity, lease]
    JSON.parse(connection.exec_params(<<~SQL, values).getvalue(0, 0))
      SELECT app.ingest_imap_mail_with_identity($1::uuid,1,42,1,$2::text,$3::jsonb,$4::jsonb,
        'Subject','body','[]'::jsonb,$5::text,$6::uuid)
    SQL
  end

  def stored_identity(message_id)
    @admin.exec_params("SELECT rfc_message_id FROM app.messages WHERE id=$1", [message_id]).getvalue(0, 0)
  end

  def test_import_and_replay_restore_tenant_context_and_preserve_identity
    first = ingest
    assert_equal "created", first.fetch("result")
    assert_equal IDENTITY, stored_identity(first.fetch("message_id"))
    @worker.exec_params("SELECT set_config('app.org_id',$1,false)", [SecureRandom.uuid])
    assert_equal "duplicate", ingest.fetch("result")
    assert_equal IDENTITY, stored_identity(first.fetch("message_id"))
    assert_raises(PG::CheckViolation) { ingest(identity: "<changed@example.invalid>") }
    assert_equal IDENTITY, stored_identity(first.fetch("message_id"))
  end

  def test_invalid_identity_and_api_role_cannot_create_receipts
    [nil, "", "<a@>", "<a@example.invalid>\r\nBcc: hidden@example.invalid"].each do |value|
      assert_raises(PG::InvalidParameterValue) { ingest(identity: value) }
    end
    assert_raises(PG::InsufficientPrivilege) { ingest(connection: @api) }
    assert_equal "0", @admin.exec_params(
      "SELECT count(*) FROM app.inbound_imap_receipts WHERE account_id=$1", [@account]).getvalue(0, 0)
  end

  def test_polling_lease_and_revoked_account_remain_required
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_enabled=true WHERE id=$1", [@account])
    assert_raises(PG::InsufficientPrivilege) { ingest }
    assert_raises(PG::InsufficientPrivilege) { ingest(lease: SecureRandom.uuid) }
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_enabled=false,active=false WHERE id=$1", [@account])
    assert_raises(PG::InsufficientPrivilege) { ingest }
  end
end
