# frozen_string_literal: true

require "minitest/autorun"
require "net/smtp"
require "openssl"
require "timeout"
require "/app/lib/elevateo/send_api/canonical"
require "/app/lib/elevateo/send_worker/control"
require "/app/lib/elevateo/send_worker/mox_smtp_transport"
require "/app/lib/elevateo/inbound/tls_imap_transport"

# AIDEV-NOTE: Actual Mox adapter/IMAP wire proof; database authority is tested separately, production stays held.
class AppMoxCompatibilityTest < Minitest::Test
  SEND_ID = "11111111-1111-4111-8111-111111111111"
  ORG = "22222222-2222-4222-8222-222222222222"
  BOX = "33333333-3333-4333-8333-333333333333"
  DRAFT = "44444444-4444-4444-8444-444444444444"
  FROM = "outreach000@send.test"
  TO = "seed000@seed.test"
  BODY = "Synthetic consented app compatibility\nUnicode: caf\u00e9 / \u65e5\u672c\u8a9e"
  CA = "/evidence/fixture-ca.pem"

  def passwords
    JSON.parse(File.read("/evidence/fixture-credentials.json"))
  end

  def transport(address: TO, password: nil, ca: CA)
    Elevateo::Inbound::TlsImapTransport.new(host: "localhost", port: 1993, ca_file: ca,
      credential_resolver: ->(reference) {
        raise "unexpected credential reference" unless reference == "test:mox-compatibility"
        [address, password || passwords.fetch(address)]
      })
  end

  def snapshot
    Elevateo::SendAPI::Canonical.bytes(organization_id: ORG, mailbox_id: BOX, draft_id: DRAFT,
      version: 1, sender: FROM, recipients: [{ "display_name" => nil, "address" => TO }],
      subject: "MAIL1018 application compatibility", body: BODY, reply_id: nil, policy: "1")
  end

  def smtp_transport(password: nil, ca: CA)
    Elevateo::SendWorker::MoxSmtpTransport.new(profile: Elevateo::SendWorker::SmtpProfile.local_mox,
      ca_file: ca, credential_resolver: ->(_) { [FROM, password || passwords.fetch(FROM)] })
  end

  def test_actual_snapshot_survives_verified_tls_and_actual_imap_reader
    rendered = Elevateo::SendWorker::SmtpSnapshot.render(snapshot, send_id: SEND_ID, verified_sender: FROM)
    result = smtp_transport.submit(snapshot, send_id: SEND_ID, attempt_id: DRAFT,
      deadline: Elevateo::SendWorker::CallDeadline.new(seconds: 10))
    assert_equal "accepted", result.kind
    assert result.simulated?
    assert_match(/\Amox-test-v1:[0-9a-f]{64}\z/, result.receipt_ref)
    rows = []
    Timeout.timeout(30) do
      loop do
        session = transport.open(credential_ref: "test:mox-compatibility")
        begin
          assert session.verified_tls?
          assert_operator session.uidvalidity, :>, 0
          rows = session.fetch_after(0, limit: 50)
        ensure
          session.close
          session = nil
        end
        break unless rows.empty?
        sleep 0.2
      end
    end
    assert_equal 1, rows.length
    mail = Mail.read_from_string(rows.first.fetch(:raw_mime))
    assert_equal [FROM], mail.from
    assert_equal [TO], mail.to
    assert_equal BODY, mail.decoded.gsub("\r\n", "\n")
    assert_equal Mail.read_from_string(rendered.mime).message_id, mail.message_id
    assert_equal "MAIL1018 application compatibility", mail.subject
    session = transport.open(credential_ref: "test:mox-compatibility")
    assert_empty session.fetch_after(rows.first.fetch(:uid), limit: 50)
  ensure
    session&.close
  end

  def test_wrong_imap_password_fails
    assert_raises(Net::IMAP::NoResponseError) do
      transport(password: "deliberately-wrong").open(credential_ref: "test:mox-compatibility")
    end
  end

  def test_actual_smtp_wrong_password_and_untrusted_ca_are_held
    [smtp_transport(password: "deliberately-wrong"),
     smtp_transport(ca: "/etc/ssl/certs/ca-certificates.crt")].each do |driver|
      error = assert_raises(Elevateo::SendWorker::SmtpTransport::Held) do
        driver.submit(snapshot, send_id: SEND_ID, attempt_id: DRAFT,
          deadline: Elevateo::SendWorker::CallDeadline.new(seconds: 10))
      end
      assert_nil error.cause
    end
  end

  def test_untrusted_ca_fails
    assert_raises(OpenSSL::SSL::SSLError) do
      transport(ca: nil).open(credential_ref: "test:mox-compatibility")
    end
  end

  def test_nonfixture_credential_reference_fails
    error = assert_raises(Elevateo::Inbound::Rejected) do
      transport.open(credential_ref: "secret://production")
    end
    assert_equal "account_unavailable", error.code
  end

  def test_remote_hold_rejects_even_injected_client
    profile = Elevateo::SendWorker::SmtpProfile.remote_held(host: "mail.lab.test", port: 587,
      tls_mode: "starttls_required", verified_sender: FROM, credential_ref: "secret://synthetic")
    client = Object.new
    def client.deliver(*) = raise("held transport called injected client")
    smtp = Elevateo::SendWorker::SmtpTransport.new(profile: profile, client: client)
    assert_raises(Elevateo::SendWorker::SmtpTransport::Held) do
      smtp.submit("unused", send_id: SEND_ID, attempt_id: DRAFT, deadline: nil)
    end
  end
end
