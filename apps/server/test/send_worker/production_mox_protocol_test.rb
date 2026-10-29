# frozen_string_literal: true

require "minitest/autorun"
require "securerandom"
require "mail"
require_relative "../../lib/elevateo/send_worker/production_mox_transport"
require_relative "../../lib/elevateo/send_api/canonical"
require_relative "../../lib/elevateo/inbound/tls_imap_transport"
require_relative "../support/mail_binding"

# AIDEV-NOTE: Dedicated network-none Mox harness supplies synthetic Bundle and a private system trust root.
class ProductionMoxProtocolTest < Minitest::Test
  include MailBindingFixture
  ID = "11111111-1111-4111-8111-111111111111"
  ATTEMPT = "22222222-2222-4222-8222-222222222222"

  class DiagnosticClient < Elevateo::Inbound::OwnedImapClient
    def uid_fetch(uid, fields)
      rows = super
      # AIDEV-NOTE: Structural diagnostics exclude MIME and credentials when the real server violates fixture assumptions.
      warn "protocol_fetch uid=#{uid} rows=#{rows&.length} keys=#{rows&.map { |row| row.attr.keys }}" unless
        rows.is_a?(Array) && rows.length == 1
      rows
    end
  end

  def setup
    skip "dedicated isolated Mox protocol harness required" unless ENV["BE02_MOX_PRODUCTION_PROTOCOL"] == "1"
    @nonce = SecureRandom.hex(16)
    # AIDEV-NOTE: Distinct wire Message-IDs prevent Mox duplicate suppression across test submissions.
    @send_id = SecureRandom.uuid
    @reply_send_id = SecureRandom.uuid
    @subject = "ruby-production-adapter-#{@nonce}"
    @body = "Private isolated adapter proof #{@nonce}"
    @directory = ENV.fetch("BE02_MOX_PROTOCOL_DIRECTORY")
    @identities = JSON.parse(File.read(File.join(@directory, "identities.json")))
    @bundle = Elevateo::MailCredentials::Bundle.new(path: File.join(@directory, "bundle.json"))
  end

  def binding(index = 0)
    mail_binding(account_id: index.zero? ? ID : ATTEMPT, organization_id: ID, mailbox_id: ID,
      credential_ref: "secret:protocol-#{index}")
  end

  def driver(host: "mail.dispatch.company.com", resolver: @bundle)
    profile = Elevateo::SendWorker::ProductionMoxProfile.new(
      "ELEVATEO_MOX_HOST" => host,
      "ELEVATEO_MOX_VERIFIED_DOMAINS" => '["dispatch.company.com","second.company.com"]',
      "ELEVATEO_MOX_CREDENTIALS_PATH" => File.join(@directory, "bundle.json"))
    Elevateo::SendWorker::ProductionMoxTransport.new(profile: profile, credential_resolver: resolver)
  end

  def submit(transport)
    bytes = Elevateo::SendAPI::Canonical.bytes(organization_id: ID, mailbox_id: ID, draft_id: ID,
      version: 1, sender: @identities.fetch(0),
      recipients: [{ "display_name" => nil, "address" => @identities.fetch(1) }],
      subject: @subject, body: @body, reply_id: nil, policy: "1")
    transport.submit(bytes, send_id: @send_id, attempt_id: ATTEMPT,
      # AIDEV-NOTE: Production authority grants at most ten seconds; the real adapter fixture uses that same bound.
      deadline: Elevateo::SendWorker::CallDeadline.new(seconds: 10), credential_binding: binding)
  end

  def current_delivery?(raw)
    # AIDEV-NOTE: SMTP renders RFC2047/base64; compare decoded fields from the fetched raw MIME.
    message = Mail.read_from_string(raw)
    message.subject == @subject && message.body.decoded.include?(@body)
  end

  def test_real_ruby_submission_and_verified_imap_delivery
    refute current_delivery?("Subject: ruby-production-adapter\r\nPrivate isolated adapter proof")
    refute current_delivery?("Subject: #{@subject}\r\nPrivate isolated adapter proof")
    result = submit(driver)
    assert_equal "accepted", result.kind
    refute result.simulated?
    assert_match(/\Amox-v1:[0-9a-f]{64}\z/, result.receipt_ref)
    delivered = delivery(1)
    assert_equal [@identities.fetch(0)], delivered.from
  end

  def delivery(index)
    transport = Elevateo::Inbound::TlsImapTransport.new(host: "mail.dispatch.company.com",
      credential_resolver: @bundle, client_factory: DiagnosticClient)
    limit = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 45
    loop do
      session = transport.open(binding: binding(index))
      begin
        assert session.verified_tls?
        assert_operator session.uidvalidity, :>, 0
        # AIDEV-NOTE: Match this submission in both MIME fields; stale deliveries cannot prove a new send.
        session.fetch_after(0, limit: 50).each do |row|
          raw = row.fetch(:raw_mime)
          return Mail.read_from_string(raw) if current_delivery?(raw)
        end
      ensure
        session.close
      end
      flunk "Mox did not deliver to recipient IMAP" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= limit
      sleep 0.2
    end
  end

  def test_real_reply_uses_original_recipient_mailbox_and_rfc_identity
    assert_equal "accepted", submit(driver).kind
    original = delivery(1)
    identity = "<#{original.message_id}>"
    @subject = "reply-#{@subject}"
    @body = "Response #{@nonce}"
    # AIDEV-NOTE: Reply sender comes from the receiving mailbox, while the header binds the original RFC message.
    bytes = Elevateo::SendAPI::Canonical.bytes(organization_id: ID, mailbox_id: ID, draft_id: ID,
      version: 1, sender: @identities.fetch(1),
      recipients: [{ "display_name" => nil, "address" => @identities.fetch(0) }],
      subject: @subject, body: @body, reply_id: ID, reply_message_id: identity, policy: "1")
    result = driver.submit(bytes, send_id: @reply_send_id, attempt_id: ID,
      deadline: Elevateo::SendWorker::CallDeadline.new(seconds: 10), credential_binding: binding(1))
    assert_equal "accepted", result.kind
    reply = delivery(0)
    assert_equal [@identities.fetch(1)], reply.from
    # AIDEV-NOTE: Mail returns a scalar for a single RFC identity and arrays for multiple identities.
    assert_equal [original.message_id], Array(reply.in_reply_to)
    assert_equal [original.message_id], Array(reply.references)
  end

  def test_real_wrong_password_is_held_before_submission
    resolver = ->(value, protocol:) { [@bundle.call(value, protocol: protocol).first, "incorrect-private-test-password"] }
    error = assert_raises(Elevateo::SendWorker::SmtpTransport::Held) { submit(driver(resolver: resolver)) }
    assert_nil error.cause
  end

  def test_real_certificate_hostname_mismatch_is_held_before_submission
    error = assert_raises(Elevateo::SendWorker::SmtpTransport::Held) do
      submit(driver(host: "mail.second.company.com"))
    end
    assert_nil error.cause
  end
end
