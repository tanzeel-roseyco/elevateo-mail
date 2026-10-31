# frozen_string_literal: true

require_relative "../sends/approval_database_helper"

# AIDEV-NOTE: Existing parent rows with mismatched identities must fail, not only completely missing UUIDs.
class SchemaRelationshipDatabaseTest < SendDatabaseTestCase
  def test_reconciliation_cannot_attach_another_sends_attempt
    first = approve.fetch("send_id")
    @draft, @operation = SecureRandom.uuid, SecureRandom.uuid
    assert_equal 1, save(payload(subject: @saved.subject, body_text: @saved.body_text,
      to: [{ "display_name" => nil, "address" => "Recipient@example.invalid" }])).fetch("version")
    bytes = snapshot
    second = approve(bytes: bytes, review_digest: Digest::SHA256.hexdigest(bytes)).fetch("send_id")
    attempt = SecureRandom.uuid
    @admin.exec("BEGIN")
    @admin.exec_params(<<~SQL, [first, attempt])
      INSERT INTO app_send_private.attempts(send_id,attempt_no,attempt_id,lease_generation,
        authorized_at,call_deadline_at,capability_hash,profile)
      VALUES($1,1,$2,1,now(),now()+interval '1 minute',decode(repeat('a',64),'hex'),'none')
    SQL
    @admin.exec("SAVEPOINT invalid_attempt")
    error = assert_raises(PG::ForeignKeyViolation) do
      @admin.exec_params(<<~SQL, [SecureRandom.uuid, second, attempt])
        INSERT INTO app_send_private.reconciliation_checks(check_id,send_id,attempt_id,lease_generation,evidence_digest,checked_at)
        VALUES($1,$2,$3,1,decode(repeat('a',64),'hex'),now())
      SQL
    end
    assert_equal "reconciliation_attempt_identity_fk", error.result.error_field(PG::Result::PG_DIAG_CONSTRAINT_NAME)
    @admin.exec("ROLLBACK TO SAVEPOINT invalid_attempt")
    @admin.exec_params(<<~SQL, [SecureRandom.uuid, first, attempt])
      INSERT INTO app_send_private.reconciliation_checks(check_id,send_id,attempt_id,lease_generation,evidence_digest,checked_at)
      VALUES($1,$2,$3,1,decode(repeat('a',64),'hex'),now())
    SQL
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end

  def test_marketing_enrollment_rejects_existing_send_for_another_draft
    send_id = approve.fetch("send_id")
    other_draft, campaign, lead, run = Array.new(4) { SecureRandom.uuid }
    assert_equal 1, save(payload(draft: other_draft, operation_id: SecureRandom.uuid)).fetch("version")
    @admin.exec("BEGIN")
    @admin.exec_params("INSERT INTO app.campaigns(id,organization_id,name,operation_id,creation_fingerprint) VALUES($1,$2,'Integrity',$1,repeat('a',64))", [campaign, @org])
    @admin.exec_params("INSERT INTO app.campaign_leads(id,organization_id,campaign_id,email,operation_id,creation_fingerprint) VALUES($1,$2,$3,'recipient@example.invalid',$1,repeat('a',64))", [lead, @org, campaign])
    @admin.exec_params(<<~SQL, [run, @org, campaign, @box, @user])
      INSERT INTO app.marketing_runs(id,organization_id,campaign_id,mailbox_id,actor_id,operation_id,request_digest,subject,body_text,simulated)
      VALUES($1,$2,$3,$4,$5,$1,repeat('a',64),'Subject','Body',true)
    SQL
    @admin.exec("SAVEPOINT invalid_enrollment")
    error = assert_raises(PG::ForeignKeyViolation) do
      @admin.exec_params(<<~SQL, [@org, run, lead, other_draft, send_id])
        INSERT INTO app.marketing_enrollments(organization_id,run_id,lead_id,draft_id,email,send_id)
        VALUES($1,$2,$3,$4,'recipient@example.invalid',$5)
      SQL
    end
    assert_equal "enrollment_intent_identity_fk", error.result.error_field(PG::Result::PG_DIAG_CONSTRAINT_NAME)
    @admin.exec("ROLLBACK TO SAVEPOINT invalid_enrollment")
    @admin.exec_params(<<~SQL, [@org, run, lead, @draft, send_id])
      INSERT INTO app.marketing_enrollments(organization_id,run_id,lead_id,draft_id,email,send_id)
      VALUES($1,$2,$3,$4,'recipient@example.invalid',$5)
    SQL
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end

  def test_imap_receipt_cannot_claim_another_mailboxs_account
    account, other_box, thread, message = Array.new(4) { SecureRandom.uuid }
    @admin.exec("BEGIN")
    @admin.exec_params("INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES($1,$2,$3,'private')", [other_box, @org, "#{other_box}@example.invalid"])
    @admin.exec_params("INSERT INTO app.threads(id,organization_id,mailbox_id) VALUES($1,$2,$3)", [thread, @org, @box])
    @admin.exec_params("INSERT INTO app.messages(id,organization_id,mailbox_id,thread_id) VALUES($1,$2,$3,$4)", [message, @org, @box, thread])
    @admin.exec_params(<<~SQL, [account, @org, other_box])
      INSERT INTO app.inbound_imap_accounts(id,organization_id,mailbox_id,credential_ref,credential_version)
      VALUES($1,$2,$3,'test:fixture',1)
    SQL
    @admin.exec("SAVEPOINT invalid_receipt_account")
    error = assert_raises(PG::ForeignKeyViolation) do
      @admin.exec_params(<<~SQL, [account, @org, @box, thread, message])
        INSERT INTO app.inbound_imap_receipts(account_id,organization_id,mailbox_id,uidvalidity,uid,content_sha256,thread_id,message_id)
        VALUES($1,$2,$3,1,1,repeat('a',64),$4,$5)
      SQL
    end
    assert_equal "imap_receipt_account_identity_fk", error.result.error_field(PG::Result::PG_DIAG_CONSTRAINT_NAME)
    @admin.exec("ROLLBACK TO SAVEPOINT invalid_receipt_account")
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET mailbox_id=$2 WHERE id=$1", [account, @box])
    @admin.exec_params(<<~SQL, [account, @org, @box, thread, message])
      INSERT INTO app.inbound_imap_receipts(account_id,organization_id,mailbox_id,uidvalidity,uid,content_sha256,thread_id,message_id)
      VALUES($1,$2,$3,1,1,repeat('a',64),$4,$5)
    SQL
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end
  def test_imap_rejection_cannot_claim_another_mailboxs_account
    account, other_box = SecureRandom.uuid, SecureRandom.uuid
    @admin.exec("BEGIN")
    @admin.exec_params("INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES($1,$2,$3,'private')", [other_box, @org, "#{other_box}@example.invalid"])
    @admin.exec_params(<<~SQL, [account, @org, @box])
      INSERT INTO app.inbound_imap_accounts(id,organization_id,mailbox_id,credential_ref,credential_version)
      VALUES($1,$2,$3,'test:fixture',1)
    SQL
    @admin.exec("SAVEPOINT invalid_account")
    error = assert_raises(PG::ForeignKeyViolation) do
      @admin.exec_params(<<~SQL, [account, @org, other_box])
        INSERT INTO app.inbound_imap_rejections(account_id,organization_id,mailbox_id,uidvalidity,uid,content_sha256,reason)
        VALUES($1,$2,$3,1,1,repeat('a',64),'invalid_mime')
      SQL
    end
    assert_equal "imap_rejection_account_identity_fk", error.result.error_field(PG::Result::PG_DIAG_CONSTRAINT_NAME)
    @admin.exec("ROLLBACK TO SAVEPOINT invalid_account")
    @admin.exec_params(<<~SQL, [account, @org, @box])
      INSERT INTO app.inbound_imap_rejections(account_id,organization_id,mailbox_id,uidvalidity,uid,content_sha256,reason)
      VALUES($1,$2,$3,1,1,repeat('a',64),'invalid_mime')
    SQL
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end
end
