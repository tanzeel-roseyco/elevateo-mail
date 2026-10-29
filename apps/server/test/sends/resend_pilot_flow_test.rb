# frozen_string_literal: true

require "tmpdir"
require "active_record"
require_relative "approval_database_helper"
require_relative "../support/send_budgets"
require_relative "../support/resend_http_stub"
require_relative "../../lib/elevateo/send_api/review"
require_relative "../../lib/elevateo/send_worker/database_store"
require_relative "../../lib/elevateo/send_worker/executor"
require_relative "../../lib/elevateo/send_worker/resend_transport"
require_relative "../../lib/elevateo/resend_events/store"

# AIDEV-NOTE: Real API/worker roles connect consent and immutable approval to actual HTTP bytes in disposable Docker.
class ResendPilotFlowTest < SendDatabaseTestCase
  include SendBudgetFixture

  def setup
    super
    create_send_budgets(sender: "#{@box}@example.invalid")
  end

  def teardown
    @stub&.close
    @admin.exec_params("DELETE FROM app.resend_webhook_events WHERE event_id=$1", [@event_id]) if @event_id
  ensure
    if @admin && @org
      @admin.exec_params("DELETE FROM app_send_private.resend_acceptance WHERE attempt_id IN (SELECT attempt_id FROM app_send_private.attempts WHERE send_id IN (SELECT send_id FROM app_send_private.intents WHERE organization_id=$1))", [@org])
      @admin.exec_params("DELETE FROM app_send_private.resend_delivery WHERE send_id IN (SELECT send_id FROM app_send_private.intents WHERE organization_id=$1)", [@org])
    end
    super
  end

  def test_live_approval_requires_consent_then_submits_exact_approved_message
    missing = Elevateo::SendAPI::Review.new(review, outbound_mode: "resend")
    refute missing.result.fetch("ready")
    assert_includes missing.result.fetch("issues").map { |issue| issue.fetch("code") }, "consent_required"
    assert_equal "consent_required", approve.fetch("code")
    assert_equal 0, counts.first
    grant_consent
    approved = approve_live
    @provider_id = SecureRandom.uuid
    @stub = ResendHTTPStub.new(body: JSON.generate(id: @provider_id))
    assert_equal :accepted, execute(approved.fetch("send_id"))
    assert_equal 1, @stub.requests.length
    request = @stub.requests.first
    assert_equal "POST /emails HTTP/1.1\r\n", request.fetch(:line)
    assert_equal "Bearer re_disposable_fixture", request.fetch(:headers).fetch("authorization")
    assert_equal({ "from" => "#{@box}@example.invalid", "to" => ["Recipient@example.invalid"],
      "subject" => @saved.subject, "text" => @saved.body_text, "attachments" => [],
      "headers" => { "Message-ID" => "<elevateo.#{approved.fetch('send_id')}@example.invalid>" },
      "tags" => [{ "name" => "send_id", "value" => approved.fetch("send_id") },
        { "name" => "attempt_id", "value" => JSON.parse(request.fetch(:body)).fetch("tags").last.fetch("value") }] }, JSON.parse(request.fetch(:body)))
    attempt = @admin.exec_params("SELECT attempt_id::text,profile FROM app_send_private.attempts WHERE send_id=$1", [approved.fetch("send_id")]).first
    assert_equal "resend-v1", attempt.fetch("profile")
    assert_equal "elevateo/#{approved.fetch('send_id')}", request.fetch(:headers).fetch("idempotency-key")
    assert_equal attempt.fetch("attempt_id"), JSON.parse(request.fetch(:body)).fetch("tags").last.fetch("value")
    assert_equal 1, status(approved.fetch("send_id")).fetch("attempts")
    assert_signed_suppression_replay(approved.fetch("send_id"))
  end

  def test_ambiguous_provider_response_survives_worker_restart_without_resubmission
    grant_consent
    send_id = approve_live.fetch("send_id")
    @stub = ResendHTTPStub.new(status: 503, body: "{}")
    assert_equal :unknown, execute(send_id)
    @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp() WHERE send_id=$1", [send_id])
    assert_equal :unknown, execute(send_id)
    assert_equal 1, @stub.requests.length
    assert_equal 1, status(send_id).fetch("attempts")
  end

  def test_signed_complaint_projects_delivery_and_suppresses_recipient
    grant_consent
    send_id = approve_live.fetch("send_id")
    @provider_id = SecureRandom.uuid
    @stub = ResendHTTPStub.new(body: JSON.generate(id: @provider_id))
    assert_equal :accepted, execute(send_id)
    assert_signed_suppression_replay(send_id, event_type: "email.complained", delivery_status: "complained")
  end

  def test_revoked_approval_session_prevents_provider_io
    grant_consent
    send_id = approve_live.fetch("send_id")
    @stub = ResendHTTPStub.new(body: JSON.generate(id: "unused_fixture"))
    @admin.exec_params("UPDATE app_auth.sessions SET state='revoked',revoked_at=clock_timestamp() WHERE cookie_digest=$1", [@digest])
    assert_equal :held, execute(send_id)
    assert_empty @stub.requests
  end

  def test_pending_attachment_blocks_approval_then_clean_bytes_are_sent
    grant_consent
    attachment, operation, token = Array.new(3) { SecureRandom.uuid }
    content = "pilot evidence"
    sha = Digest::SHA256.hexdigest(content)
    begin_write
    assert_equal "ok", write_guard.fetch("status")
    values = [@digest, @box, @draft, operation, "a" * 64, attachment, token, "proof.txt", "text/plain", content.bytesize, sha]
    reserved = JSON.parse(@api.exec_params(<<~SQL, values).getvalue(0, 0))
      SELECT app.reserve_draft_attachment($1::text,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::uuid,
        $8::text,$9::text,$10::integer,$11::text)
    SQL
    assert_equal "reserved", reserved.fetch("stage_state")
    @api.exec("COMMIT")
    begin_write
    assert_equal "ok", write_guard.fetch("status")
    finalized = JSON.parse(@api.exec_params(<<~SQL, [@digest, @box, @draft, operation, "a" * 64, token]).getvalue(0, 0))
      SELECT app.finalize_draft_attachment($1::text,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid)
    SQL
    assert_equal "committed", finalized.fetch("stage_state")
    @api.exec("COMMIT")
    refute Elevateo::SendAPI::Review.new(review, outbound_mode: "resend").result.fetch("ready")
    assert_equal "send_not_ready", approve.fetch("code")
    # AIDEV-NOTE: Rejected approval operations are immutable; clean review starts a fresh operation.
    @operation = SecureRandom.uuid
    scan_token = SecureRandom.uuid
    claimed = @worker.exec_params("SELECT * FROM app.claim_draft_attachment_scan($1::uuid,$2::uuid)", [attachment, scan_token]).first
    assert_equal sha, claimed.fetch("sha256")
    assert_equal "t", @worker.exec_params(<<~SQL, [attachment, sha, scan_token, claimed.fetch("scan_attempt")]).getvalue(0, 0)
      SELECT app.record_draft_attachment_scan($1::uuid,$2::text,$3::uuid,$4::integer,'clean')
    SQL
    reviewed = Elevateo::SendAPI::Review.new(review, outbound_mode: "resend")
    assert reviewed.result.fetch("ready"), reviewed.result.fetch("issues").inspect
    assert_equal "elevateo.send.snapshot.v2", JSON.parse(reviewed.snapshot).first
    send_id = approve(bytes: reviewed.snapshot, review_digest: reviewed.result.fetch("review_digest")).fetch("send_id")
    storage = Object.new
    expected_key = "drafts/#{@org}/#{attachment}"
    storage.define_singleton_method(:get) { |key| raise "wrong immutable key" unless key == expected_key; content }
    @stub = ResendHTTPStub.new(body: JSON.generate(id: SecureRandom.uuid))
    assert_equal :accepted, execute(send_id, storage: storage)
    assert_equal [{ "filename" => "proof.txt", "content_type" => "text/plain", "content" => Base64.strict_encode64(content) }],
      JSON.parse(@stub.requests.fetch(0).fetch(:body)).fetch("attachments")
  end

  def test_approval_consent_lock_blocks_withdrawal_until_commit
    grant_consent
    operation = SecureRandom.uuid
    @admin.exec_params(<<~SQL, [@org, operation, @user])
      INSERT INTO app.campaign_consent_events(organization_id,campaign_id,lead_id,operation_id,actor_id,
        email,lead_version,status,evidence_kind)
        SELECT organization_id,campaign_id,id,$2,$3,email,3,'withdrawn','status_change'
        FROM app.campaign_leads WHERE organization_id=$1
    SQL
    connection = connect("BE02_ADMIN_DATABASE_URL", "supabase_admin")
    reviewed = Elevateo::SendAPI::Review.new(review, outbound_mode: "resend")
    begin_write
    assert_equal "ok", write_guard.fetch("status")
    result = approve_sql(bytes: reviewed.snapshot, review_digest: reviewed.result.fetch("review_digest"))
    assert result.key?("send_id"), result.inspect
    withdrawal = Thread.new do
      connection.exec_params(<<~SQL, [@org, operation])
        UPDATE app.campaign_leads SET consent_status='withdrawn',consent_operation_id=$2,
          consent_source=NULL,consent_recorded_at=NULL,consent_recorded_by=NULL,version=3 WHERE organization_id=$1
      SQL
    end
    withdrawal.report_on_exception = false
    wait_for_lock(connection, blocker: @api.backend_pid, lock_kind: "transactionid", seconds: 0.7)
    @api.exec("COMMIT")
    assert_equal 1, withdrawal.value.cmd_tuples
  ensure
    @api.exec("ROLLBACK") if @api && @api.transaction_status != PG::PQTRANS_IDLE
    withdrawal&.join(3)
    connection&.close
  end

  def test_send_owner_can_lock_consent_but_cannot_mutate_it
    grant_consent
    # AIDEV-NOTE: Isolate RLS from the earlier version trigger; rollback restores the trigger before teardown.
    @admin.exec("BEGIN; ALTER TABLE app.campaign_leads DISABLE TRIGGER campaign_lead_update_guard; SET LOCAL ROLE elevateo_send_owner")
    assert_equal 1, @admin.exec_params("SELECT email FROM app.campaign_leads WHERE organization_id=$1 FOR SHARE", [@org]).ntuples
    assert_raises(PG::InsufficientPrivilege) do
      @admin.exec_params("UPDATE app.campaign_leads SET email=email WHERE organization_id=$1", [@org])
    end
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end

  private

  def prepare_organization_fixture_cleanup
    if @admin && @org
      @admin.exec_params("DELETE FROM app.draft_attachments WHERE organization_id=$1", [@org])
      @admin.exec_params("DELETE FROM app_drafts_private.attachment_stage_operations WHERE organization_id=$1", [@org])
    end
    super
  end

  def event_store(connection)
    # AIDEV-NOTE: Adapt only ActiveRecord's bind wrapper; every query still executes through the restricted PG login.
    adapter = Object.new
    adapter.define_singleton_method(:exec_query) do |sql, _name, binds|
      connection.exec_params(sql, binds.map(&:value_for_database)).to_a
    end
    Elevateo::ResendEvents::Store.new(connection: adapter)
  end

  # AIDEV-NOTE: Both negative delivery events must survive signed intake and suppress only once on replay.
  def assert_signed_suppression_replay(send_id, event_type: "email.bounced", delivery_status: "bounced")
    @event_id = "msg_#{SecureRandom.hex(12)}"
    body = JSON.generate(type: event_type, created_at: Time.now.utc.iso8601,
      data: { email_id: @provider_id, from: "#{@box}@example.invalid", to: ["Recipient@example.invalid"] })
    key = "disposable-signing-fixture-32-byte"
    timestamp = Time.now.to_i.to_s
    signature = Base64.strict_encode64(OpenSSL::HMAC.digest("SHA256", key, "#{@event_id}.#{timestamp}.#{body}"))
    verifier = Elevateo::ResendEvents::Signature.new(secret: "whsec_#{Base64.strict_encode64(key)}")
    assert_raises(Elevateo::ResendEvents::Invalid) do
      verifier.verify(body: body + " ", id: @event_id, timestamp: timestamp, signatures: "v1,#{signature}")
    end
    verifier.verify(body: body, id: @event_id, timestamp: timestamp, signatures: "v1,#{signature}")
    intake = event_store(@api)
    worker = event_store(@worker)
    assert_equal "stored", intake.receive(id: @event_id, body: body).fetch("result")
    claim = worker.claim
    assert_equal @event_id, claim.fetch("id")
    assert_equal "processed", worker.apply(id: @event_id, lease: claim.fetch("lease")).fetch("result")
    assert_equal delivery_status, status(send_id).fetch("delivery_status")
    assert_equal "stored", intake.receive(id: @event_id, body: body).fetch("result")
    assert_equal "empty", worker.claim.fetch("result")
    assert_equal "1", @admin.exec_params(<<~SQL, [@org]).getvalue(0, 0)
      SELECT count(*) FROM app_send_private.recipient_suppressions
        WHERE organization_id=$1 AND canonical_address='Recipient@example.invalid'
    SQL
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

  def execute(send_id, storage: nil)
    transport = Elevateo::SendWorker::ResendTransport.new(api_key: "re_disposable_fixture",
      from_domain: "example.invalid", http_factory: @stub.method(:client), attachment_storage: storage)
    Dir.mktmpdir("resend-pilot-control-") do |dir|
      path = File.join(dir, "control.json")
      File.write(path, JSON.generate(epoch: @epoch, outbound_held: false))
      control = Elevateo::SendWorker::Control.new(path: path)
      store = Elevateo::SendWorker::DatabaseStore.new(connection: @worker, send_id: send_id, profile: "resend-v1")
      Elevateo::SendWorker::Executor.new(store: store, driver: transport, control: control).run_once
    end
  end
end
