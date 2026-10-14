-- AIDEV-NOTE: Both migration directions validate bootstrap ownership without changing schema or unrelated objects.
DO $$ BEGIN
  IF current_user <> 'elevateo_owner'
  THEN RAISE EXCEPTION 'draft private schema bootstrap prerequisite failed: migration requires owner'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_drafts_private')
  THEN RAISE EXCEPTION 'draft private schema bootstrap prerequisite failed: missing schema'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_drafts_private'
      AND nspowner = 'elevateo_owner'::regrole)
  THEN RAISE EXCEPTION 'draft private schema bootstrap prerequisite failed: wrong owner'; END IF;
  IF NOT (has_schema_privilege('elevateo_owner', 'app_drafts_private', 'CREATE')
      AND has_schema_privilege('elevateo_owner', 'app_drafts_private', 'USAGE'))
  THEN RAISE EXCEPTION 'draft private schema bootstrap prerequisite failed: owner privilege loss'; END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
      WHERE n.nspname = 'app_drafts_private'
        AND (a.grantee <> n.nspowner OR a.grantor <> n.nspowner))
  THEN RAISE EXCEPTION 'draft private schema bootstrap prerequisite failed: foreign ACL'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['elevateo_api', 'elevateo_worker', 'elevateo_app_read']) role_name
      WHERE has_schema_privilege(role_name, 'app_drafts_private', 'CREATE')
        OR has_schema_privilege(role_name, 'app_drafts_private', 'USAGE'))
  THEN RAISE EXCEPTION 'draft private schema bootstrap prerequisite failed: runtime access'; END IF;
END $$;
