# frozen_string_literal: true

require "minitest/autorun"
require "tempfile"
require_relative "../../lib/elevateo/send_worker/production_mox_transport"
require_relative "../../lib/elevateo/send_api/canonical"
require_relative "../support/mail_binding"
require_relative "../../lib/elevateo/mail_credentials/bundle"

# AIDEV-NOTE: No network: doubles verify mandatory TLS, exact production identity and ambiguous DATA outcomes.
class SendWorkerProductionMoxTransportTest < Minitest::Test
  include MailBindingFixture
  SEND = "11111111-1111-4111-8111-111111111111"
  ATTEMPT = "22222222-2222-4222-8222-222222222222"
  SENDER = "outreach@dispatch.company.com"

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
        ["mail.dispatch.company.com", SENDER, "fixture-only-password", :plain]
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
    @smtp = FakeSmtp.new
    @factory_calls = 0
  end

  def profile
    Elevateo::SendWorker::ProductionMoxProfile.new("ELEVATEO_MOX_HOST" => "mail.dispatch.company.com",
      "ELEVATEO_MOX_VERIFIED_DOMAINS" => '["dispatch.company.com"]' , "ELEVATEO_MOX_CREDENTIALS_PATH" => "/private/bundle.json")
  end
  def deadline = Elevateo::SendWorker::CallDeadline.new(seconds: 10.0)

  def binding = mail_binding(organization_id: SEND, mailbox_id: SEND, credential_ref: "secret:synthetic")

  def transport(credentials: [SENDER, "fixture-only-password"], resolver: nil)
    Elevateo::SendWorker::ProductionMoxTransport.new(profile: profile,
      credential_resolver: resolver || ->(value, protocol:) {
        raise "binding mismatch" unless protocol == "smtp" && value.key(protocol: protocol) == binding.key(protocol: protocol)
        credentials
      }, smtp_factory: ->(host, port) {
        raise "endpoint mismatch" unless [host, port] == ["mail.dispatch.company.com", 587]
        @factory_calls += 1
        @smtp
      })
  end

  def snapshot(recipient: "recipient@example.net", sender: SENDER)
    Elevateo::SendAPI::Canonical.bytes(organization_id: SEND, mailbox_id: SEND, draft_id: SEND,
      version: 1, sender: sender, recipients: [{ "display_name" => nil, "address" => recipient }],
      subject: "Fixture only", body: "plain text", reply_id: nil, policy: "1")
  end

  def submit(driver = transport, bytes: snapshot, credential_binding: binding)
    driver.submit(bytes, send_id: SEND, attempt_id: ATTEMPT, deadline: deadline, credential_binding: credential_binding)
  end

  def test_exact_envelope_verified_tls_and_distinct_production_receipt
    result = submit
    assert_equal "accepted", result.kind
    refute result.simulated?
    assert_match(/\Amox-v1:[0-9a-f]{64}\z/, result.receipt_ref)
    assert_equal OpenSSL::SSL::VERIFY_PEER, @smtp.context.verify_mode
    assert_equal true, @smtp.context.verify_hostname
    assert_nil @smtp.context.ca_file
    assert_equal [SENDER, ["recipient@example.net"]], @smtp.messages.first.drop(1)
    assert_nil transport.observation(send_id: SEND, attempt_id: ATTEMPT, snapshot_digest: "a" * 64)
  end

  def test_wrong_sender_recipient_and_header_injection_never_connect
    bad_header = JSON.parse(snapshot)
    bad_header[7] = "Injected\r\nBcc: target@example.com"
    [snapshot(recipient: "bad\r\nrecipient@example.net"),
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

  def test_explicit_smtp_failures_never_create_accepted_receipts
    # AIDEV-NOTE: Conservatively retain uncertainty once send_message starts, including explicit SMTP errors.
    [Net::SMTPServerBusy.new("450 temporarily unavailable"),
     Net::SMTPFatalError.new("550 recipient rejected")].each do |error|
      @smtp = FakeSmtp.new(before: error)
      assert_raises(Elevateo::SendWorker::SmtpTransport::Held) { submit }
      assert_empty @smtp.messages
      @smtp = FakeSmtp.new(failure: error)
      result = submit
      assert_equal "unknown", result.kind
      assert_nil result.receipt_ref
      assert_equal 1, @smtp.messages.length
    end
  end

  def test_mailpit_transport_refuses_mox_profile
    client = Object.new
    def client.deliver(*) = raise("unexpected plaintext connection")
    assert_raises(ArgumentError) do
      Elevateo::SendWorker::SmtpTransport.new(profile: profile, client: client)
    end
    mailpit = Elevateo::SendWorker::SmtpProfile.local_mox
    assert_raises(Elevateo::SendWorker::SmtpTransport::Held) do
      Elevateo::SendWorker::ProductionMoxTransport.new(profile: mailpit,
        credential_resolver: ->(_) { [SENDER, "fixture-only-password"] })
    end
  end

  def test_expired_deadline_before_io_is_held_without_connecting
    now = 0.0
    bound = Elevateo::SendWorker::CallDeadline.new(seconds: 1, clock: -> { now })
    now = 2.0
    assert_raises(Elevateo::SendWorker::SmtpTransport::Held) do
      transport.submit(snapshot, send_id: SEND, attempt_id: ATTEMPT, deadline: bound, credential_binding: binding)
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

  def test_binding_and_private_bundle_reject_cross_identity_without_network
    entry = { account_id: binding.account_id, organization_id: SEND, mailbox_id: SEND,
      credential_version: 1, credential_ref: binding.credential_ref, protocol: "smtp",
      username: SENDER, password: "fixture-only-password" }
    Tempfile.create("smtp-bundle") do |file|
      file.chmod(0o600)
      file.write(JSON.generate(format_version: 1, entries: [entry]))
      file.flush
      driver = transport(resolver: Elevateo::MailCredentials::Bundle.new(path: file.path))
      [nil, "test:synthetic", mail_binding, binding_with(account_id: ATTEMPT),
       binding_with(credential_version: 2), binding_with(credential_ref: "test:other")].each do |value|
        error = assert_raises(Elevateo::SendWorker::SmtpTransport::Held) { submit(driver, credential_binding: value) }
        assert_nil error.cause
      end
      assert_equal 0, @factory_calls
      assert_equal "accepted", submit(driver).kind
      assert_equal 1, @factory_calls
    end
  end

  def test_imap_only_bundle_cannot_authorize_smtp
    Tempfile.create("imap-bundle") do |file|
      file.chmod(0o600)
      file.write(JSON.generate(format_version: 1, entries: [{ account_id: binding.account_id,
        organization_id: SEND, mailbox_id: SEND, credential_version: 1, credential_ref: binding.credential_ref,
        protocol: "imap", username: SENDER, password: "fixture-only-password" }]))
      file.flush
      driver = transport(resolver: Elevateo::MailCredentials::Bundle.new(path: file.path))
      assert_raises(Elevateo::SendWorker::SmtpTransport::Held) { submit(driver) }
      assert_equal 0, @factory_calls
    end
  end

  def test_verified_domain_allowlist_is_bounded_exact_and_rejects_reserved_names
    env = { "ELEVATEO_MOX_HOST" => "mail.dispatch.company.com",
      "ELEVATEO_MOX_CREDENTIALS_PATH" => "/private/bundle.json" }
    build = ->(raw) { Elevateo::SendWorker::ProductionMoxProfile.new(env.merge("ELEVATEO_MOX_VERIFIED_DOMAINS" => raw)) }
    approved = build.call(JSON.generate(["dispatch.company.com", "second.company.com"]))
    assert approved.permits_sender?("sender@dispatch.company.com")
    assert approved.permits_sender?("sender@second.company.com")
    refute approved.permits_sender?("sender@child.second.company.com")
    [nil, "[]", "{}", "null", "broken", '["dispatch.company.com","dispatch.company.com"]',
      JSON.generate(Array.new(121) { |i| "d#{i}.company.com" }), " " * 32769].each do |raw|
      assert_raises(Elevateo::ConfigError) { build.call(raw) }
    end
    %w[example.com child.example.net example.org a.test a.invalid a.localhost a.local a.example a.onion a.arpa a.internal a.alt a.123
      127.0.0.1 UPPER.company.com bad..company.com -bad.company.com].each do |name|
      assert_raises(Elevateo::ConfigError) { build.call(JSON.generate(["dispatch.company.com", name])) }
    end
    assert_raises(Elevateo::ConfigError) { build.call('["different.company.com"]') }
  end

  def binding_with(**changes) = mail_binding(**{ organization_id: SEND, mailbox_id: SEND, credential_ref: "secret:synthetic" }.merge(changes))

end
