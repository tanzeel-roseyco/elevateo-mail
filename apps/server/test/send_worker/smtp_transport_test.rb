# frozen_string_literal: true

require "minitest/autorun"
require "json"
require_relative "../../lib/elevateo/send_worker/smtp_transport"
require_relative "../../lib/elevateo/send_api/canonical"

class SendWorkerSmtpTransportTest < Minitest::Test
  SEND = "11111111-1111-4111-8111-111111111111"
  ATTEMPT = "22222222-2222-4222-8222-222222222222"
  SENDER = "sender@example.invalid"

  class FakeSmtp
    attr_accessor :open_timeout, :read_timeout
    attr_reader :messages

    def initialize(status: "250", failure: nil)
      @status, @failure = status, failure
      @messages = []
    end

    def start(helo)
      raise "invalid helo" unless helo == "localhost"
      yield self
    end

    def send_message(mime, sender, *recipients)
      @messages << [mime, sender, recipients]
      raise @failure if @failure
      Struct.new(:status).new(@status)
    end
  end

  def profile = Elevateo::SendWorker::SmtpProfile.local_mailpit(verified_sender: SENDER)
  def deadline = Elevateo::SendWorker::CallDeadline.new(seconds: 10.0)

  def snapshot
    Elevateo::SendAPI::Canonical.bytes(organization_id: SEND, mailbox_id: SEND, draft_id: SEND,
      version: 1, sender: SENDER, recipients: [{ "display_name" => nil, "address" => "recipient@example.invalid" }],
      subject: "Subject", body: "plain text", reply_id: nil, policy: "1")
  end

  def test_default_local_factory_disables_tls_modes_before_connecting
    client = Elevateo::SendWorker::LocalMailpitClient.new(profile: profile)
    smtp = client.instance_variable_get(:@smtp_factory).call(profile.host, profile.port)
    assert_instance_of Net::SMTP, smtp
    assert_equal false, smtp.tls?
    assert_equal false, smtp.starttls?
  end

  def test_local_mailpit_acceptance_is_simulated_and_envelope_is_exact
    smtp = FakeSmtp.new
    client = Elevateo::SendWorker::LocalMailpitClient.new(profile: profile, smtp_factory: ->(_host, _port) { smtp })
    transport = Elevateo::SendWorker::SmtpTransport.new(profile: profile, client: client)
    result = transport.submit(snapshot, send_id: SEND, attempt_id: ATTEMPT, deadline: deadline)
    assert_equal "accepted", result.kind
    assert_match(/\Amailpit-test-v1:[0-9a-f]{64}\z/, result.receipt_ref)
    assert result.simulated?
    assert_equal SENDER, smtp.messages.first[1]
    assert_equal ["recipient@example.invalid"], smtp.messages.first[2]
    assert_nil transport.observation(send_id: SEND, attempt_id: ATTEMPT, snapshot_digest: "a" * 64)
  end

  def test_lost_data_response_is_unknown_without_resubmission
    smtp = FakeSmtp.new(failure: IOError.new("lost response"))
    client = Elevateo::SendWorker::LocalMailpitClient.new(profile: profile, smtp_factory: ->(_host, _port) { smtp })
    transport = Elevateo::SendWorker::SmtpTransport.new(profile: profile, client: client)
    result = transport.submit(snapshot, send_id: SEND, attempt_id: ATTEMPT, deadline: deadline)
    assert_equal "unknown", result.kind
    assert_equal "smtp_uncertain", result.code
    assert_equal 1, smtp.messages.length
  end

  def test_invalid_snapshot_rejects_before_client_and_remote_profile_stays_held
    calls = 0
    client = Object.new
    client.define_singleton_method(:deliver) { |_mail, deadline:| deadline.check!; calls += 1 }
    transport = Elevateo::SendWorker::SmtpTransport.new(profile: profile, client: client)
    fields = JSON.parse(snapshot)
    fields[7] = "Injected\r\nBcc: bad@example.invalid"
    malformed = JSON.generate(fields)
    result = transport.submit(malformed, send_id: SEND, attempt_id: ATTEMPT, deadline: deadline)
    assert_equal "rejected", result.kind
    assert_equal "smtp_invalid_snapshot", result.code
    assert_equal 0, calls

    real_recipient = snapshot.sub("recipient@example.invalid", "recipient@example.com")
    real_result = transport.submit(real_recipient, send_id: SEND, attempt_id: ATTEMPT, deadline: deadline)
    assert_equal "rejected", real_result.kind
    assert_equal 0, calls

    remote = Elevateo::SendWorker::SmtpProfile.remote_held(host: "smtp.example.com", port: 587,
      verified_sender: "sender@example.com", tls_mode: "starttls_required", credential_ref: "secret://mailbox_1")
    held_transport = Elevateo::SendWorker::SmtpTransport.new(profile: remote, client: client)
    assert_raises(Elevateo::SendWorker::SmtpTransport::Held) do
      held_transport.submit(snapshot, send_id: SEND, attempt_id: ATTEMPT, deadline: deadline)
    end
    assert_equal 0, calls
  end

  def test_factory_failure_is_held_before_any_submission
    client = Elevateo::SendWorker::LocalMailpitClient.new(profile: profile,
      smtp_factory: ->(_host, _port) { raise IOError, "client unavailable" })
    transport = Elevateo::SendWorker::SmtpTransport.new(profile: profile, client: client)
    assert_raises(Elevateo::SendWorker::SmtpTransport::Held) do
      transport.submit(snapshot, send_id: SEND, attempt_id: ATTEMPT, deadline: deadline)
    end
  end

  def test_total_deadline_after_submission_begins_is_unknown
    smtp = FakeSmtp.new
    smtp.define_singleton_method(:send_message) do |mime, sender, *recipients|
      @messages << [mime, sender, recipients]
      sleep 0.05
      Struct.new(:status).new("250")
    end
    client = Elevateo::SendWorker::LocalMailpitClient.new(profile: profile, smtp_factory: ->(_host, _port) { smtp })
    transport = Elevateo::SendWorker::SmtpTransport.new(profile: profile, client: client)
    short_deadline = Elevateo::SendWorker::CallDeadline.new(seconds: 0.01)
    result = transport.submit(snapshot, send_id: SEND, attempt_id: ATTEMPT, deadline: short_deadline)
    assert_equal "unknown", result.kind
    assert_equal 1, smtp.messages.length
  end
end
