# frozen_string_literal: true

require "active_record"
require_relative "../be_02/draft_database_test_helper"
require_relative "../../db/migrate/20261016000021_bind_imap_credentials_to_account"

class ImapBindingMigrationTest < DraftDatabaseTestCase
  def test_down_and_up_preserve_owner_acl_and_worker_only_boundary
    account = SecureRandom.uuid
    @admin.exec_params(<<~SQL, [account, @org, @box])
      INSERT INTO app.inbound_imap_accounts(id,organization_id,mailbox_id,credential_ref,credential_version,active)
      VALUES($1,$2,$3,'test:synthetic-only',1,true)
    SQL
    original = definition
    privileges = authority
    admin = @admin
    migration = BindImapCredentialsToAccount.new
    # AIDEV-NOTE: Execute the real migration DDL on the isolated admin connection; runtime calls use actual worker/API logins.
    migration.define_singleton_method(:execute) { |sql| admin.exec(sql) }
    migration.down
    assert_equal %w[credential_ref last_uid uidvalidity], claim(account).keys.sort
    assert_equal privileges, authority
    assert_raises(PG::InsufficientPrivilege) { claim(account, connection: @api) }
    migration.up
    assert_equal %w[account_id credential_ref credential_version last_uid mailbox_id organization_id uidvalidity],
      claim(account).keys.sort
    assert_equal original, definition
    assert_equal privileges, authority
    assert_raises(PG::InsufficientPrivilege) { claim(account, connection: @api) }
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET active=false WHERE id=$1", [account])
    assert_raises(PG::InsufficientPrivilege) { claim(account) }
  ensure
    # AIDEV-NOTE: Restore the exact function even after a failed rollback assertion so later suites see the original schema.
    @admin.exec(original) if @admin && original
    @admin.exec_params("DELETE FROM app.inbound_imap_accounts WHERE id=$1", [account]) if @admin && account
  end

  def claim(account, connection: @worker)
    JSON.parse(connection.exec_params("SELECT app.claim_imap_account($1::uuid,1)", [account]).getvalue(0, 0))
  end

  def definition
    @admin.exec("SELECT pg_get_functiondef('app.claim_imap_account(uuid,integer)'::regprocedure)").getvalue(0, 0)
  end

  def authority
    @admin.exec(<<~SQL).first
      SELECT pg_get_userbyid(proowner) AS owner,proacl::text AS acl,prosecdef::text AS definer,proconfig::text AS config
        FROM pg_proc WHERE oid='app.claim_imap_account(uuid,integer)'::regprocedure
    SQL
  end
end
