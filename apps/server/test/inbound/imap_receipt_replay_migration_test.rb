# frozen_string_literal: true

require "active_record"
require_relative "imap_polling_database_helper"
require_relative "../../db/migrate/20261016000027_restore_imap_receipt_cursor"

# AIDEV-NOTE: Roundtrip proof checks exact bodies/OIDs/ACLs and preserves existing receipt identity through rollback.
class ImapReceiptReplayMigrationTest < ImapPollingDatabaseTestCase
  def definitions
    @admin.exec(<<~SQL).to_a
      SELECT p.oid,proname,pg_get_functiondef(p.oid) AS body,proacl::text AS acl,pg_get_userbyid(proowner) AS owner
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='app' AND proname IN ('ingest_imap_mail_unleased_core','ingest_imap_mail_with_attachments_unleased_core')
      ORDER BY proname
    SQL
  end

  def test_roundtrip_preserves_restricted_acl_and_receipts
    before = definitions
    assert_equal 2, before.length
    admin = @admin
    object = RestoreImapReceiptCursor.new
    object.define_singleton_method(:execute) do |sql|
      admin.exec("SET ROLE elevateo_owner")
      begin
        admin.exec(sql)
      ensure
        admin.exec("RESET ROLE")
      end
    end
    token = lease.fetch("lease_token")
    first = ingest(token)
    dropped = true
    object.down
    assert_equal before.map { |row| row.values_at("oid", "acl", "owner") }, (definitions.map { |row| row.values_at("oid", "acl", "owner") })
    assert_equal "duplicate", ingest(token).fetch("result")
    object.up
    dropped = false
    assert_equal before, definitions
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET last_uid=0 WHERE id=$1", [@account])
    assert_equal first.fetch("message_id"), ingest(token).fetch("message_id")
    assert_equal "1", account_row.fetch("last_uid")
    assert_raises(PG::InsufficientPrivilege) do
      @worker.exec("SELECT app.ingest_imap_mail_unleased_core(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)")
    end
  ensure
    object.up if dropped
  end
end
