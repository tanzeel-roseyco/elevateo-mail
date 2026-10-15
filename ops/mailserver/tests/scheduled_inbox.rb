# frozen_string_literal: true

require "net/smtp"
require_relative "inbound_process_proof"
require "/workspace/apps/server/lib/elevateo/inbound/imap_poller"

# AIDEV-NOTE: Two real Mox accounts traverse SQL selection, fenced import, durable schedule and tenant-visible inboxes.
class MoxScheduledInboxTest < DraftDatabaseTestCase
  include MoxInboxProof
  include MoxInboundProcessProof
  FROM = "outreach000@send.test"
  CA = "/evidence/fixture-ca.pem"

  def setup
    super
    @accounts = []
    @passwords = JSON.parse(File.read("/evidence/fixture-credentials.json"))
    @subject = "MAIL1024 scheduled inbox #{@draft}"
    @body = "Synthetic consenting seed fixture"
    @scopes = ["seed000@seed.test", "seed001@seed.test"].map { |address| provision(address) }
  end

  def provision(address)
    inbox, account = SecureRandom.uuid, SecureRandom.uuid
    fixture_change do
      @admin.exec_params("INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES($1,$2,$3,'private')",
        [inbox, @org, address])
      @admin.exec_params("INSERT INTO app.mailbox_memberships(organization_id,mailbox_id,user_id) VALUES($1,$2,$3)",
        [@org, inbox, @user])
      @admin.exec_params("INSERT INTO app.mailbox_security(organization_id,mailbox_id,classification) VALUES($1,$2,'team')",
        [@org, inbox])
      @admin.exec_params(<<~SQL, [account, @org, inbox])
        INSERT INTO app.inbound_imap_accounts(id,organization_id,mailbox_id,credential_ref,credential_version,active,poll_enabled)
          VALUES($1,$2,$3,'test:scheduled-mox',1,true,true)
      SQL
    end
    @accounts << account
    { account: account, inbox: inbox, address: address }
  end

  def submit_fixture_mail(address)
    # AIDEV-NOTE: Fixture-only raw SMTP populates two consenting inboxes; production sending remains held.
    context = OpenSSL::SSL::SSLContext.new
    context.set_params(verify_mode: OpenSSL::SSL::VERIFY_PEER, ca_file: CA)
    smtp = Net::SMTP.new("localhost", 1587)
    smtp.open_timeout = 3
    smtp.read_timeout = 5
    smtp.enable_starttls(context)
    Timeout.timeout(10) do
      smtp.start("localhost", FROM, @passwords.fetch(FROM), :plain) do |client|
        client.send_message("From: #{FROM}\r\nTo: #{address}\r\nSubject: #{@subject}\r\n" \
          "Content-Type: text/plain; charset=UTF-8\r\n\r\n#{@body}\r\n", FROM, address)
      end
    end
  end

  def with_worker_credentials
    Dir.mktmpdir("scheduled-inbox-bundle-") do |directory|
      path = File.join(directory, "credentials.json")
      entries = @scopes.map do |scope|
        { account_id: scope.fetch(:account), organization_id: @org, mailbox_id: scope.fetch(:inbox),
          credential_version: 1, credential_ref: "test:scheduled-mox", protocol: "imap",
          username: scope.fetch(:address), password: @passwords.fetch(scope.fetch(:address)) }
      end
      File.write(path, JSON.generate(format_version: 1, entries: entries), perm: 0o600)
      yield path
    end
  end

  def transport
    resolver = with_worker_credentials { |path| Elevateo::MailCredentials::Bundle.new(path: path) }
    Elevateo::Inbound::TlsImapTransport.new(host: "localhost", port: 1993, ca_file: CA, credential_resolver: resolver)
  end

  def test_two_scheduled_inboxes_import_once_and_idle_without_reopening
    @scopes.each { |scope| submit_fixture_mail(scope.fetch(:address)) }
    WorkerConnection.establish_connection(url: ENV.fetch("BE02_WORKER_DATABASE_URL"), pool: 1,
      connect_timeout: 5, variables: { statement_timeout: "10s" })
    WorkerConnection.connection_pool.with_connection do |connection|
      assert_equal "elevateo_worker", connection.select_value("SELECT session_user")
      wire = transport
      opened = []
      opening = wire.method(:open)
      wire.define_singleton_method(:open) do |binding:|
        opened << binding.account_id
        opening.call(binding: binding)
      end
      poller = Elevateo::Inbound::ImapPoller.new(connection: connection, transport: wire)
      Timeout.timeout(25) do
        loop do
          @scopes.each do |scope|
            @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_next_at=clock_timestamp() WHERE id=$1", [scope.fetch(:account)])
          end
          2.times { assert_equal :polled, poller.run_once }
          break if @accounts.all? { |account| inbox_receipt(account).length == 1 }
          sleep 0.1
        end
      end
      assert_equal @accounts.sort, opened.first(2).sort
      before = @accounts.to_h { |account| [account, inbox_receipt(account)] }
      @scopes.each do |scope|
        receipt = before.fetch(scope.fetch(:account))
        assert_equal 1, receipt.length
        assert_equal scope.fetch(:inbox), receipt.first.fetch("mailbox_id")
        assert_equal @body, receipt.first.fetch("body_text").strip
        # The shared visibility assertion compares exact stored bytes, including MIME trailing newline.
        @body = receipt.first.fetch("body_text")
        assert_inbox_visibility(receipt.first.fetch("message_id"), scope.fetch(:inbox))
        @body = "Synthetic consenting seed fixture"
        row = @admin.exec_params(<<~SQL, [scope.fetch(:account)]).first
          SELECT poll_lease_token,poll_failures,last_uid,poll_next_at>clock_timestamp() AS scheduled
            FROM app.inbound_imap_accounts WHERE id=$1
        SQL
        assert_nil row.fetch("poll_lease_token")
        assert_equal "0", row.fetch("poll_failures")
        assert_operator row.fetch("last_uid").to_i, :>, 0
        assert_equal "t", row.fetch("scheduled")
      end
      count = opened.length
      assert_equal :idle, poller.run_once
      assert_equal count, opened.length
      @accounts.each { |account| @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_next_at=clock_timestamp() WHERE id=$1", [account]) }
      2.times { assert_equal :polled, poller.run_once }
      assert_equal before, (@accounts.to_h { |account| [account, inbox_receipt(account)] })
    end
  end

  def teardown
    WorkerConnection.remove_connection
    @accounts&.each do |account|
      @admin.exec_params("DELETE FROM app.inbound_imap_receipts WHERE account_id=$1", [account])
      @admin.exec_params("DELETE FROM app.inbound_imap_accounts WHERE id=$1", [account])
    end
    super
  end
end
