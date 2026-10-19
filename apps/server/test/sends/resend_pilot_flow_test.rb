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
      "subject" => @saved.subject, "text" => @saved.body_text }, JSON.parse(request.fetch(:body)))
    attempt = @admin.exec_params("SELECT attempt_id::text,profile FROM app_send_private.attempts WHERE send_id=$1", [approved.fetch("send_id")]).first
    assert_equal "resend-v1", attempt.fetch("profile")
    assert_equal attempt.fetch("attempt_id"), request.fetch(:headers).fetch("idempotency-key")
    assert_equal 1, status(approved.fetch("send_id")).fetch("attempts")
    assert_signed_bounce_replay(approved.fetch("send_id"))
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

  def test_revoked_approval_session_prevents_provider_io
    grant_consent
    send_id = approve_live.fetch("send_id")
    @stub = ResendHTTPStub.new(body: JSON.generate(id: "unused_fixture"))
    @admin.exec_params("UPDATE app_auth.sessions SET state='revoked',revoked_at=clock_timestamp() WHERE cookie_digest=$1", [@digest])
    assert_equal :held, execute(send_id)
    assert_empty @stub.requests
  end

  private

  def event_store(connection)
    # AIDEV-NOTE: Adapt only ActiveRecord's bind wrapper; every query still executes through the restricted PG login.
    adapter = Object.new
    adapter.define_singleton_method(:exec_query) do |sql, _name, binds|
      connection.exec_params(sql, binds.map(&:value_for_database)).to_a
    end
    Elevateo::ResendEvents::Store.new(connection: adapter)
  end

  def assert_signed_bounce_replay(send_id)
    @event_id = "msg_#{SecureRandom.hex(12)}"
    body = JSON.generate(type: "email.bounced", created_at: Time.now.utc.iso8601,
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
    assert_equal "bounced", status(send_id).fetch("delivery_state")
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

  def execute(send_id)
    transport = Elevateo::SendWorker::ResendTransport.new(api_key: "re_disposable_fixture",
      from_domain: "example.invalid", http_factory: @stub.method(:client))
    Dir.mktmpdir("resend-pilot-control-") do |dir|
      path = File.join(dir, "control.json")
      File.write(path, JSON.generate(epoch: @epoch, outbound_held: false))
      control = Elevateo::SendWorker::Control.new(path: path)
      store = Elevateo::SendWorker::DatabaseStore.new(connection: @worker, send_id: send_id, profile: "resend-v1")
      Elevateo::SendWorker::Executor.new(store: store, driver: transport, control: control).run_once
    end
  end
end
