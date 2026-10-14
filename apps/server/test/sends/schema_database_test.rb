# frozen_string_literal: true

require_relative "approval_database_helper"

class SendSchemaDatabaseTest < SendDatabaseTestCase
  def test_send_owner_grants_preserve_existing_owner_bridge_boundaries
    grants = File.read(File.expand_path("../../db/be03_send/grants.sql", __dir__))
    @admin.exec("BEGIN; SET LOCAL ROLE elevateo_send_owner")
    @admin.exec(grants)
    assert_equal "elevateo_owner", @admin.exec(<<~SQL).getvalue(0, 0)
      SELECT proowner::regrole::text FROM pg_proc
        WHERE oid = 'app_send_private.preserve_consumed_draft()'::regprocedure
    SQL
    %w[elevateo_api elevateo_worker elevateo_app_read].each do |role|
      assert_equal "0", @admin.exec_params(<<~SQL, [role]).getvalue(0, 0)
        SELECT count(*) FROM pg_proc WHERE pronamespace = 'app_send_private'::regnamespace
          AND has_function_privilege($1,oid,'EXECUTE')
          AND oid NOT IN ('app_send_private.claim_job(uuid,uuid,uuid,integer)'::regprocedure,
            'app_send_private.authorize_attempt(uuid,uuid,bigint,uuid,uuid,bytea,text,integer)'::regprocedure,
            'app_send_private.record_observation(uuid,uuid,bigint,uuid,uuid,text,text,bytea)'::regprocedure,
            'app_send_private.worker_binding(uuid,uuid,bigint,uuid)'::regprocedure,
            'app_send_private.final_attempt_check(uuid,uuid,bigint,uuid,uuid)'::regprocedure,
            'app_send_private.reconcile_no_evidence(uuid,uuid,bigint,uuid)'::regprocedure)
      SQL
    end
    assert_equal "t", @admin.exec(<<~SQL).getvalue(0, 0)
      SELECT has_function_privilege('elevateo_send_owner',
        'app_send_private.consume_draft(text,uuid,uuid,integer)','EXECUTE')
    SQL
    # Roll back the historical grant replay; migration 00010 grants worker-only functions.
    @admin.exec("ROLLBACK")
    refute approve.key?("code")
    assert_equal [1, 1, 1, 1], counts
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end

  def test_runtime_roles_cannot_read_tables_or_execute_private_bridges
    %w[elevateo_api elevateo_worker elevateo_app_read].each do |role|
      row = @admin.exec_params(<<~SQL, [role]).first
        SELECT has_schema_privilege($1,'app_send_private','USAGE') AS schema_usage,
          has_schema_privilege($1,'app_send_private','CREATE') AS schema_create,
          pg_has_role($1,'elevateo_send_owner','SET,USAGE,MEMBER') AS owner_access,
          has_function_privilege($1,'app_send_private.read_draft_binding(uuid,uuid)','EXECUTE') AS bridge_access,
          has_table_privilege($1,'app_send_private.intents','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS table_access
      SQL
      assert_equal({ "schema_usage" => role == "elevateo_worker" ? "t" : "f", "schema_create" => "f",
        "owner_access" => "f", "bridge_access" => "f", "table_access" => "f" }, row)
    end
    assert_raises(PG::InsufficientPrivilege) { @api.exec("SELECT * FROM app_send_private.intents") }
    assert_raises(PG::InsufficientPrivilege) { @worker.exec_params("SELECT app.approve_draft_send($1,$2,$3,$4,1,$5,NULL,$6)", [@digest,@box,@draft,@operation,@review_digest,@epoch]) }
    assert_equal [0, 0, 0, 0], counts
  end

  def test_all_private_tables_force_owner_only_rls
    rows = @admin.exec(<<~SQL).to_a
      SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname
        FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner
        WHERE c.relnamespace='app_send_private'::regnamespace AND c.relkind='r'
    SQL
    assert_equal 10, rows.length
    rows.each do |row|
      assert_equal "t", row.fetch("relrowsecurity")
      assert_equal "t", row.fetch("relforcerowsecurity")
      assert_equal "elevateo_send_owner", row.fetch("rolname")
    end
  end

  def test_snapshot_and_approval_audit_are_immutable_and_parent_delete_is_restricted
    result = approve
    assert_raises(PG::ObjectNotInPrerequisiteState) do
      @admin.exec_params("UPDATE app_send_private.intents SET review_digest = repeat('b',64) WHERE send_id = $1", [result.fetch("send_id")])
    end
    assert_raises(PG::ObjectNotInPrerequisiteState) { @admin.exec("DELETE FROM app_send_private.audit_events") }
    assert_raises(PG::ForeignKeyViolation) { @admin.exec_params("DELETE FROM app.drafts WHERE id = $1", [@draft]) }
    assert_raises(PG::ObjectNotInPrerequisiteState) { @admin.exec_params("UPDATE app.drafts SET state = 'editable' WHERE id = $1", [@draft]) }
    assert_equal [1, 1, 1, 1], counts
  end

  def test_deferred_completeness_blocks_partial_history_and_down_refuses_nonempty
    @admin.exec(<<~SQL)
      CREATE FUNCTION app_send_private.fixture_skip_job() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RETURN NULL; END $$;
      CREATE TRIGGER fixture_skip_job BEFORE INSERT ON app_send_private.jobs
        FOR EACH ROW EXECUTE FUNCTION app_send_private.fixture_skip_job();
    SQL
    assert_raises(PG::CheckViolation) { approve }
    assert_equal [0, 0, 0, 0], counts
    @admin.exec("DROP TRIGGER fixture_skip_job ON app_send_private.jobs; DROP FUNCTION app_send_private.fixture_skip_job()")
    result = approve
    @admin.exec("BEGIN")
    @admin.exec_params("DELETE FROM app_send_private.jobs WHERE send_id = $1", [result.fetch("send_id")])
    assert_raises(PG::CheckViolation) { @admin.exec("COMMIT") }
    assert_equal [1, 1, 1, 1], counts
    down = File.read(File.expand_path("../../db/be03_send/down.sql", __dir__))
    assert_raises(PG::ObjectNotInPrerequisiteState) { @admin.exec("SET ROLE elevateo_send_owner; #{down}") }
  ensure
    if @admin
      @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
      @admin.exec("DROP TRIGGER IF EXISTS fixture_skip_job ON app_send_private.jobs; DROP FUNCTION IF EXISTS app_send_private.fixture_skip_job()")
    end
    @admin.exec("RESET ROLE") if @admin
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end
  def test_empty_down_removes_only_send_objects_and_transaction_rollback_restores_them
    @admin.exec("BEGIN")
    worker_down = File.read(File.expand_path("../../db/be03_send/worker_authority_down.sql", __dir__))
    @admin.exec(worker_down)
    @admin.exec("SET LOCAL ROLE elevateo_send_owner")
    down = File.read(File.expand_path("../../db/be03_send/down.sql", __dir__))
    @admin.exec(down)
    assert_nil @admin.exec("SELECT to_regclass('app_send_private.intents')").getvalue(0, 0)
    assert_equal "1", @admin.exec_params("SELECT version FROM app.drafts WHERE id = $1", [@draft]).getvalue(0, 0)
    assert_nil @admin.exec("SELECT to_regprocedure('app.send_review(uuid,uuid)')").getvalue(0, 0)
    @admin.exec("ROLLBACK")
    refute_nil @admin.exec("SELECT to_regclass('app_send_private.intents')").getvalue(0, 0)
    refute approve.key?("code")
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end

end
