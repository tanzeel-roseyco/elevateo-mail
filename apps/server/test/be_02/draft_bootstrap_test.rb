# frozen_string_literal: true

require_relative "database_test_helper"

# AIDEV-NOTE: Administrative drift stays transaction-local; migration SQL runs as the actual migration owner.
class DraftBootstrapTest < SessionDatabaseTestCase
  PARTS = File.expand_path("../../db/be02_drafts", __dir__)

  def test_schema_owner_and_runtime_denials
    assert_equal "elevateo_owner", @admin.exec(<<~SQL).getvalue(0, 0)
      SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname = 'app_drafts_private'
    SQL
    %w[elevateo_owner elevateo_migrator elevateo_api elevateo_worker elevateo_app_read].each do |role|
      assert_equal "f", @admin.exec_params("SELECT has_database_privilege($1, current_database(), 'CREATE')", [role]).getvalue(0, 0)
    end
    [@api, @worker].each do |connection|
      assert_equal "f", connection.exec("SELECT has_schema_privilege(current_user, 'app_drafts_private', 'USAGE, CREATE')").getvalue(0, 0)
      error = assert_raises(PG::InsufficientPrivilege) { connection.exec("SELECT * FROM app_drafts_private.operations") }
      assert_equal "42501", error.result.error_field(PG::Result::PG_DIAG_SQLSTATE)
    end
  end

  def test_down_reapply_preserves_schema_without_database_create
    @migrator = connect("BE02_MIGRATOR_DATABASE_URL", "elevateo_migrator")
    begin
      assert_equal "elevateo_owner", @migrator.exec("SELECT current_user").getvalue(0, 0)
      @migrator.exec("BEGIN")
      @migrator.exec("CREATE TABLE app_drafts_private.be403_sentinel (id integer)")
      @migrator.exec("INSERT INTO app_drafts_private.be403_sentinel VALUES (7)")
      @migrator.exec(File.read(File.join(PARTS, "prerequisite.sql")))
      @migrator.exec(File.read(File.join(PARTS, "down.sql")))
      assert_equal "7", @migrator.exec("SELECT id FROM app_drafts_private.be403_sentinel").getvalue(0, 0)
      assert_equal "app_drafts_private", @migrator.exec("SELECT 'app_drafts_private'::regnamespace::text").getvalue(0, 0)
      assert_nil @migrator.exec("SELECT to_regclass('app.drafts')").getvalue(0, 0)
      %w[prerequisite tables policies scope save operations grants].each do |part|
        @migrator.exec(File.read(File.join(PARTS, "#{part}.sql")))
      end
      refute_nil @migrator.exec("SELECT to_regclass('app_drafts_private.operations')").getvalue(0, 0)
    ensure
      begin
        @migrator.exec("ROLLBACK") if @migrator.transaction_status != PG::PQTRANS_IDLE
      ensure
        close_connections([@migrator])
      end
    end
    refute_nil @admin.exec("SELECT to_regclass('app.drafts')").getvalue(0, 0)
  end

  def test_missing_schema_owner_drift_and_acl_drift_fail_before_mutation
    ["DROP SCHEMA app_drafts_private", "ALTER SCHEMA app_drafts_private OWNER TO supabase_admin",
     "GRANT USAGE ON SCHEMA app_drafts_private TO elevateo_api",
     "GRANT CREATE ON SCHEMA app_drafts_private TO PUBLIC",
     "REVOKE CREATE ON SCHEMA app_drafts_private FROM elevateo_owner",
     "REVOKE USAGE ON SCHEMA app_drafts_private FROM elevateo_owner",
     "REVOKE ALL ON SCHEMA app_drafts_private FROM elevateo_owner"].each do |drift|
      transaction do
        @admin.exec("SET LOCAL ROLE elevateo_owner")
        @admin.exec(File.read(File.join(PARTS, "prerequisite.sql")))
        @admin.exec(File.read(File.join(PARTS, "down.sql")))
        @admin.exec("RESET ROLE")
        @admin.exec(drift)
        @admin.exec("SET LOCAL ROLE elevateo_owner")
        @admin.exec("SAVEPOINT prerequisite")
        error = assert_raises(PG::RaiseException) { @admin.exec(File.read(File.join(PARTS, "prerequisite.sql"))) }
        assert_includes error.message, "bootstrap prerequisite failed"
        @admin.exec("ROLLBACK TO SAVEPOINT prerequisite")
        assert_nil @admin.exec("SELECT to_regclass('app.drafts')").getvalue(0, 0)
      end
    end
  end

  def test_admin_current_user_rejected_without_mutation
    transaction do
      @admin.exec("SAVEPOINT prerequisite")
      error = assert_raises(PG::RaiseException) do
        @admin.exec(File.read(File.join(PARTS, "prerequisite.sql")))
      end
      assert_includes error.message, "migration requires owner"
      @admin.exec("ROLLBACK TO SAVEPOINT prerequisite")
      refute_nil @admin.exec("SELECT to_regclass('app.drafts')").getvalue(0, 0)
    end
  end

  def test_down_dependency_failure_restores_all_prior_object_drops
    transaction do
      @admin.exec("SET LOCAL ROLE elevateo_owner")
      @admin.exec("CREATE VIEW app_drafts_private.be403_dependency AS SELECT id FROM app.drafts")
      @admin.exec("SAVEPOINT down_probe")
      error = assert_raises(PG::Error) do
        @admin.exec(File.read(File.join(PARTS, "prerequisite.sql")) + File.read(File.join(PARTS, "down.sql")))
      end
      assert_equal "2BP01", error.result.error_field(PG::Result::PG_DIAG_SQLSTATE)
      @admin.exec("ROLLBACK TO SAVEPOINT down_probe")
      %w[app.drafts app_drafts_private.operations app_drafts_private.be403_dependency].each do |object|
        refute_nil @admin.exec_params("SELECT to_regclass($1)", [object]).getvalue(0, 0)
      end
    end
  end

  private

  def transaction
    @admin.exec("BEGIN")
    yield
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end
end
