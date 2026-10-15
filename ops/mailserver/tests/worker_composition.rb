# frozen_string_literal: true

require "tmpdir"
require "timeout"
require "/workspace/apps/server/test/sends/approval_database_helper"
require "/workspace/apps/server/lib/elevateo/send_api/canonical"
require "/workspace/apps/server/lib/elevateo/send_worker/database_store"
require "/workspace/apps/server/lib/elevateo/send_worker/executor"
require "/workspace/apps/server/lib/elevateo/send_worker/mox_smtp_transport"
require "/workspace/apps/server/lib/elevateo/inbound/tls_imap_transport"
require_relative "worker_inbox"

# AIDEV-NOTE: Real PostgreSQL approval/worker and Mox SMTP/IMAP; the delayed-ack case injects time, not a receipt.
class MoxWorkerCompositionTest < SendDatabaseTestCase
  include MoxInboxProof
  FROM = "outreach000@send.test"
  TO = "seed000@seed.test"
  CA = "/evidence/fixture-ca.pem"

  class DelayedAcknowledgment < Net::SMTP
    def send_message(*arguments)
      response = super
      sleep 20 # AIDEV-NOTE: Mox has accepted DATA; force the actual bounded worker deadline to expire before return.
      response
    end
  end

  def setup
    super
    @smtp_connections = 0
    @passwords = JSON.parse(File.read("/evidence/fixture-credentials.json"))
    fixture_change do
      @admin.exec_params("UPDATE app.mailboxes SET address=$1 WHERE id=$2", [FROM, @box])
    end
    @subject = "MAIL1018 persisted worker #{@draft}"
    @body = "Private synthetic composition\nUnicode: caf\u00e9 / \u65e5\u672c\u8a9e"
    saved = payload(expected_version: 1, operation_id: SecureRandom.uuid, subject: @subject,
      body_text: @body, to: [{ "display_name" => nil, "address" => TO }])
    assert_equal 2, save(saved).fetch("version")
    bytes = Elevateo::SendAPI::Canonical.bytes(organization_id: @org, mailbox_id: @box,
      draft_id: @draft, version: 2, sender: FROM, recipients: saved.recipients,
      subject: @subject, body: @body, reply_id: nil, policy: "1")
    @send_id = approve(version: 2, bytes: bytes, review_digest: Digest::SHA256.hexdigest(bytes)).fetch("send_id")
  end

  def execute(smtp_class: Net::SMTP, budget: 10)
    driver = Elevateo::SendWorker::MoxSmtpTransport.new(
      profile: Elevateo::SendWorker::SmtpProfile.local_mox, ca_file: CA,
      credential_resolver: ->(reference) {
        raise "unexpected SMTP reference" unless reference == "test:mox-fixture"
        [FROM, @passwords.fetch(FROM)]
      }, smtp_factory: ->(host, port) { @smtp_connections += 1; smtp_class.new(host, port) })
    Dir.mktmpdir("mox-composition-") do |directory|
      path = File.join(directory, "control.json")
      File.write(path, JSON.generate(epoch: @epoch, outbound_held: false))
      store = Elevateo::SendWorker::DatabaseStore.new(connection: @worker, send_id: @send_id, profile: "mox-smtp-test-v1")
      Elevateo::SendWorker::Executor.new(store: store, driver: driver, budget_seconds: budget,
        control: Elevateo::SendWorker::Control.new(path: path)).run_once
    end
  end

  def messages
    # AIDEV-NOTE: Each gate has a fresh Mox tmpfs; these three tests can deliver at most two messages in total.
    transport = Elevateo::Inbound::TlsImapTransport.new(host: "localhost", port: 1993, ca_file: CA,
      credential_resolver: ->(reference) {
        raise "unexpected IMAP reference" unless reference == "test:mox-composition"
        [TO, @passwords.fetch(TO)]
      })
    session = transport.open(credential_ref: "test:mox-composition")
    assert session.verified_tls?
    session.fetch_after(0, limit: 50).map { |row| Mail.read_from_string(row.fetch(:raw_mime)) }
      .select { |mail| mail.subject == @subject }
  ensure
    session&.close
  end

  def wait_for_message
    found = []
    Timeout.timeout(20) do
      loop do
        found = messages
        break unless found.empty?
        sleep 0.1
      end
    end
    assert_equal 1, found.length
    assert_equal [FROM], found.first.from
    assert_equal [TO], found.first.to
    assert_equal @body, found.first.decoded.gsub("\r\n", "\n")
  end

  def test_persisted_approval_actual_worker_and_verified_imap_without_replay
    assert_equal :accepted, execute
    assert_equal 1, @smtp_connections
    row = @admin.exec_params(<<~SQL, [@send_id]).first
      SELECT a.profile,o.source,o.receipt_ref FROM app_send_private.attempts a
        JOIN app_send_private.observations o ON o.attempt_id=a.attempt_id WHERE a.send_id=$1
    SQL
    assert_equal "mox-smtp-test-v1", row.fetch("profile")
    assert_equal "mox_smtp_test_v1", row.fetch("source")
    assert_match(/\Amox-test-v1:[0-9a-f]{64}\z/, row.fetch("receipt_ref"))
    assert_equal "accepted", status(@send_id).fetch("state")
    wait_for_message
    assert_inbox_import
    # AIDEV-NOTE: Accepted work is no longer eligible; a second execution must remain idle without another connection.
    assert_equal :idle, execute
    assert_equal 1, @smtp_connections
    assert_equal 1, messages.length
    assert_equal 1, status(@send_id).fetch("attempts")
  end

  def test_revocation_prevents_any_smtp_connection
    @admin.exec_params("UPDATE app_auth.sessions SET state='revoked',revoked_at=clock_timestamp() WHERE cookie_digest=$1", [@digest])
    assert_equal :held, execute
    assert_equal 0, @smtp_connections
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app_send_private.attempts WHERE send_id=$1", [@send_id]).getvalue(0, 0)
    assert_empty messages
  end

  def test_real_deadline_after_mox_acceptance_stays_unknown_without_replay
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    assert_equal :unknown, execute(smtp_class: DelayedAcknowledgment, budget: 3)
    elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
    assert_operator elapsed, :>=, 2.5
    assert_operator elapsed, :<, 10
    assert_equal 1, @smtp_connections
    wait_for_message
    @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp() WHERE send_id=$1", [@send_id])
    assert_equal :unknown, execute
    assert_equal 1, @smtp_connections
    assert_equal 1, messages.length
    assert_equal 1, status(@send_id).fetch("attempts")
    assert_nil @admin.exec_params("SELECT accepted_receipt_ref FROM app_send_private.jobs WHERE send_id=$1", [@send_id]).getvalue(0, 0)
  end
end
