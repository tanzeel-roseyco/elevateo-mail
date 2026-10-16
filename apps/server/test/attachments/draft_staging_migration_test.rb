# frozen_string_literal: true

require "active_record"
require_relative "draft_staging_database_helper"
require_relative "../../db/migrate/20261016000028_create_draft_attachment_staging"

# AIDEV-NOTE: Rollback may remove empty scaffolding but must never erase quarantined operations or bytes.
class DraftStagingMigrationTest < DraftStagingDatabaseTestCase
  def definitions
    @admin.exec(<<~SQL).to_a
      SELECT n.nspname,p.proname,pg_get_functiondef(p.oid) AS body,p.proacl::text AS acl,
        pg_get_userbyid(p.proowner) AS owner
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE (n.nspname='app' AND p.proname IN ('reserve_draft_attachment','finalize_draft_attachment',
        'list_draft_attachments','due_draft_attachment_scans','claim_draft_attachment_scan','record_draft_attachment_scan'))
        OR (n.nspname='app_drafts_private' AND p.proname IN ('lock_attachment_draft','attachment_stage_result','retire_deleted_draft_attachments'))
      ORDER BY n.nspname,p.proname
    SQL
  end

  def migration(direction, connection: @admin)
    object = CreateDraftAttachmentStaging.new
    admin = connection
    object.define_singleton_method(:execute) { |sql| admin.exec(sql) }
    connection.exec("BEGIN")
    connection.exec("SET LOCAL ROLE elevateo_owner")
    object.public_send(direction)
    connection.exec("COMMIT")
  ensure
    connection.exec("ROLLBACK") if connection.transaction_status != PG::PQTRANS_IDLE
  end

  def test_empty_roundtrip_restores_body_owner_acl_and_api_worker_behavior
    before = definitions
    assert_equal 9, before.length
    migration(:down)
    dropped = true
    assert_empty definitions
    assert_nil @admin.exec("SELECT to_regclass('app.draft_attachments')").getvalue(0, 0)
    migration(:up)
    dropped = false
    assert_equal before, definitions
    assert_equal "reserved", reserve.fetch("stage_state")
    assert_equal "committed", finalize.fetch("stage_state")
    token, = claim
    assert_equal "t", verdict(token, 1, "clean")
    assert_equal "clean", attachment_list.fetch("items").fetch(0).fetch("status")
    assert_raises(PG::InsufficientPrivilege) { @api.exec("SELECT * FROM app.draft_attachments") }
    assert_raises(PG::InsufficientPrivilege) { @worker.exec("SELECT * FROM app_drafts_private.attachment_stage_operations") }
  ensure
    migration(:up) if dropped
  end

  def test_populated_rollback_refuses_before_any_destruction
    reserve
    before = definitions
    operations = stage_rows
    assert_raises(PG::RaiseException) { migration(:down) }
    assert_equal before, definitions
    assert_equal operations, stage_rows
    assert_equal "committed", finalize.fetch("stage_state")
    attachment = scan_row
    assert_raises(PG::RaiseException) { migration(:down) }
    assert_equal before, definitions
    assert_equal attachment, scan_row
    assert_equal "committed", stage_rows.first.fetch("stage_state")
  end

  # AIDEV-NOTE: An invisible uncommitted upload must block rollback before its empty check, then prevent destruction.
  def test_rollback_waits_for_inflight_reservation_then_preserves_it
    owner = connect("BE02_ADMIN_DATABASE_URL", "supabase_admin")
    begin_write
    assert_equal "ok", write_guard.fetch("status")
    assert_equal "reserved", reserve_sql.fetch("stage_state")
    before = definitions
    thread = Thread.new do
      migration(:down, connection: owner)
    rescue PG::Error => error
      error
    end
    thread.report_on_exception = false
    wait_for_lock(owner, blocker: @api.backend_pid, lock_kind: "relation")
    @api.exec("COMMIT")
    assert thread.join(5), "rollback query did not settle"
    assert_instance_of PG::RaiseException, thread.value
    assert_equal before, definitions
    assert_equal "reserved", stage_rows.first.fetch("stage_state")
    assert_equal "committed", finalize.fetch("stage_state")
  ensure
    # AIDEV-NOTE: Always release the writer before draining migration; restore empty scaffolding on regression.
    failure = $!
    begin
      @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
    rescue StandardError => error
      failure ||= error
    ensure
      begin
        if thread && !thread.join(5)
          failure ||= RuntimeError.new("rollback test thread exceeded cleanup bound")
          thread.kill
          thread.join(1)
        end
        migration(:up) unless @admin.exec("SELECT to_regclass('app.draft_attachments')").getvalue(0, 0)
      rescue StandardError, Minitest::Assertion => error
        failure ||= error
      ensure
        close_connections([owner])
      end
    end
    raise failure if failure
  end
end
