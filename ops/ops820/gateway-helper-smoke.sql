-- AIDEV-NOTE: effective grants, not only ACL text, define the gateway's callable surface.
DO $$
DECLARE helper oid; candidate record;
BEGIN
  helper := to_regprocedure('app_attachment_gateway.private_binding(text,uuid,uuid,uuid,bigint,uuid,text,uuid,uuid,uuid,uuid,uuid)');
  IF helper IS NULL OR to_regnamespace('app_attachment_gateway') IS NULL THEN
    RAISE EXCEPTION 'gateway private helper missing';
  END IF;
  IF NOT has_schema_privilege('elevateo_attachment_gateway','app_attachment_gateway','USAGE') OR
    has_schema_privilege('elevateo_attachment_gateway','app_attachment_gateway','CREATE') OR
    EXISTS (SELECT 1 FROM pg_namespace n
      WHERE (n.nspname IN ('app','auth','storage') OR left(n.nspname,4)='app_')
        AND n.nspname<>'app_attachment_gateway'
        AND has_schema_privilege('elevateo_attachment_gateway',n.oid,'USAGE,CREATE')) OR
    NOT has_function_privilege('elevateo_attachment_gateway',helper,'EXECUTE') OR
    has_function_privilege('elevateo_attachment_gateway',helper,'EXECUTE WITH GRANT OPTION') OR
    NOT has_function_privilege('elevateo_owner',
      'app_auth.authorize_session(text,uuid,uuid,uuid,bigint)','EXECUTE')
  THEN RAISE EXCEPTION 'gateway private helper boundary failed'; END IF;
  SELECT p.oid,p.proowner,p.prosecdef,p.proconfig INTO candidate FROM pg_proc p WHERE p.oid=helper;
  IF candidate.proowner <> 'elevateo_owner'::regrole OR NOT candidate.prosecdef OR
    NOT coalesce('search_path=pg_catalog'=ANY(candidate.proconfig),false) THEN
    RAISE EXCEPTION 'gateway helper owner or search path drift';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p
    WHERE p.pronamespace='app_attachment_gateway'::regnamespace AND p.oid<>helper) OR
    EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL
      aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE n.nspname='app_attachment_gateway' AND a.grantee=0
        AND a.privilege_type IN ('USAGE','CREATE')) OR
    EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL
      aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=helper AND a.grantee=0 AND a.privilege_type='EXECUTE') OR
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE (n.nspname IN ('app','auth','storage') OR left(n.nspname,4)='app_') AND p.oid<>helper
        AND a.grantee='elevateo_attachment_gateway'::regrole AND a.privilege_type='EXECUTE') OR
    has_function_privilege('elevateo_api',helper,'EXECUTE') OR
    has_function_privilege('elevateo_worker',helper,'EXECUTE')
  THEN RAISE EXCEPTION 'gateway helper effective grant drift'; END IF;
END $$;
