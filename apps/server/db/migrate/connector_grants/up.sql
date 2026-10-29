-- AIDEV-NOTE: Tokens are hashed; source sessions and membership are rechecked on every request, never cached.
-- AIDEV-NOTE: Bootstrap owns schema creation; migrators intentionally lack database CREATE.
SET LOCAL ROLE elevateo_owner;
CREATE TABLE app_connector_private.grants (
  id uuid PRIMARY KEY, token_digest text NOT NULL UNIQUE CHECK(token_digest ~ '^[0-9a-f]{64}$'),
  session_digest text NOT NULL CHECK(session_digest ~ '^[0-9a-f]{64}$'),
  organization_id uuid NOT NULL, user_id uuid NOT NULL, mailbox_id uuid NOT NULL,
  client text NOT NULL CHECK(client IN ('codex','claude')),
  scopes text[] NOT NULL CHECK(cardinality(scopes) BETWEEN 1 AND 3 AND scopes <@ ARRAY['search','read','draft']::text[]),
  expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)), revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(expires_at > created_at AND expires_at <= created_at + interval '1 day'),
  FOREIGN KEY(organization_id,mailbox_id) REFERENCES app.mailboxes(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX grants_actor ON app_connector_private.grants(organization_id,user_id,created_at DESC);
ALTER TABLE app_connector_private.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_connector_private.grants FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON app_connector_private.grants TO elevateo_owner USING(true) WITH CHECK(true);
REVOKE ALL ON SCHEMA app_connector_private FROM PUBLIC,elevateo_api,elevateo_worker;
REVOKE ALL ON ALL TABLES IN SCHEMA app_connector_private FROM PUBLIC,elevateo_api,elevateo_worker;

CREATE FUNCTION app_connector_private.visible_mailbox(p_mailbox uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app.mailbox_memberships m JOIN app.organization_memberships o
 ON o.organization_id=m.organization_id AND o.user_id=m.user_id
 WHERE m.organization_id=app.context_uuid('app.org_id') AND m.user_id=app.context_uuid('app.user_id')
 AND m.mailbox_id=p_mailbox)
$$;
CREATE FUNCTION app_connector_private.presentation(g app_connector_private.grants) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',g.id,'mailbox_id',g.mailbox_id,'client',g.client,'scopes',g.scopes,
 'expires_at',to_char(g.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'revoked',g.revoked)
$$;
CREATE FUNCTION app.connector_grant_issue(p_session text,p_id uuid,p_hash text,p_mailbox uuid,p_client text,p_scopes text[],p_seconds integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE proof jsonb; g app_connector_private.grants; n timestamptz := clock_timestamp();
BEGIN
 proof := app_auth.assert_protected_write(p_session,app.context_uuid('app.user_id'));
 IF (proof->>'status') IS DISTINCT FROM 'ok' THEN RETURN proof; END IF;
 IF p_seconds IS NULL OR p_seconds NOT BETWEEN 60 AND 86400 OR p_scopes IS NULL OR
   cardinality(p_scopes) NOT BETWEEN 1 AND 3 OR NOT p_scopes <@ ARRAY['search','read','draft']::text[] OR
   cardinality(p_scopes) <> (SELECT count(DISTINCT s) FROM unnest(p_scopes) s) OR
   NOT app_connector_private.visible_mailbox(p_mailbox) OR
   ('draft'=ANY(p_scopes) AND NOT app.draft_scope(p_mailbox,NULL)) THEN
   RETURN jsonb_build_object('status','not_found');
 END IF;
 -- AIDEV-NOTE: begin_protected_write holds the actor generation lock, serializing the active-grant cap.
 IF (SELECT count(*) FROM app_connector_private.grants WHERE organization_id=app.context_uuid('app.org_id')
   AND user_id=app.context_uuid('app.user_id') AND NOT revoked AND expires_at>n)>=100 THEN
   RETURN jsonb_build_object('status','not_found');
 END IF;
 INSERT INTO app_connector_private.grants(id,token_digest,session_digest,organization_id,user_id,mailbox_id,client,scopes,expires_at,created_at)
 VALUES(p_id,p_hash,p_session,app.context_uuid('app.org_id'),app.context_uuid('app.user_id'),p_mailbox,p_client,p_scopes,
 n+make_interval(secs=>p_seconds),n) RETURNING * INTO g;
 RETURN jsonb_build_object('status','ok','grant',app_connector_private.presentation(g));
END $$;
-- AIDEV-NOTE: Active grants sort first, so expired/revoked history cannot hide a credential needing revocation.
CREATE FUNCTION app.connector_grants() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('items',COALESCE(jsonb_agg(app_connector_private.presentation(g)),'[]'::jsonb))
 FROM (SELECT * FROM app_connector_private.grants WHERE organization_id=app.context_uuid('app.org_id')
 AND user_id=app.context_uuid('app.user_id') ORDER BY (NOT revoked AND expires_at>statement_timestamp()) DESC,created_at DESC,id LIMIT 100) g
$$;
CREATE FUNCTION app.connector_grant_revoke(p_session text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE proof jsonb;
BEGIN
 proof := app_auth.assert_protected_write(p_session,app.context_uuid('app.user_id'));
 IF (proof->>'status') IS DISTINCT FROM 'ok' THEN RETURN proof; END IF;
 UPDATE app_connector_private.grants SET revoked=true WHERE id=p_id
 AND organization_id=app.context_uuid('app.org_id') AND user_id=app.context_uuid('app.user_id');
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
 RETURN jsonb_build_object('status','ok','id',p_id,'revoked',true);
END $$;
-- AIDEV-NOTE: Resolution only locates a source session. It grants no read or mutation authority.
CREATE FUNCTION app.connector_grant_resolve(p_hash text) RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_digest FROM app_connector_private.grants WHERE token_digest=p_hash AND NOT revoked AND expires_at>clock_timestamp()
$$;
CREATE FUNCTION app.connector_grant_authorize(p_session text,p_hash text,p_mailbox uuid,p_scope text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE proof jsonb; g app_connector_private.grants;
BEGIN
 proof := app_auth.assert_protected_write(p_session,app.context_uuid('app.user_id'));
 IF (proof->>'status') IS DISTINCT FROM 'ok' THEN RETURN false; END IF;
 -- AIDEV-NOTE: Same actor generation lock precedes this row lock in issuance, use and revocation.
 SELECT * INTO g FROM app_connector_private.grants WHERE token_digest=p_hash FOR UPDATE;
 RETURN COALESCE(g.session_digest=p_session AND g.organization_id=app.context_uuid('app.org_id')
 AND g.user_id=app.context_uuid('app.user_id') AND g.mailbox_id=p_mailbox AND NOT g.revoked
 AND g.expires_at>clock_timestamp() AND p_scope=ANY(g.scopes) AND app_connector_private.visible_mailbox(p_mailbox)
 AND (p_scope<>'draft' OR app.draft_scope(p_mailbox,NULL)),false);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_connector_private FROM PUBLIC,elevateo_api,elevateo_worker;
REVOKE ALL ON FUNCTION app.connector_grant_issue(text,uuid,text,uuid,text,text[],integer),app.connector_grants(),
 app.connector_grant_revoke(text,uuid),app.connector_grant_resolve(text),app.connector_grant_authorize(text,text,uuid,text)
 FROM PUBLIC,elevateo_worker;
GRANT EXECUTE ON FUNCTION app.connector_grant_issue(text,uuid,text,uuid,text,text[],integer),app.connector_grants(),
 app.connector_grant_revoke(text,uuid),app.connector_grant_resolve(text),app.connector_grant_authorize(text,text,uuid,text)
 TO elevateo_api;
RESET ROLE;
