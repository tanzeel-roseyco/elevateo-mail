# frozen_string_literal: true

require_relative "../../sends/production_mox_database_test"
require_relative "../../../lib/elevateo/send_worker/production_mox_transport"
require_relative "../../../lib/elevateo/inbound/tls_imap_transport"
require_relative "../../../lib/elevateo/inbound/imap_sync"
require_relative "../../../lib/elevateo/inbound/imap_worker_store"
require_relative "../../../lib/elevateo/thread_reads"
require_relative "../../../lib/elevateo/cursors"
require "active_record"
require_relative "http_chain"
require_relative "cleanup"

# AIDEV-NOTE: Real Auth/HTTP, worker SQL and Mox share an internal network; browser acceptance remains separate.
class LaunchMailflowAppChainTest < ProductionMoxDatabaseTest
  include LaunchMailflowHttpChain
  ProductionMoxDatabaseTest.instance_methods(false).grep(/^test_/).each { |name| undef_method name }

  # AIDEV-NOTE: Adapt real PG bindings to the application adapters without replacing any query or authorization logic.
  class Connection
    def initialize(pg)
      @pg = pg
    end

    def exec_query(sql, _name, binds)
      result = @pg.exec_params(sql, binds.map(&:value_for_database))
      result.type_map = PG::BasicTypeMapForResults.new(@pg)
      result.to_a
    end
  end

  def setup
    skip "dedicated isolated Mox app-chain harness required" unless ENV["BE02_MOX_APP_CHAIN"] == "1"
    @directory = ENV.fetch("BE02_MOX_PROTOCOL_DIRECTORY")
    @identities = JSON.parse(File.read(File.join(@directory, "identities.json")))
    super
    @epoch = ENV.fetch("BE02_MOX_CONTROL_EPOCH")
    @nonce = SecureRandom.hex(16)
    @admin.exec_params("UPDATE app.mailboxes SET address=$2 WHERE id=$1", [@box, @identities[1]])
    @admin.exec_params(<<~SQL, [@org, @identities[1].split("@").last])
      INSERT INTO app_send_private.mox_domains(organization_id,domain,enabled,verified_at,evidence_ref)
        VALUES($1,$2,true,now(),repeat('b',64))
    SQL
    @admin.exec_params(<<~SQL, [@smtp_account, @org, @box])
      INSERT INTO app.inbound_imap_accounts(id,organization_id,mailbox_id,credential_ref,credential_version,active)
        VALUES($1,$2,$3,'secret:synthetic',2,true)
    SQL
    @private = Dir.mktmpdir("mailflow-chain-")
    original = JSON.parse(File.read(File.join(@directory, "bundle.json")))
    entries = original.fetch("entries").select { |entry| entry.fetch("username") == @identities[1] }
    entries.each do |entry|
      entry.merge!("account_id" => @smtp_account, "organization_id" => @org, "mailbox_id" => @box,
        "credential_ref" => "secret:synthetic", "credential_version" => 2)
    end
    @bundle_path = File.join(@private, "bundle.json")
    File.write(@bundle_path, JSON.generate("format_version" => 1, "entries" => entries), mode: "w", perm: 0o600)
    @resolver = Elevateo::MailCredentials::Bundle.new(path: @bundle_path)
  end

  def teardown
    LaunchMailflowCleanup.run([
      -> { @admin.exec_params("DELETE FROM app.inbound_imap_receipts WHERE account_id=$1", [@smtp_account]) if @admin && @smtp_account },
      -> { @admin.exec_params("DELETE FROM app.inbound_imap_accounts WHERE id=$1", [@smtp_account]) if @admin && @smtp_account },
      -> { FileUtils.remove_entry(@private) if @private && File.directory?(@private) },
      -> { super }
    ])
  end

  def create_smtp_account(**_options)
    super(sender: @identities[1], destination_domains: [@identities[0].split("@").last])
  end

  def transport(resolver: @resolver, path: @bundle_path)
    profile = Elevateo::SendWorker::ProductionMoxProfile.new(
      "ELEVATEO_MOX_HOST" => "mail.dispatch.company.com",
      "ELEVATEO_MOX_VERIFIED_DOMAINS" => '["dispatch.company.com","second.company.com"]',
      "ELEVATEO_MOX_CREDENTIALS_PATH" => path)
    Elevateo::SendWorker::ProductionMoxTransport.new(profile: profile, credential_resolver: resolver)
  end

  def test_real_smtp_ingestion_inbox_and_authorized_reply
    original_path = File.join(@directory, "bundle.json")
    original = Elevateo::MailCredentials::Bundle.new(path: original_path)
    fixed = "11111111-1111-4111-8111-111111111111"
    binding = mail_binding(account_id: fixed, organization_id: fixed, mailbox_id: fixed,
      credential_ref: "secret:protocol-0")
    bytes = Elevateo::SendAPI::Canonical.bytes(organization_id: fixed, mailbox_id: fixed, draft_id: fixed,
      version: 1, sender: @identities[0], recipients: [{ "display_name" => nil, "address" => @identities[1] }],
      subject: "Chain #{@nonce}", body: "Incoming #{@nonce}", reply_id: nil, policy: "1")
    initial_id = SecureRandom.uuid
    assert_equal "accepted", transport(resolver: original, path: original_path).submit(bytes,
      send_id: initial_id, attempt_id: SecureRandom.uuid, credential_binding: binding,
      deadline: Elevateo::SendWorker::CallDeadline.new(seconds: 10)).kind

    store = Elevateo::Inbound::ImapWorkerStore.new(connection: Connection.new(@worker))
    imap = Elevateo::Inbound::TlsImapTransport.new(host: "mail.dispatch.company.com", credential_resolver: @resolver)
    sync = Elevateo::Inbound::ImapSync.new(store: store, transport: imap)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 35
    loop do
      sync.run(account_id: @smtp_account, credential_version: 2)
      @received = @admin.exec_params("SELECT id,thread_id,rfc_message_id FROM app.messages WHERE organization_id=$1 AND body_text LIKE $2",
        [@org, "%Incoming #{@nonce}%"]).first
      break if @received
      raise "SMTP message did not reach persisted inbox" if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
      sleep 0.2
    end
    assert_match(/#{initial_id}/, @received.fetch("rfc_message_id"))
    begin_write
    assert_equal "ok", write_guard.fetch("status")
    identity = Struct.new(:org_id, :user_id).new(@org, @user)
    reader = Elevateo::ThreadReads.new(connection: Connection.new(@api), identity: identity,
      session: { "context_id" => @context, "authorization_version" => "a" * 32 },
      cursors: Elevateo::Cursors.new(secret: "b" * 32))
    inbox = JSON.parse(reader.list(mailbox_id: @box, query: {}))
    assert_includes inbox.fetch("items").map { |item| item.fetch("id") }, @received.fetch("thread_id")
    @api.exec_params("SELECT set_config('app.user_id',$1,true)", [SecureRandom.uuid])
    assert_raises(Elevateo::ThreadReads::NotAvailable) { reader.list(mailbox_id: @box, query: {}) }
    @api.exec("ROLLBACK")

    # AIDEV-NOTE: Only the HTTP approval's committed intent may enter this real, isolated delivery worker.
    save_reply_over_http do |send_id|
    control_path = File.join(@private, "control.json")
    File.write(control_path, JSON.generate(epoch: @epoch, outbound_held: false))
    executor = Elevateo::SendWorker::Executor.new(
      store: Elevateo::SendWorker::DatabaseStore.new(connection: @worker, send_id: send_id, profile: MODE),
      driver: transport, control: Elevateo::SendWorker::Control.new(path: control_path))
    assert_equal :accepted, executor.run_once
    assert_equal :idle, executor.run_once
    verify_reply(original, binding, @received.fetch("rfc_message_id"), send_id)
    end
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET active=false WHERE id=$1", [@smtp_account])
    assert_raises(PG::InsufficientPrivilege) { sync.run(account_id: @smtp_account, credential_version: 2) }
  end

  def verify_reply(resolver, binding, original_identity, send_id)
    snapshot = @admin.exec_params("SELECT encode(snapshot_bytes,'hex') FROM app_send_private.intents WHERE send_id=$1",
      [send_id]).getvalue(0, 0)
    rendered = Elevateo::SendWorker::SmtpSnapshot.render([snapshot].pack("H*"),
      send_id: send_id, verified_sender: @identities[1])
    expected_identity = Elevateo::MailMessageIdentity.from_mime(rendered.mime)
    refute_nil expected_identity
    imap = Elevateo::Inbound::TlsImapTransport.new(host: "mail.dispatch.company.com", credential_resolver: resolver)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 35
    cursor = 0
    matches = 0
    observed_until = nil
    loop do
      session = imap.open(binding: binding)
      begin
        rows = session.fetch_after(cursor, limit: 50)
        cursor = rows.map { |row| row.fetch(:uid) }.max || cursor
        rows.each do |row|
          reply = Mail.read_from_string(row.fetch(:raw_mime))
          next unless reply.subject == "Reply #{@nonce}" && reply.body.decoded.include?("Response #{@nonce}")
          matches += 1
          assert_equal expected_identity, Elevateo::MailMessageIdentity.from_mime(row.fetch(:raw_mime))
          assert_equal [@identities[1]], reply.from
          assert_equal [@identities[0]], reply.to
          assert_equal [original_identity.delete_prefix("<").delete_suffix(">")], Array(reply.in_reply_to)
          assert_equal Array(reply.in_reply_to), Array(reply.references)
          # AIDEV-NOTE: Observe duplicates for two seconds after arrival; this is a bounded delivery assertion.
          observed_until ||= Process.clock_gettime(Process::CLOCK_MONOTONIC) + 2
        end
      ensure
        session.close
      end
      if observed_until && Process.clock_gettime(Process::CLOCK_MONOTONIC) >= observed_until
        assert_equal 1, matches
        return
      end
      raise "approved reply did not reach original sender" if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
      sleep 0.2
    end
  end

  private

  def grant_consent
    campaign, lead, operation = Array.new(3) { SecureRandom.uuid }
    @admin.exec_params("INSERT INTO app.campaigns(id,organization_id,operation_id,name,creation_fingerprint) VALUES($1,$2,$3,'Chain fixture',repeat('a',64))",
      [campaign, @org, SecureRandom.uuid])
    @admin.exec_params("INSERT INTO app.campaign_leads(id,organization_id,campaign_id,operation_id,email,creation_fingerprint) VALUES($1,$2,$3,$4,$5,repeat('a',64))",
      [lead, @org, campaign, SecureRandom.uuid, @identities[0]])
    @admin.exec_params(<<~SQL, [@org, campaign, lead, operation, @user, @identities[0]])
      INSERT INTO app.campaign_consent_events(organization_id,campaign_id,lead_id,operation_id,actor_id,
        email,lead_version,status,evidence_kind,source,observed_at)
        VALUES($1,$2,$3,$4,$5,$6,2,'granted','manual_attestation','Docker fixture',now())
    SQL
    @admin.exec_params(<<~SQL, [lead, operation, @user])
      UPDATE app.campaign_leads SET consent_status='granted',consent_recorded_at=now(),
        consent_source='Docker fixture',consent_recorded_by=$3,consent_operation_id=$2,version=2 WHERE id=$1
    SQL
  end
end
