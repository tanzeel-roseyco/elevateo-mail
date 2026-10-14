# frozen_string_literal: true

require_relative "database_test_helper"

# AIDEV-NOTE: Exercise bootstrap's exact private-schema SQL block; full psql bootstrap remains a Soren runner gate.
class DraftSchemaContractTest < SessionDatabaseTestCase
  PARTS = File.expand_path("../../db/be02_drafts", __dir__)
  BOOTSTRAP_PATH = File.expand_path("../../../../ops/db/bootstrap.sql", __dir__)

  def test_bootstrap_rerun_preserves_nonempty_schema_and_acl_representation
    [false, true].each do |explicit|
      transaction do
        assert_nil namespace.fetch("nspacl"), "default ACL prerequisite must be proven"
        @admin.exec("GRANT CREATE, USAGE ON SCHEMA app_drafts_private TO elevateo_owner") if explicit
        refute_nil namespace.fetch("nspacl") if explicit
        @admin.exec("CREATE TABLE app_drafts_private.be403_bootstrap_sentinel (id integer)")
        @admin.exec("INSERT INTO app_drafts_private.be403_bootstrap_sentinel VALUES (11)")
        before = namespace
        @admin.exec(bootstrap_sql)
        assert_equal before, namespace
        assert_equal "11", @admin.exec("SELECT id FROM app_drafts_private.be403_bootstrap_sentinel").getvalue(0, 0)
      end
    end
  end

  def test_creation_default_privilege_leakage_fails_atomically
    transaction do
      # AIDEV-NOTE: Rename is transaction-local and preserves all BE03 FKs while making bootstrap create a new schema.
      @admin.exec("ALTER SCHEMA app_drafts_private RENAME TO be403_default_privilege_probe")
      assert_nil namespace
      @admin.exec("ALTER DEFAULT PRIVILEGES FOR ROLE elevateo_owner GRANT USAGE ON SCHEMAS TO elevateo_api")
      rejects_bootstrap
      assert_nil namespace
      refute_nil @admin.exec("SELECT to_regnamespace('be403_default_privilege_probe')").getvalue(0, 0)
      refute_nil @admin.exec("SELECT to_regclass('app.drafts')").getvalue(0, 0)
    end
  end

  def test_newer_send_dependencies_block_legacy_downgrade_atomically
    skip "BE03 send schema is absent" unless @admin.exec("SELECT to_regclass('app_send_private.intents')").getvalue(0, 0)

    transaction do
      @admin.exec("SET LOCAL ROLE elevateo_send_owner")
      @admin.exec("SAVEPOINT send_dependency_probe")
      error = assert_raises(PG::DependentObjectsStillExist) do
        @admin.exec(File.read(File.expand_path("../../db/be03_send/down.sql", __dir__)))
      end
      assert_equal "2BP01", error.result.error_field(PG::Result::PG_DIAG_SQLSTATE)
      @admin.exec("ROLLBACK TO SAVEPOINT send_dependency_probe")
      refute_nil @admin.exec("SELECT to_regclass('app_send_private.intents')").getvalue(0, 0)
      refute_nil @admin.exec("SELECT to_regclass('app.drafts')").getvalue(0, 0)
    end
  end

  def test_bootstrap_rejects_owner_privilege_loss_and_foreign_acl_without_repair
    ["REVOKE CREATE ON SCHEMA app_drafts_private FROM elevateo_owner",
     "REVOKE USAGE ON SCHEMA app_drafts_private FROM elevateo_owner",
     "REVOKE ALL ON SCHEMA app_drafts_private FROM elevateo_owner",
     "GRANT USAGE ON SCHEMA app_drafts_private TO elevateo_api",
     "GRANT USAGE ON SCHEMA app_drafts_private TO supabase_admin",
     "GRANT CREATE ON SCHEMA app_drafts_private TO PUBLIC"].each do |drift|
      transaction do
        @admin.exec(drift)
        before = namespace
        rejects_bootstrap
        assert_equal before, namespace
        refute_nil @admin.exec("SELECT to_regclass('app.drafts')").getvalue(0, 0)
      end
    end
  end

  def test_wrong_owner_with_empty_acl_cannot_bypass_ownership_guard
    transaction do
      @admin.exec("ALTER SCHEMA app_drafts_private OWNER TO supabase_admin")
      @admin.exec("REVOKE ALL ON SCHEMA app_drafts_private FROM supabase_admin")
      before = namespace
      rejects_bootstrap
      assert_equal before, namespace
    end
  end

  def test_effective_inherited_runtime_access_fails_with_owner_only_acl
    transaction do
      before = namespace
      @admin.exec("GRANT elevateo_owner TO elevateo_api WITH INHERIT TRUE, SET FALSE")
      assert_equal "t", @admin.exec("SELECT has_schema_privilege('elevateo_api', 'app_drafts_private', 'USAGE')").getvalue(0, 0)
      rejects_bootstrap
      assert_equal before, namespace
    end
  end

  private

  def bootstrap_sql
    File.read(BOOTSTRAP_PATH).match(/-- AIDEV-NOTE: Private schema[^\n]*\n(DO \$\$ BEGIN.*?END \$\$;)/m)[1]
  end

  def namespace
    @admin.exec("SELECT oid::text, nspowner::text, nspacl::text FROM pg_namespace WHERE nspname='app_drafts_private'").first
  end

  def rejects_bootstrap
    @admin.exec("SAVEPOINT bootstrap_probe")
    error = assert_raises(PG::RaiseException) { @admin.exec(bootstrap_sql) }
    assert_includes error.message, "bootstrap prerequisite failed"
  ensure
    @admin.exec("ROLLBACK TO SAVEPOINT bootstrap_probe")
  end

  def transaction
    @admin.exec("BEGIN")
    yield
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end
end
