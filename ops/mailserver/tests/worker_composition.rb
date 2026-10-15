# frozen_string_literal: true

require "tmpdir"
require "timeout"
require "/workspace/apps/server/test/sends/approval_database_helper"
require "/workspace/apps/server/lib/elevateo/send_api/canonical"
require "/workspace/apps/server/lib/elevateo/send_worker/database_store"
require "/workspace/apps/server/lib/elevateo/send_worker/executor"
require "/workspace/apps/server/lib/elevateo/send_worker/drain"
require "/workspace/apps/server/lib/elevateo/send_worker/mox_smtp_transport"
require "/workspace/apps/server/lib/elevateo/inbound/tls_imap_transport"
require "/workspace/apps/server/test/support/mail_binding"
require_relative "worker_inbox"
require "/workspace/apps/server/test/support/smtp_account"
require "/workspace/apps/server/lib/elevateo/mail_credentials/bundle"

# AIDEV-NOTE: Real PostgreSQL approval/worker and Mox SMTP/IMAP; the delayed-ack case injects time, not a receipt.
class MoxWorkerCompositionTest < SendDatabaseTestCase
  include MoxInboxProof
  include SmtpAccountFixture
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
    create_smtp_account(sender: FROM, destination_domains: ["seed.test"])
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

  def execute(smtp_class: Net::SMTP, budget: 10, drain: false)
    Dir.mktmpdir("mox-composition-") do |directory|
      credentials = File.join(directory, "credentials.json")
      # AIDEV-NOTE: Real bundle lookup proves SQL identity crosses the composition boundary, not a string-only mock.
      File.write(credentials, JSON.generate(format_version: 1, entries: [{ organization_id: @org,
        mailbox_id: @box, account_id: @smtp_account, credential_version: 1, credential_ref: "test:synthetic",
        protocol: "smtp", username: FROM, password: @passwords.fetch(FROM) }]), mode: "w", perm: 0o600)
      driver = Elevateo::SendWorker::MoxSmtpTransport.new(
        profile: Elevateo::SendWorker::SmtpProfile.local_mox, ca_file: CA,
        credential_resolver: Elevateo::MailCredentials::Bundle.new(path: credentials),
        smtp_factory: ->(host, port) { @smtp_connections += 1; smtp_class.new(host, port) })
      path = File.join(directory, "control.json")
      File.write(path, JSON.generate(epoch: @epoch, outbound_held: false))
      control = Elevateo::SendWorker::Control.new(path: path)
      if drain
        return Elevateo::SendWorker::Drain.new(connection: @worker, control: control, driver: driver,
          max_steps: 1, max_seconds: 5, idle_delay: 0.05).run
      end
      store = Elevateo::SendWorker::DatabaseStore.new(connection: @worker, send_id: @send_id, profile: driver.database_profile)
      Elevateo::SendWorker::Executor.new(store: store, driver: driver, budget_seconds: budget,
        control: control).run_once
    end
  end

  def messages
    # AIDEV-NOTE: The fresh bounded fixture fits within one IMAP page; filter by this test subject.
    transport = Elevateo::Inbound::TlsImapTransport.new(host: "localhost", port: 1993, ca_file: CA,
      credential_resolver: ->(binding, protocol:) {
        raise "unexpected IMAP binding" unless protocol == "imap" &&
          binding.key(protocol: protocol) == mail_binding.key(protocol: protocol)
        [TO, @passwords.fetch(TO)]
      })
    session = transport.open(binding: mail_binding)
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

  def assert_reserved_once
    row = @admin.exec("SELECT count(*) AS axes, min(used) AS minimum, max(used) AS maximum FROM app_send_private.budget_usage").first
    assert_equal({ "axes" => "6", "minimum" => "1", "maximum" => "1" }, row)
  end

  def test_persisted_approval_queued_worker_and_verified_imap_without_replay
    assert_equal 1, execute(drain: true)
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
    assert_reserved_once
    # AIDEV-NOTE: Accepted work is no longer eligible; a second execution must remain idle without another connection.
    assert_equal 0, execute(drain: true)
    assert_equal 1, @smtp_connections
    assert_equal 1, messages.length
    assert_equal 1, status(@send_id).fetch("attempts")
  end

  def test_revocation_prevents_any_smtp_connection
    @admin.exec_params("UPDATE app_auth.sessions SET state='revoked',revoked_at=clock_timestamp() WHERE cookie_digest=$1", [@digest])
    assert_equal 1, execute(drain: true)
    assert_equal 0, @smtp_connections
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app_send_private.attempts WHERE send_id=$1", [@send_id]).getvalue(0, 0)
    assert_empty messages
  end

  def reconciliation_state
    @admin.exec_params(<<~SQL, [@send_id]).first
      SELECT j.reconcile_count,j.lease_generation,j.next_action,j.lease_id,
        j.next_check_at > clock_timestamp() AS rescheduled,
        (SELECT count(*) FROM app_send_private.reconciliation_checks c WHERE c.send_id=j.send_id) AS checks,
        (SELECT count(*) FROM app_send_private.reconciliation_checks c
          JOIN app_send_private.attempts a ON a.attempt_id=c.attempt_id
          WHERE c.send_id=j.send_id AND c.lease_generation=j.lease_generation
            AND a.send_id=j.send_id AND a.attempt_no=j.attempt_count AND a.profile='mox-smtp-test-v1') AS current_checks
      FROM app_send_private.jobs j WHERE j.send_id=$1
    SQL
  end

  def test_real_deadline_after_mox_acceptance_stays_unknown_without_replay
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    assert_equal :unknown, execute(smtp_class: DelayedAcknowledgment, budget: 3)
    elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
    assert_operator elapsed, :>=, 2.5
    assert_operator elapsed, :<, 10
    assert_equal 1, @smtp_connections
    wait_for_message
    before = reconciliation_state
    @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp() WHERE send_id=$1", [@send_id])
    assert_equal 1, execute(drain: true)
    after = reconciliation_state
    # AIDEV-NOTE: Admission alone is not reconciliation; prove a new durable check consumed this generation's lease.
    assert_equal before.fetch("checks").to_i + 1, after.fetch("checks").to_i
    assert_equal before.fetch("reconcile_count").to_i + 1, after.fetch("reconcile_count").to_i
    assert_operator after.fetch("lease_generation").to_i, :>, before.fetch("lease_generation").to_i
    assert_equal "1", after.fetch("current_checks")
    assert_equal "reconcile", after.fetch("next_action")
    assert_equal "t", after.fetch("rescheduled")
    assert_nil after.fetch("lease_id")
    assert_equal "unknown", status(@send_id).fetch("state")
    assert_equal 1, @smtp_connections
    assert_equal 1, messages.length
    assert_equal 1, status(@send_id).fetch("attempts")
    assert_reserved_once
    assert_nil @admin.exec_params("SELECT accepted_receipt_ref FROM app_send_private.jobs WHERE send_id=$1", [@send_id]).getvalue(0, 0)
  end
end
