# frozen_string_literal: true

require_relative "../be_02/draft_database_test_helper"
require "digest"

# AIDEV-NOTE: Fixtures use admin; every selector, fenced import and finish runs through the restricted worker login.
class ImapPollingDatabaseTestCase < DraftDatabaseTestCase
  def setup
    super
    @accounts = []
    @account = add_account
  end

  def add_account
    id = SecureRandom.uuid
    @admin.exec_params(<<~SQL, [id, @org, @box])
      INSERT INTO app.inbound_imap_accounts(id,organization_id,mailbox_id,credential_ref,credential_version,active,poll_enabled)
        VALUES($1,$2,$3,'test:polling',1,true,true)
    SQL
    @accounts << id
    id
  end

  def teardown
    @accounts&.each do |id|
      @admin.exec_params("DELETE FROM app.inbound_imap_receipts WHERE account_id=$1", [id])
      @admin.exec_params("DELETE FROM app.inbound_imap_accounts WHERE id=$1", [id])
    end
    super
  end

  def lease(connection: @worker)
    raw = connection.exec("SELECT app.lease_due_imap_account()").getvalue(0, 0)
    raw && JSON.parse(raw)
  end

  def finish(token, outcome = "success", version: 1)
    @worker.exec_params("SELECT app.finish_imap_poll($1::uuid,$2::integer,$3::uuid,$4::text)",
      [@account, version, token, outcome]).getvalue(0, 0)
  end

  def claim(token, version: 1)
    JSON.parse(@worker.exec_params("SELECT app.leased_claim_imap_account($1::uuid,$2::integer,$3::uuid)",
      [@account, version, token]).getvalue(0, 0))
  end

  def ingest(token, attachments: false, uid: 1)
    values = [@account, 1, 42, uid, Digest::SHA256.hexdigest("body"),
      JSON.generate(display_name: nil, address: "sender@example.invalid"),
      JSON.generate([{ display_name: nil, address: "inbox@example.invalid" }]), "Poll", "body"]
    name = "app.leased_ingest_imap_mail"
    if attachments
      name += "_with_attachments"
      values << "[]"
    end
    values << token
    types = %w[uuid integer bigint bigint text jsonb jsonb text text]
    types << "jsonb" if attachments
    types << "uuid"
    args = types.each_with_index.map { |type, i| "$#{i + 1}::#{type}" }.join(",")
    JSON.parse(@worker.exec_params("SELECT #{name}(#{args})", values).getvalue(0, 0))
  end

  def account_row
    @admin.exec_params("SELECT * FROM app.inbound_imap_accounts WHERE id=$1", [@account]).first
  end

  def make_due
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_next_at=clock_timestamp()-interval '1 second' WHERE id=$1", [@account])
  end
end
