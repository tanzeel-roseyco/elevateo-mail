-- AIDEV-NOTE: run as the restricted gateway LOGIN on a disposable source/restore DB.
DO $$
DECLARE result_count bigint;
BEGIN
  IF session_user <> 'elevateo_attachment_gateway' OR
    current_user <> 'elevateo_attachment_gateway' THEN
    RAISE EXCEPTION 'gateway runtime identity mismatch';
  END IF;
  -- All inputs pass helper validation, so this missing digest reaches nested session authorization.
  SELECT count(*) INTO result_count FROM app_attachment_gateway.private_binding(
    repeat('0',64),
    '82000000-0000-4000-8000-000000000021'::uuid,
    '82000000-0000-4000-8000-000000000022'::uuid,
    '82000000-0000-4000-8000-000000000023'::uuid,
    0,
    '82000000-0000-4000-8000-000000000023'::uuid,
    repeat('A',43),
    '82000000-0000-4000-8000-000000000024'::uuid,
    '82000000-0000-4000-8000-000000000025'::uuid,
    '82000000-0000-4000-8000-000000000026'::uuid,
    '82000000-0000-4000-8000-000000000027'::uuid,
    '82000000-0000-4000-8000-000000000028'::uuid);
  IF result_count <> 0 THEN RAISE EXCEPTION 'missing session returned gateway binding'; END IF;
  BEGIN
    EXECUTE 'SELECT storage_key FROM app.inbox_attachments LIMIT 1';
    RAISE EXCEPTION 'gateway direct attachment SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'SELECT cookie_digest FROM app_auth.sessions LIMIT 1';
    RAISE EXCEPTION 'gateway direct Auth SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'SELECT app_auth.authorize_session(NULL::text,NULL::uuid,NULL::uuid,NULL::uuid,NULL::bigint)';
    RAISE EXCEPTION 'gateway direct Auth function unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'SELECT 1 FROM app_drafts_private.operations LIMIT 1';
    RAISE EXCEPTION 'gateway direct draft private SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'SELECT app_send_private.utc_timestamp(now())';
    RAISE EXCEPTION 'gateway direct send private function unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'SELECT id FROM auth.users LIMIT 1';
    RAISE EXCEPTION 'gateway direct Supabase Auth SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'SELECT id FROM storage.objects LIMIT 1';
    RAISE EXCEPTION 'gateway direct Supabase Storage SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
