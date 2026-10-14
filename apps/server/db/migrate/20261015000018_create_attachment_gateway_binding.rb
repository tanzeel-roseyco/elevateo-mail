# frozen_string_literal: true

# AIDEV-NOTE: One dedicated login executes one complete session/read/clean-binding helper; bootstrap owns the login.
class CreateAttachmentGatewayBinding < ActiveRecord::Migration[8.1]
  SIGNATURE = "text,uuid,uuid,uuid,bigint,uuid,text,uuid,uuid,uuid,uuid,uuid"

  def up
    execute "SET LOCAL ROLE elevateo_session_owner"
    execute "GRANT EXECUTE ON FUNCTION app_auth.authorize_session(text,uuid,uuid,uuid,bigint) TO elevateo_owner"
    execute "SET LOCAL ROLE elevateo_owner"
    execute <<~SQL
      DO $$ BEGIN
        IF session_user <> 'elevateo_migrator' OR current_user <> 'elevateo_owner' OR
          NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='elevateo_attachment_gateway' AND rolcanlogin
            AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) OR
          to_regclass('app.inbox_attachments') IS NULL OR
          (SELECT pg_get_userbyid(proowner) FROM pg_proc
            WHERE oid='app_auth.authorize_session(text,uuid,uuid,uuid,bigint)'::regprocedure)
              <> 'elevateo_session_owner' OR
          NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='app_attachment_gateway'
            AND nspowner='elevateo_owner'::regrole) OR
          EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL
            aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) acl
            WHERE n.nspname='app_attachment_gateway' AND NOT (
              acl.grantee=n.nspowner OR
              (acl.grantee='elevateo_attachment_gateway'::regrole AND
                acl.grantor='elevateo_owner'::regrole AND acl.privilege_type='USAGE' AND NOT acl.is_grantable))) OR
          EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='app_attachment_gateway') OR
          has_schema_privilege('elevateo_attachment_gateway','app_attachment_gateway','CREATE') OR
          has_schema_privilege('elevateo_attachment_gateway','app','USAGE') OR
          has_schema_privilege('elevateo_attachment_gateway','app_auth','USAGE') OR
          has_table_privilege('elevateo_attachment_gateway','app.inbox_attachments','SELECT') OR
          has_function_privilege('elevateo_attachment_gateway',
            'app_auth.authorize_session(text,uuid,uuid,uuid,bigint)','EXECUTE') THEN
          RAISE EXCEPTION 'attachment gateway prerequisites not met';
        END IF;
      END $$;

      -- AIDEV-NOTE: Bootstrap owns the precreated private schema; migration owns only this function and grant.
      CREATE FUNCTION app_attachment_gateway.private_binding(p_digest text,p_user uuid,p_auth uuid,
        p_context uuid,p_generation bigint,p_context_id uuid,p_version text,p_attachment uuid,
        p_org uuid,p_box uuid,p_thread uuid,p_message uuid) RETURNS TABLE (
          storage_key text,byte_size integer,sha256 text,content_type text,filename text)
      LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE proof jsonb;
      BEGIN
        IF session_user <> 'elevateo_attachment_gateway' OR current_user <> 'elevateo_owner' OR
          p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' OR p_user IS NULL OR p_auth IS NULL OR
          p_context IS NULL OR p_context_id IS DISTINCT FROM p_context OR p_generation IS NULL OR
          p_generation < 0 OR p_version IS NULL OR p_version !~ '^[A-Za-z0-9_-]{43}$' OR
          p_attachment IS NULL OR p_org IS NULL OR p_box IS NULL OR p_thread IS NULL OR p_message IS NULL THEN
          RETURN;
        END IF;
        proof := app_auth.authorize_session(p_digest,p_user,p_auth,p_context,p_generation);
        IF proof->>'status' IS DISTINCT FROM 'ok' OR
          (proof->>'user_id')::uuid IS DISTINCT FROM p_user OR
          (proof->>'auth_session_id')::uuid IS DISTINCT FROM p_auth OR
          (proof->>'organization_id')::uuid IS DISTINCT FROM p_org OR
          (proof->>'context_id')::uuid IS DISTINCT FROM p_context OR
          (proof->>'authorization_generation')::bigint IS DISTINCT FROM p_generation THEN
          RETURN;
        END IF;
        -- AIDEV-NOTE: The definer sees owner RLS rows, so repeat the frozen current READ predicate explicitly.
        IF NOT EXISTS (SELECT 1 FROM app.organization_memberships m
          WHERE m.organization_id=p_org AND m.user_id=p_user) OR
          NOT EXISTS (SELECT 1 FROM app.mailboxes b WHERE b.organization_id=p_org AND b.id=p_box
            AND (b.visibility='shared' OR EXISTS (SELECT 1 FROM app.mailbox_memberships mm
              WHERE mm.organization_id=p_org AND mm.mailbox_id=p_box AND mm.user_id=p_user))) THEN
          RETURN;
        END IF;
        -- Attachment's composite FK proves the exact message exists in this mailbox and thread.
        RETURN QUERY SELECT a.storage_key,a.byte_size,a.sha256,a.content_type,a.filename
          FROM app.inbox_attachments a WHERE a.id=p_attachment AND a.organization_id=p_org
            AND a.mailbox_id=p_box AND a.thread_id=p_thread AND a.message_id=p_message
            AND a.scan_status='clean' AND a.storage_key IS NOT NULL AND a.sha256 IS NOT NULL
            AND a.byte_size BETWEEN 1 AND 10485760 LIMIT 1;
      END $$;
      REVOKE ALL ON FUNCTION app_attachment_gateway.private_binding(#{SIGNATURE})
        FROM PUBLIC,elevateo_api,elevateo_app_read,elevateo_worker,elevateo_attachment_gateway;
      GRANT USAGE ON SCHEMA app_attachment_gateway TO elevateo_attachment_gateway;
      GRANT EXECUTE ON FUNCTION app_attachment_gateway.private_binding(#{SIGNATURE})
        TO elevateo_attachment_gateway;
    SQL
  end

  def down
    execute "SET LOCAL ROLE elevateo_owner"
    execute "DROP FUNCTION app_attachment_gateway.private_binding(#{SIGNATURE})"
    execute "SET LOCAL ROLE elevateo_session_owner"
    execute "REVOKE EXECUTE ON FUNCTION app_auth.authorize_session(text,uuid,uuid,uuid,bigint) FROM elevateo_owner"
  end
end
