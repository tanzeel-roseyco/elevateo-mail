# frozen_string_literal: true

require_relative "approval_database_helper"
require_relative "../../lib/elevateo/send_api/review"

class ReplyIdentityDatabaseTest < SendDatabaseTestCase
  IDENTITY = "<incoming@example.invalid>"

  def setup
    super
    @account = SecureRandom.uuid
    @admin.exec_params(<<~SQL, [@account, @org, @box])
      INSERT INTO app.inbound_imap_accounts(id,organization_id,mailbox_id,credential_ref,credential_version,active)
      VALUES($1,$2,$3,'test:synthetic-only',1,true)
    SQL
    values = [@account, Digest::SHA256.hexdigest("incoming"), IDENTITY]
    @imported = JSON.parse(@worker.exec_params(<<~SQL, values).getvalue(0, 0))
      SELECT app.ingest_imap_mail_with_identity($1::uuid,1,42,1,$2::text,
        '{"display_name":null,"address":"sender@example.invalid"}'::jsonb,
        '[{"display_name":null,"address":"inbox@example.invalid"}]'::jsonb,
        'Incoming','incoming','[]'::jsonb,$3::text,NULL::uuid)
    SQL
    @saved = payload(expected_version: 1, operation_id: SecureRandom.uuid,
      reply_to_thread_id: @imported.fetch("thread_id"), subject: "Reply",
      to: [{ "display_name" => nil, "address" => "sender@example.invalid" }], body_text: "Response")
    assert_equal 2, save(@saved).fetch("version")
  end

  def teardown
    if @admin && @account
      @admin.exec_params("DELETE FROM app.inbound_imap_receipts WHERE account_id=$1", [@account])
      @admin.exec_params("DELETE FROM app.inbound_imap_accounts WHERE id=$1", [@account])
    end
    super
  end

  def validate(binding, bytes)
    @admin.exec_params(<<~SQL, [JSON.generate(binding), bytes.unpack1("H*"), Digest::SHA256.hexdigest(bytes)]).getvalue(0, 0)
      SELECT app_send_private.snapshot_validation($1::jsonb,decode($2::text,'hex'),$3::text)
    SQL
  end

  def test_protected_binding_and_validator_preserve_original_mailbox_and_identity
    # AIDEV-NOTE: Real SQL binding is the authority; changing JSON after review must invalidate approval bytes.
    binding = review
    assert_equal IDENTITY, binding.fetch("reply_message_id")
    assert_equal "#{@box}@example.invalid", binding.fetch("sender_address")
    binding["consented_addresses"] = ["sender@example.invalid"]
    projection = Elevateo::SendAPI::Review.new(binding, outbound_mode: "mox")
    assert projection.result.fetch("ready")
    assert_nil validate(binding, projection.snapshot)
    changed = JSON.parse(projection.snapshot)
    changed[9][1] = "<different@example.invalid>"
    assert_equal "review_stale", validate(binding, JSON.generate(changed))
    changed = JSON.parse(projection.snapshot)
    changed[5][1] = "different@example.invalid"
    assert_equal "review_stale", validate(binding, JSON.generate(changed))
  end

  def test_foreign_mailbox_and_foreign_user_cannot_read_reply_identity
    begin_write
    unavailable = JSON.parse(@api.exec_params("SELECT app.send_review($1::uuid,$2::uuid)",
      [SecureRandom.uuid, @draft]).getvalue(0, 0))
    assert_equal({ "code" => "not_available" }, unavailable)
    @api.exec_params("SELECT set_config('app.user_id',$1,true)", [SecureRandom.uuid])
    unavailable = JSON.parse(@api.exec_params("SELECT app.send_review($1::uuid,$2::uuid)",
      [@box, @draft]).getvalue(0, 0))
    assert_equal({ "code" => "not_available" }, unavailable)
  ensure
    @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
  end
end
