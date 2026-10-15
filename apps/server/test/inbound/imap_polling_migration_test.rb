# frozen_string_literal: true

require "active_record"
require_relative "imap_polling_database_helper"
require_relative "../../db/migrate/20261016000025_lease_imap_polling"

class ImapPollingMigrationTest < ImapPollingDatabaseTestCase
  def migration
    admin = @admin
    object = LeaseImapPolling.new
    # AIDEV-NOTE: Match the migration runner's owner role; the admin login is only a fixture coordinator.
    object.define_singleton_method(:execute) do |sql|
      admin.exec("SET ROLE elevateo_owner")
      begin
        admin.exec(sql)
      ensure
        admin.exec("RESET ROLE")
      end
    end
    object
  end

  def test_acl_exposes_only_guarded_functions_to_worker
    names = %w[require_imap_poll_lease invalidate_imap_poll_lease] +
      LeaseImapPolling::FUNCTIONS.keys.map { |name| "#{name}_unleased_core" }
    names.each do |name|
      rows = @admin.exec_params(<<~SQL, [name]).to_a
        SELECT pg_get_userbyid(p.proowner) AS owner,
          has_function_privilege('elevateo_worker',p.oid,'EXECUTE') AS worker,
          has_function_privilege('elevateo_api',p.oid,'EXECUTE') AS api,
          has_function_privilege('elevateo_app_read',p.oid,'EXECUTE') AS reader
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname=$1
      SQL
      assert_equal [{ "owner" => "elevateo_owner", "worker" => "f", "api" => "f", "reader" => "f" }], rows
    end
    assert_raises(PG::InsufficientPrivilege) { @api.exec("SELECT app.lease_due_imap_account()") }
    assert_raises(PG::InsufficientPrivilege) { @worker.exec_params("SELECT app.claim_imap_account_unleased_core($1::uuid,1)", [@account]) }
    assert_raises(PG::InsufficientPrivilege) { @worker.exec_params("SELECT app.require_imap_poll_lease($1::uuid,1,NULL)", [@account]) }
    assert_raises(PG::InsufficientPrivilege) { @api.exec("SELECT app.finish_imap_poll(NULL,1,NULL,'success')") }
    assert_raises(PG::InsufficientPrivilege) { @worker.exec("SELECT * FROM app.inbound_imap_accounts") }
  end

  def test_down_refuses_leases_and_quiesced_roundtrip_restores_signatures
    token = lease.fetch("lease_token")
    object = migration
    assert_raises(PG::ObjectNotInPrerequisiteState) { object.down }
    assert_equal token, account_row.fetch("poll_lease_token")
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_enabled=false WHERE id=$1", [@account])
    before = definitions
    object.down
    dropped = true
    assert_equal @account, JSON.parse(@worker.exec_params("SELECT app.claim_imap_account($1::uuid,1)", [@account]).getvalue(0, 0)).fetch("account_id")
    assert_raises(PG::InsufficientPrivilege) { @api.exec_params("SELECT app.claim_imap_account($1::uuid,1)", [@account]) }
    object.up
    dropped = false
    assert_equal before, definitions
    assert_equal "f", account_row.fetch("poll_enabled")
    assert_nil lease
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_enabled=true WHERE id=$1", [@account])
    assert_equal @account, lease.fetch("account_id")
  ensure
    object.up if dropped
  end

  def definitions
    @admin.exec(<<~SQL).to_a
      SELECT proname,pg_get_function_identity_arguments(p.oid) AS args,
        pg_get_functiondef(p.oid) AS body,proacl::text AS acl,pg_get_userbyid(proowner) AS owner
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app'
          AND (proname LIKE '%imap%') ORDER BY proname,args
    SQL
  end
end
