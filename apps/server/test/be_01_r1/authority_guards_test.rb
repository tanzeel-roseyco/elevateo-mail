# frozen_string_literal: true

require_relative "test_helper"

# AIDEV-NOTE: Synthetic catalog rows test rejection without granting runtime roles real authority or ownership.
class AuthorityGuardsTest < RestrictedRoleTest
  Catalog = Data.define(:connection, :owner_oid, :catalog) do
    def select_value(sql)
      connection.select_value(<<~SQL + sql)
        WITH pg_shdepend AS (
          SELECT 'pg_authid'::regclass AS refclassid, 'o'::"char" AS deptype,
                 '#{owner_oid}'::regrole AS refobjid, '#{catalog}'::regclass AS classid
        )
      SQL
    end
  end

  def test_schema_ownership_is_rejected_without_a_relation_owner
    profile = Catalog.new(connection: @connection, owner_oid: "elevateo_app_read", catalog: "pg_namespace")
    assert_raises(R1AuthorityGuards::SetupError) { guard_no_object_ownership(profile) }
  end

  def test_function_type_and_database_ownership_are_rejected
    %w[pg_proc pg_type pg_database].each do |catalog|
      profile = Catalog.new(connection: @connection, owner_oid: "elevateo_app_read", catalog: catalog)
      assert_raises(R1AuthorityGuards::SetupError) { guard_no_object_ownership(profile) }
    end
  end

  def test_unrelated_owner_is_not_rejected
    profile = Catalog.new(connection: @connection, owner_oid: "elevateo_owner", catalog: "pg_namespace")
    guard_no_object_ownership(profile)
  end

  PrivilegedCatalog = Data.define(:connection, :createdb, :replication) do
    def select_value(sql)
      connection.select_value(<<~SQL + sql)
        WITH pg_roles AS (
          SELECT current_user::regrole::oid AS oid, 'synthetic_target'::text AS rolname,
                 false AS rolsuper, #{createdb} AS rolcreatedb, false AS rolcreaterole,
                 #{replication} AS rolreplication, false AS rolbypassrls
        )
      SQL
    end
  end

  def test_createdb_and_replication_targets_are_rejected_with_real_set_authority
    [[true, false], [false, true]].each do |createdb, replication|
      profile = PrivilegedCatalog.new(connection: @connection, createdb: createdb, replication: replication)
      assert_raises(R1AuthorityGuards::SetupError) { guard_no_privileged_membership(profile) }
    end
    guard_no_privileged_membership(PrivilegedCatalog.new(connection: @connection, createdb: false, replication: false))
  end

  # Query-double branch coverage only: SET is false; real malicious memberships remain a runtime gate.
  InheritedProfile = Data.define(:usage, :admin) do
    def select_value(sql)
      raise "privileged targets omitted" unless sql.include?("'elevateo_owner', 'elevateo_migrator'")
      (sql.include?("'USAGE'") && usage) || (sql.include?("'MEMBER WITH ADMIN OPTION'") && admin) ? 1 : 0
    end
  end

  def test_worker_inherited_owner_authority_is_rejected_when_set_is_false
    assert_raises(R1AuthorityGuards::SetupError) do
      guard_no_privileged_membership(InheritedProfile.new(usage: true, admin: false))
    end
    guard_no_privileged_membership(InheritedProfile.new(usage: false, admin: false))
  end

  def test_admin_authority_is_rejected_when_set_and_usage_are_false
    assert_raises(R1AuthorityGuards::SetupError) do
      guard_no_privileged_membership(InheritedProfile.new(usage: false, admin: true))
    end
  end
end
