# frozen_string_literal: true

# AIDEV-NOTE: Baseline admits only the measured legacy edge; every unrelated authority guard stays mandatory.
module R1AuthorityGuards
  class SetupError < StandardError; end

  def guard!(condition, message)
    raise SetupError, message unless condition
  end

  # AIDEV-NOTE: Owner dependencies cover schemas, routines, types, databases and all other ownable object catalogs.
  def guard_no_object_ownership(connection)
    guard!(connection.select_value(<<~SQL) == 0, "runtime role or read group owns objects")
      SELECT count(*) FROM pg_shdepend
      WHERE refclassid = 'pg_authid'::regclass AND deptype = 'o'
        AND refobjid IN (current_user::regrole, 'elevateo_app_read'::regrole)
    SQL
  end

  def guard_no_privileged_membership(connection)
    # AIDEV-NOTE: ADMIN can regrant a privileged role even when its current SET and USAGE paths are disabled.
    guard!(connection.select_value(<<~SQL) == 0, "runtime role can assume, inherit or administer privileged role")
      SELECT count(*) FROM pg_roles WHERE
        (rolname IN ('elevateo_owner', 'elevateo_migrator') OR rolsuper OR rolcreatedb
          OR rolcreaterole OR rolreplication OR rolbypassrls)
        AND (pg_has_role(current_user, oid, 'SET') OR pg_has_role(current_user, oid, 'USAGE')
          OR pg_has_role(current_user, oid, 'MEMBER WITH ADMIN OPTION'))
    SQL
  end

  def guard_authority(connection, mode)
    guard!(%w[baseline repair].include?(mode), "unknown expectation mode")
    identity = connection.select_one("SELECT session_user, current_user")
    guard!(identity.values == %w[elevateo_api elevateo_api], "real API login/current role required")
    flags = connection.select_one(<<~SQL)
      SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname = current_user
    SQL
    guard!(flags.values == [false] * 5, "restricted API flags required")
    guard_no_privileged_membership(connection)
    guard_no_object_ownership(connection)
    edges = connection.select_rows(<<~SQL)
      SELECT grantor::regrole::text, admin_option, inherit_option, set_option
      FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole AND member = 'elevateo_api'::regrole
    SQL
    expected = mode == "baseline" ? ["supabase_admin", false, true, true] : ["elevateo_owner", false, true, false]
    guard!(edges == [expected], "unexpected API membership profile")
    guard!(connection.select_value("SELECT pg_has_role(current_user, 'elevateo_app_read', 'SET')") == (mode == "baseline"),
           "unexpected effective read-role SET authority")
    guard!(connection.select_value("SELECT oid::integer FROM pg_roles WHERE rolname = 'supabase_admin'") == 10,
           "bootstrap identity differs")
    guard!(connection.select_value(<<~SQL) == 4, "all four business tables must FORCE RLS")
      SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname IN
        ('organizations', 'organization_memberships', 'mailboxes', 'mailbox_memberships')
        AND c.relrowsecurity AND c.relforcerowsecurity
    SQL
    { identity: identity, membership: expected }
  end
end
