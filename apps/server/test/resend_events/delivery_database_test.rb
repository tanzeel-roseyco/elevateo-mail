# frozen_string_literal: true
require_relative "../sends/approval_database_helper"
require_relative "../support/send_budgets"
require_relative "../../lib/elevateo/send_api/review"
require_relative "../../lib/elevateo/send_worker/database_store"

class ResendDeliveryDatabaseTest < SendDatabaseTestCase
  include SendBudgetFixture
  def setup
    super
    @events = []
    grant_consent
    create_send_budgets(sender: "#{@box}@example.invalid", destination_domains: ["example.invalid"])
  end
  def teardown
    if @admin && @org
      @admin.exec_params("DELETE FROM app_send_private.resend_acceptance WHERE attempt_id IN (SELECT attempt_id FROM app_send_private.attempts WHERE send_id IN (SELECT send_id FROM app_send_private.intents WHERE organization_id=$1))", [@org])
      @admin.exec_params("DELETE FROM app_send_private.resend_delivery WHERE send_id IN (SELECT send_id FROM app_send_private.intents WHERE organization_id=$1)", [@org])
      (@events || []).each { |id| @admin.exec_params("DELETE FROM app.resend_webhook_events WHERE event_id=$1", [id]) }
    end
    super
  end
  def approve_sql(connection: @api, operation: @operation, version: 1, review_digest: @review_digest,
    bytes: @bytes, epoch: @epoch, digest: @digest)
    JSON.parse(connection.exec_params(<<~SQL, [digest, @box, @draft, operation, version, review_digest, bytes.unpack1("H*"), epoch]).getvalue(0, 0))
      SELECT app.approve_draft_send($1::text,$2::uuid,$3::uuid,$4::uuid,$5::integer,$6::text,
        decode($7::text,'hex'),$8::uuid,'resend'::text)
    SQL
  end

  def approve_live
    reviewed = Elevateo::SendAPI::Review.new(review, outbound_mode: "resend")
    assert reviewed.result.fetch("ready"), reviewed.result.fetch("issues").inspect
    refute reviewed.result.fetch("simulated")
    approve(bytes: reviewed.snapshot, review_digest: reviewed.result.fetch("review_digest"))
  end

  def grant_consent
    campaign, lead, operation = Array.new(3) { SecureRandom.uuid }
    @admin.exec_params(<<~SQL, [campaign, @org, SecureRandom.uuid])
      INSERT INTO app.campaigns(id,organization_id,operation_id,name,creation_fingerprint)
        VALUES($1,$2,$3,'Disposable pilot',repeat('a',64))
    SQL
    @admin.exec_params(<<~SQL, [lead, @org, campaign, SecureRandom.uuid])
      INSERT INTO app.campaign_leads(id,organization_id,campaign_id,operation_id,email,creation_fingerprint)
        VALUES($1,$2,$3,$4,'Recipient@example.invalid',repeat('a',64))
    SQL
    @admin.exec_params(<<~SQL, [@org, campaign, lead, operation, @user])
      INSERT INTO app.campaign_consent_events(organization_id,campaign_id,lead_id,operation_id,actor_id,
        email,lead_version,status,evidence_kind,source,observed_at)
        VALUES($1,$2,$3,$4,$5,'Recipient@example.invalid',2,'granted','manual_attestation','Docker fixture',now())
    SQL
    @admin.exec_params(<<~SQL, [lead, operation, @user])
      UPDATE app.campaign_leads SET consent_status='granted',consent_recorded_at=now(),
        consent_source='Docker fixture',consent_recorded_by=$3,consent_operation_id=$2,version=2 WHERE id=$1
    SQL
  end

  def live_attempt
    # AIDEV-NOTE: Approval preserves local-part case; use the saved draft canonical address.
    reviewed = Elevateo::SendAPI::Review.new(review, outbound_mode: "resend")
    assert reviewed.result.fetch("ready"), reviewed.result.fetch("issues").inspect
    approved = approve(bytes: reviewed.snapshot, review_digest: reviewed.result.fetch("review_digest"))
    store = Elevateo::SendWorker::DatabaseStore.new(connection: @worker, send_id: approved.fetch("send_id"), profile: "resend-v1")
    claim = store.claim(epoch: @epoch)
    [store, claim, store.authorize_submission(claim: claim, epoch: @epoch)]
  end
  def apply_event(claim, attempt, kind, email: @email, recipient: "Recipient@example.invalid")
    id = "msg_" + SecureRandom.hex(12)
    @events << id
    body = JSON.generate(type: kind, created_at: "2026-10-17T01:00:00Z", data: {
      email_id: email, from: "#{@box}@example.invalid", to: [recipient],
      tags: { send_id: claim.send_id, attempt_id: attempt } })
    @api.exec_params("SELECT app.receive_resend_event($1,$2)", [id, body])
    lease = SecureRandom.uuid
    claimed = JSON.parse(@worker.exec_params("SELECT app.claim_resend_event($1)", [lease]).getvalue(0, 0))
    assert_equal id, claimed["id"]
    JSON.parse(@worker.exec_params("SELECT app.apply_resend_event($1,$2)", [id, lease]).getvalue(0, 0))
  end
  def test_delivery_is_distinct_from_acceptance_and_bounce_suppresses_approved_recipient
    _store, claim, authorization = live_attempt
    @email = SecureRandom.uuid
    assert_equal "processed", apply_event(claim, authorization.attempt_id, "email.bounced")["result"]
    result = status(claim.send_id)
    assert_equal "dispatching", result["state"]
    assert_equal "bounced", result["delivery_status"]
    evidence = JSON.parse(@worker.exec_params("SELECT app_send_private.resend_acceptance_evidence($1,$2)", [claim.send_id, authorization.attempt_id]).getvalue(0, 0))
    assert_equal "resend:#{@email}", evidence["receipt_ref"]
    assert_equal "1", @admin.exec_params("SELECT count(*) FROM app_send_private.recipient_suppressions WHERE organization_id=$1 AND canonical_address='Recipient@example.invalid'", [@org]).getvalue(0, 0)
    assert_equal "processed", apply_event(claim, authorization.attempt_id, "email.delivered")["result"]
    assert_equal "bounced", status(claim.send_id)["delivery_status"]
  end
  def test_unmatched_attempt_retries_and_recipient_mismatch_is_ignored
    _store, claim, authorization = live_attempt
    @email = SecureRandom.uuid
    assert_equal "pending", apply_event(claim, SecureRandom.uuid, "email.sent")["result"]
    assert_equal "ignored", apply_event(claim, authorization.attempt_id, "email.bounced", recipient: "other@example.invalid")["result"]
    assert_nil status(claim.send_id)["delivery_status"]
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app_send_private.recipient_suppressions WHERE organization_id=$1", [@org]).getvalue(0, 0)
  end
end
