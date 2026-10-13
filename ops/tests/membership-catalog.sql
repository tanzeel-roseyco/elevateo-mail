-- AIDEV-NOTE: Separate administrator observations corroborate rows; restricted API tests never use this identity.
\set ON_ERROR_STOP on
SELECT set_config('r1.expected_membership', :'state', false);
DO $$
DECLARE expected text := current_setting('r1.expected_membership');
BEGIN
  IF session_user <> 'supabase_admin' OR current_user <> 'supabase_admin'
    OR 'supabase_admin'::regrole::oid <> 10 THEN RAISE EXCEPTION 'catalog tool requires measured admin'; END IF;
  IF expected NOT IN ('legacy', 'absent', 'repair') THEN RAISE EXCEPTION 'invalid catalog state'; END IF;
  -- AIDEV-NOTE: Parenthesize SQL CASE so PL/pgSQL does not treat its THEN as the IF expression terminator.
  IF (SELECT count(*) FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole
      AND member = 'elevateo_api'::regrole) <> (CASE WHEN expected = 'absent' THEN 0 ELSE 1 END)
    OR EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole
      AND member = 'elevateo_api'::regrole
      AND NOT (NOT admin_option AND inherit_option
        AND ((expected = 'legacy' AND grantor = 'supabase_admin'::regrole AND set_option)
          OR (expected = 'repair' AND grantor = 'elevateo_owner'::regrole AND NOT set_option))))
  THEN RAISE EXCEPTION 'catalog membership state differs'; END IF;
  -- AIDEV-NOTE: Match the restricted guard across every ownable catalog, including schemas and routines.
  IF EXISTS (SELECT 1 FROM pg_shdepend WHERE refclassid = 'pg_authid'::regclass AND deptype = 'o'
    AND refobjid = 'elevateo_app_read'::regrole)
  THEN RAISE EXCEPTION 'read role owns objects'; END IF;
END $$;
SELECT grantor::regrole::text, member::regrole::text, admin_option, inherit_option, set_option
  FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole ORDER BY member, grantor;
-- Compare these complete synthetic-row fingerprints across every bootstrap/up/down transition.
SELECT 'organizations' AS fixture, count(*) AS rows, md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '[]')) AS fingerprint FROM app.organizations t
UNION ALL SELECT 'organization_memberships', count(*), md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '[]')) FROM app.organization_memberships t
UNION ALL SELECT 'mailboxes', count(*), md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '[]')) FROM app.mailboxes t
UNION ALL SELECT 'mailbox_memberships', count(*), md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '[]')) FROM app.mailbox_memberships t;
