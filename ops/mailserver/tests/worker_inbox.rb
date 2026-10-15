# frozen_string_literal: true

require "active_record"
require "/workspace/apps/server/lib/elevateo/inbound/imap_sync"
require "/workspace/apps/server/lib/elevateo/inbound/imap_worker_store"

# AIDEV-NOTE: Use the real restricted worker adapter and API RLS; administrative SQL only provisions and observes.
module MoxInboxProof
  class WorkerConnection < ActiveRecord::Base
    self.abstract_class = true
  end

  def assert_inbox_import
    inbox, account = SecureRandom.uuid, SecureRandom.uuid
    fixture_change do
      @admin.exec_params("INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES($1,$2,$3,'private')",
        [inbox, @org, self.class::TO])
      @admin.exec_params("INSERT INTO app.mailbox_memberships(organization_id,mailbox_id,user_id) VALUES($1,$2,$3)",
        [@org, inbox, @user])
      @admin.exec_params("INSERT INTO app.mailbox_security(organization_id,mailbox_id,classification) VALUES($1,$2,'team')",
        [@org, inbox])
      @admin.exec_params(<<~SQL, [account, @org, inbox])
        INSERT INTO app.inbound_imap_accounts(id,organization_id,mailbox_id,credential_ref,credential_version,active)
          VALUES($1,$2,$3,'test:mox-composition',1,true)
      SQL
    end
    WorkerConnection.establish_connection(url: ENV.fetch("BE02_WORKER_DATABASE_URL"), pool: 1,
      connect_timeout: 5, variables: { statement_timeout: "10s" })
    WorkerConnection.connection_pool.with_connection do |connection|
      assert_equal "elevateo_worker", connection.select_value("SELECT session_user")
      transport = inbox_transport
      sync = Elevateo::Inbound::ImapSync.new(
        store: Elevateo::Inbound::ImapWorkerStore.new(connection: connection), transport: transport)
      cursor = sync.run(account_id: account, credential_version: 1)
      assert_operator cursor, :>, 0
      first = inbox_receipt(account)
      assert_equal 1, first.length
      assert_equal @body, first.first.fetch("body_text").gsub("\r\n", "\n")
      assert_equal inbox, first.first.fetch("mailbox_id")
      assert_equal cursor, sync.run(account_id: account, credential_version: 1)
      assert_equal first, inbox_receipt(account)
      assert_inbox_visibility(first.first.fetch("message_id"), inbox)
      # AIDEV-NOTE: SQL revocation is checked before resolving credentials or opening another IMAP connection.
      @admin.exec_params("UPDATE app.inbound_imap_accounts SET active=false WHERE id=$1", [account])
      transport.define_singleton_method(:open) { |**_| raise "revoked account reached IMAP transport" }
      error = assert_raises(ActiveRecord::StatementInvalid) { sync.run(account_id: account, credential_version: 1) }
      assert_instance_of PG::InsufficientPrivilege, error.cause
      assert_equal first, inbox_receipt(account)
    end
  ensure
    WorkerConnection.remove_connection
    if @admin && account
      @admin.exec_params("DELETE FROM app.inbound_imap_receipts WHERE account_id=$1", [account])
      @admin.exec_params("DELETE FROM app.inbound_imap_accounts WHERE id=$1", [account])
    end
  end

  def inbox_transport
    Elevateo::Inbound::TlsImapTransport.new(host: "localhost", port: 1993, ca_file: self.class::CA,
      credential_resolver: ->(reference) {
        raise "unexpected IMAP reference" unless reference == "test:mox-composition"
        [self.class::TO, @passwords.fetch(self.class::TO)]
      })
  end

  def inbox_receipt(account)
    @admin.exec_params(<<~SQL, [account, @subject]).to_a
      SELECT r.message_id,r.mailbox_id,m.body_text FROM app.inbound_imap_receipts r
        JOIN app.messages m ON m.id=r.message_id JOIN app.threads t ON t.id=r.thread_id
        WHERE r.account_id=$1 AND t.subject=$2
    SQL
  end

  def assert_inbox_visibility(message, inbox)
    begin_write
    read = -> { @api.exec_params("SELECT body_text FROM app.messages WHERE id=$1 AND mailbox_id=$2", [message, inbox]).to_a }
    assert_equal [{ "body_text" => @body }], read.call
    @api.exec_params("SELECT set_config('app.user_id',$1,true)", [SecureRandom.uuid])
    assert_empty read.call
    @api.exec_params("SELECT set_config('app.user_id',$1,true),set_config('app.org_id',$2,true)", [@user, SecureRandom.uuid])
    assert_empty read.call
  ensure
    @api.exec("ROLLBACK") unless @api.transaction_status == PG::PQTRANS_IDLE
  end
end
