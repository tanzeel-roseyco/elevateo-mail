# frozen_string_literal: true

require "minitest/autorun"
require "tempfile"
require_relative "../../lib/elevateo/send_worker/mox_smtp_transport"
require_relative "../../lib/elevateo/send_api/canonical"

# AIDEV-NOTE: Unit doubles enforce TLS/auth call ordering; fleet's real Mox test proves wire compatibility.
class SendWorkerMoxSmtpTransportTest < Minitest::Test
  SEND = "11111111-1111-4111-8111-111111111111"
  ATTEMPT = "22222222-2222-4222-8222-222222222222"
  SENDER = "outreach000@send.test"

  class FakeSmtp
    attr_accessor :open_timeout, :read_timeout
    attr_reader :context, :messages

    def initialize(failure: nil, before: nil)
      @failure, @before, @messages = failure, before, []
    end

    def enable_starttls(context) = @context = context

    def start(helo, username, password, mechanism)
      raise "TLS missing" unless @context
      raise "authentication mismatch" unless [helo, username, password, mechanism] ==
        ["mail.lab.test", SENDER, "fixture-only-password", :plain]
      raise @before if @before
      yield self
    end

    def send_message(mime, sender, *recipients)
      @messages << [mime, sender, recipients]
      raise @failure if @failure
      Struct.new(:status).new("250")
    end
  end

  def setup
    @ca = Tempfile.new("fixture-ca")
    @smtp = FakeSmtp.new
    @factory_calls = 0
  end

  def teardown = @ca.close!
  def profile = Elevateo::SendWorker::SmtpProfile.local_mox
  def deadline = Elevateo::SendWorker::CallDeadline.new(seconds: 10.0)

  def transport(credentials: [SENDER, "fixture-only-password"])
    Elevateo::SendWorker::MoxSmtpTransport.new(profile: profile, ca_file: @ca.path,
      credential_resolver: ->(ref) {
        raise "reference mismatch" unless ref == "test:mox-fixture"
        credentials
      }, smtp_factory: ->(host, port) {
        raise "endpoint mismatch" unless [host, port] == ["localhost", 1587]
        @factory_calls += 1
        @smtp
      })
  end

  def snapshot(recipient: "seed000@seed.test", sender: SENDER)
    Elevateo::SendAPI::Canonical.bytes(organization_id: SEND, mailbox_id: SEND, draft_id: SEND,
      version: 1, sender: sender, recipients: [{ "display_name" => nil, "address" => recipient }],
      subject: "Fixture only", body: "plain text", reply_id: nil, policy: "1")
  end

  def submit(driver = transport, bytes: snapshot)
    driver.submit(bytes, send_id: SEND, attempt_id: ATTEMPT, deadline: deadline)
  end

  def test_exact_envelope_verified_tls_and_distinct_simulated_receipt
    result = submit
    assert_equal "accepted", result.kind
    assert result.simulated?
    assert_match(/\Amox-test-v1:[0-9a-f]{64}\z/, result.receipt_ref)
    assert_equal OpenSSL::SSL::VERIFY_PEER, @smtp.context.verify_mode
    assert_equal true, @smtp.context.verify_hostname
    assert_equal @ca.path, @smtp.context.ca_file
    assert_equal [SENDER, ["seed000@seed.test"]], @smtp.messages.first.drop(1)
    assert_nil transport.observation(send_id: SEND, attempt_id: ATTEMPT, snapshot_digest: "a" * 64)
  end

  def test_wrong_sender_recipient_and_header_injection_never_connect
    bad_header = JSON.parse(snapshot)
    bad_header[7] = "Injected\r\nBcc: target@example.com"
    [snapshot(recipient: "another@seed.test"), snapshot(recipient: "target@example.com"),
     snapshot(sender: "other@send.test"), JSON.generate(bad_header)].each do |bytes|
      assert_equal "rejected", submit(bytes: bytes).kind
    end
    assert_equal 0, @factory_calls
  end

  def test_missing_or_mismatched_credentials_are_held_without_client
    [[nil, nil], ["other@send.test", "fixture-only-password"], [SENDER, ""],
     [SENDER, "bad\npassword"], [SENDER, "x" * 4097]].each do |credentials|
      error = assert_raises(Elevateo::SendWorker::SmtpTransport::Held) { submit(transport(credentials: credentials)) }
      assert_nil error.cause
    end
    assert_equal 0, @factory_calls
  end

  def test_tls_and_auth_failure_are_held_before_data
    [OpenSSL::SSL::SSLError.new("bad certificate"), Net::SMTPAuthenticationError.new("535 wrong password")].each do |error|
      @smtp = FakeSmtp.new(before: error)
      assert_raises(Elevateo::SendWorker::SmtpTransport::Held) { submit }
      assert_empty @smtp.messages
    end
  end

  def test_lost_acknowledgment_is_unknown_and_never_replayed
    @smtp = FakeSmtp.new(failure: IOError.new("lost acknowledgment"))
    result = submit
    assert_equal "unknown", result.kind
    assert_equal "smtp_uncertain", result.code
    assert_equal 1, @smtp.messages.length
    assert_nil result.receipt_ref
  end

  def test_mailpit_transport_refuses_mox_profile
    client = Object.new
    def client.deliver(*) = raise("unexpected plaintext connection")
    driver = Elevateo::SendWorker::SmtpTransport.new(profile: profile, client: client)
    assert_raises(Elevateo::SendWorker::SmtpTransport::Held) { submit(driver) }
    mailpit = Elevateo::SendWorker::SmtpProfile.local_mailpit(verified_sender: "sender@example.invalid")
    assert_raises(Elevateo::SendWorker::SmtpTransport::Held) do
      Elevateo::SendWorker::MoxSmtpTransport.new(profile: mailpit, ca_file: @ca.path,
        credential_resolver: ->(_) { [SENDER, "fixture-only-password"] })
    end
  end

  def test_expired_deadline_before_io_is_held_without_connecting
    now = 0.0
    bound = Elevateo::SendWorker::CallDeadline.new(seconds: 1, clock: -> { now })
    now = 2.0
    assert_raises(Elevateo::SendWorker::SmtpTransport::Held) do
      transport.submit(snapshot, send_id: SEND, attempt_id: ATTEMPT, deadline: bound)
    end
    assert_equal 0, @factory_calls
    assert_empty @smtp.messages
  end

  def test_expired_deadline_during_data_is_unknown_without_receipt
    @smtp = FakeSmtp.new(failure: Elevateo::SendWorker::CallDeadline::Expired.new)
    result = submit
    assert_equal "unknown", result.kind
    assert_nil result.receipt_ref
    assert_equal 1, @smtp.messages.length
  end
end
