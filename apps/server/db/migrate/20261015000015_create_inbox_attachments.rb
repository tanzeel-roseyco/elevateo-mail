# frozen_string_literal: true

class CreateInboxAttachments < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      CREATE TABLE app.inbox_attachments (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        mailbox_id uuid NOT NULL,
        thread_id uuid NOT NULL,
        message_id uuid NOT NULL,
        storage_key text UNIQUE CHECK (storage_key IS NULL OR storage_key ~ '^quarantine/([0-9a-f-]{36}/[0-9a-f-]{36}|imap/[0-9a-f-]{36}/[0-9]+/[0-9]+/[0-9]+)$'),
        filename text NOT NULL CHECK (octet_length(filename) BETWEEN 1 AND 255),
        content_type text NOT NULL CHECK (content_type IN ('application/pdf','image/png','image/jpeg','text/plain','application/octet-stream')),
        byte_size integer NOT NULL CHECK (byte_size BETWEEN 0 AND 10485760),
        sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
        scan_status text NOT NULL DEFAULT 'pending_scan' CHECK (scan_status IN ('pending_scan','clean','malware','scan_failed','rejected')),
        scan_attempt integer NOT NULL DEFAULT 0 CHECK (scan_attempt BETWEEN 0 AND 3),
        scan_token uuid,
        scan_started_at timestamptz,
        scan_next_at timestamptz,
        rejection_reason text CHECK (rejection_reason IN ('oversize','unsupported_type','invalid_name','invalid_signature')),
        source_account_id uuid,
        source_uidvalidity bigint,
        source_uid bigint,
        source_ordinal integer,
        CHECK ((scan_status='rejected' AND storage_key IS NULL AND sha256 IS NULL AND byte_size=0 AND rejection_reason IS NOT NULL) OR
          (scan_status<>'rejected' AND storage_key IS NOT NULL AND sha256 IS NOT NULL AND byte_size>0 AND rejection_reason IS NULL
            AND content_type<>'application/octet-stream')),
        CHECK ((source_account_id IS NULL AND source_uidvalidity IS NULL AND source_uid IS NULL AND source_ordinal IS NULL) OR
          (source_account_id IS NOT NULL AND source_uidvalidity IS NOT NULL AND source_uidvalidity>0 AND
            source_uid IS NOT NULL AND source_uid>0 AND source_ordinal IS NOT NULL AND source_ordinal BETWEEN 0 AND 999)),
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (organization_id, mailbox_id, thread_id, message_id)
          REFERENCES app.messages(organization_id, mailbox_id, thread_id, id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX inbox_attachments_source_once ON app.inbox_attachments
        (source_account_id,source_uidvalidity,source_uid,source_ordinal) WHERE source_account_id IS NOT NULL;
      CREATE INDEX inbox_attachments_message_idx ON app.inbox_attachments
        (organization_id, mailbox_id, thread_id, message_id);
      ALTER TABLE app.inbox_attachments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE app.inbox_attachments FORCE ROW LEVEL SECURITY;
      REVOKE ALL ON app.inbox_attachments FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
      CREATE POLICY inbox_attachment_read ON app.inbox_attachments FOR SELECT TO elevateo_app_read
        USING (organization_id = app.context_uuid('app.org_id') AND EXISTS (
          SELECT 1 FROM app.messages m WHERE m.organization_id = inbox_attachments.organization_id
            AND m.mailbox_id = inbox_attachments.mailbox_id AND m.thread_id = inbox_attachments.thread_id
            AND m.id = inbox_attachments.message_id));
      -- AIDEV-NOTE: FORCE RLS also applies to definer owner; only its narrow bind/scan routines write.
      CREATE POLICY inbox_attachment_owner_read ON app.inbox_attachments FOR SELECT TO elevateo_owner
        USING (true);
      CREATE POLICY inbox_attachment_owner_insert ON app.inbox_attachments FOR INSERT TO elevateo_owner
        WITH CHECK (scan_status IN ('pending_scan','rejected'));
      CREATE POLICY inbox_attachment_owner_scan ON app.inbox_attachments FOR UPDATE TO elevateo_owner
        USING (scan_status IN ('pending_scan','scan_failed'))
        WITH CHECK (scan_status IN ('pending_scan','clean','malware','scan_failed'));
      -- AIDEV-NOTE: API cannot INSERT directly; the definer checks current compose rights and fixed pending state.
      REVOKE ALL ON app.inbox_attachments FROM elevateo_app_read, elevateo_api;
      GRANT SELECT (id, organization_id, mailbox_id, thread_id, message_id, filename,
        content_type, byte_size, scan_status, rejection_reason) ON app.inbox_attachments TO elevateo_app_read;
      CREATE FUNCTION app.stage_inbox_attachment(p_id uuid, p_org uuid, p_box uuid, p_thread uuid,
        p_message uuid, p_key text, p_filename text, p_type text, p_bytes integer, p_sha text) RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
      BEGIN
        IF p_key IS DISTINCT FROM ('quarantine/' || p_org::text || '/' || p_id::text) OR
          p_type='application/octet-stream' OR p_org IS DISTINCT FROM app.context_uuid('app.org_id') OR
          NOT app.draft_scope(p_box, NULL) OR
          NOT EXISTS (SELECT 1 FROM app.messages m WHERE m.organization_id = p_org
            AND m.mailbox_id = p_box AND m.thread_id = p_thread AND m.id = p_message) THEN
          RAISE EXCEPTION 'attachment not available' USING ERRCODE = '42501';
        END IF;
        INSERT INTO app.inbox_attachments(id,organization_id,mailbox_id,thread_id,message_id,
          storage_key,filename,content_type,byte_size,sha256,scan_status)
        VALUES (p_id,p_org,p_box,p_thread,p_message,p_key,p_filename,p_type,p_bytes,p_sha,'pending_scan');
      END
      $$;
      REVOKE ALL ON FUNCTION app.stage_inbox_attachment(uuid,uuid,uuid,uuid,uuid,text,text,text,integer,text)
        FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
      GRANT EXECUTE ON FUNCTION app.stage_inbox_attachment(uuid,uuid,uuid,uuid,uuid,text,text,text,integer,text)
        TO elevateo_api;
      -- AIDEV-NOTE: Corin's definer ingest calls this before cursor advance; worker has no direct EXECUTE grant.
      CREATE FUNCTION app.bind_imported_inbox_attachment(p_id uuid, p_org uuid, p_box uuid, p_thread uuid,
        p_message uuid, p_account uuid, p_epoch bigint, p_uid bigint, p_ordinal integer,
        p_key text, p_filename text, p_type text, p_bytes integer, p_sha text, p_reason text)
        RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
      DECLARE existing app.inbox_attachments%ROWTYPE;
      BEGIN
        IF session_user <> 'elevateo_worker' OR p_account IS NULL OR p_epoch<=0 OR p_uid<=0 OR
          p_ordinal NOT BETWEEN 0 AND 999 THEN
          RAISE EXCEPTION 'attachment import unavailable' USING ERRCODE='42501';
        END IF;
        IF p_reason IS NULL AND (p_key IS DISTINCT FROM
          ('quarantine/imap/' || p_account::text || '/' || p_epoch::text || '/' || p_uid::text || '/' || p_ordinal::text)
          OR p_bytes NOT BETWEEN 1 AND 262144 OR p_sha IS NULL OR p_type='application/octet-stream') THEN
          RAISE EXCEPTION 'invalid staged attachment' USING ERRCODE='22023';
        END IF;
        IF p_reason IS NOT NULL AND (p_key IS NOT NULL OR p_sha IS NOT NULL OR p_bytes<>0) THEN
          RAISE EXCEPTION 'invalid rejected attachment' USING ERRCODE='22023';
        END IF;
        INSERT INTO app.inbox_attachments(id,organization_id,mailbox_id,thread_id,message_id,storage_key,
          filename,content_type,byte_size,sha256,scan_status,rejection_reason,source_account_id,
          source_uidvalidity,source_uid,source_ordinal)
        VALUES (p_id,p_org,p_box,p_thread,p_message,p_key,p_filename,p_type,p_bytes,p_sha,
          CASE WHEN p_reason IS NULL THEN 'pending_scan' ELSE 'rejected' END,p_reason,
          p_account,p_epoch,p_uid,p_ordinal)
        ON CONFLICT (source_account_id,source_uidvalidity,source_uid,source_ordinal)
          WHERE source_account_id IS NOT NULL DO NOTHING;
        IF FOUND THEN RETURN p_id; END IF;
        -- AIDEV-NOTE: Immutable binding lookup needs SELECT, not UPDATE RLS, after a terminal scan verdict.
        SELECT * INTO existing FROM app.inbox_attachments a WHERE a.source_account_id=p_account
          AND a.source_uidvalidity=p_epoch AND a.source_uid=p_uid AND a.source_ordinal=p_ordinal;
        IF NOT FOUND OR existing.organization_id IS DISTINCT FROM p_org OR existing.mailbox_id IS DISTINCT FROM p_box OR
          existing.thread_id IS DISTINCT FROM p_thread OR existing.message_id IS DISTINCT FROM p_message OR
          existing.storage_key IS DISTINCT FROM p_key OR existing.sha256 IS DISTINCT FROM p_sha OR
          existing.filename IS DISTINCT FROM p_filename OR existing.content_type IS DISTINCT FROM p_type OR
          existing.byte_size IS DISTINCT FROM p_bytes OR existing.rejection_reason IS DISTINCT FROM p_reason THEN
          RAISE EXCEPTION 'attachment import conflict' USING ERRCODE='23505';
        END IF;
        RETURN existing.id;
      END
      $$;
      REVOKE ALL ON FUNCTION app.bind_imported_inbox_attachment(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,
        integer,text,text,text,integer,text,text) FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
      -- AIDEV-NOTE: Claim token and attempt fence late clean results; failures remain held with bounded retry.
      CREATE FUNCTION app.due_inbox_attachment_scans(p_limit integer) RETURNS TABLE(id uuid)
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
      BEGIN
        IF session_user <> 'elevateo_worker' OR p_limit NOT BETWEEN 1 AND 25 THEN
          RAISE EXCEPTION 'scan unavailable' USING ERRCODE='42501';
        END IF;
        RETURN QUERY SELECT a.id FROM app.inbox_attachments a
        WHERE a.scan_status IN ('pending_scan','scan_failed') AND a.scan_attempt<3
          AND (a.scan_next_at IS NULL OR a.scan_next_at<=now())
          AND (a.scan_token IS NULL OR a.scan_started_at<now()-interval '2 minutes')
        ORDER BY a.created_at,a.id LIMIT p_limit;
      END
      $$;
      CREATE FUNCTION app.claim_inbox_attachment_scan(p_id uuid, p_token uuid)
        RETURNS TABLE(storage_key text, byte_size integer, sha256 text, scan_attempt integer)
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
      BEGIN
        IF session_user <> 'elevateo_worker' OR p_token IS NULL THEN
          RAISE EXCEPTION 'scan unavailable' USING ERRCODE='42501';
        END IF;
        RETURN QUERY UPDATE app.inbox_attachments a SET scan_status='pending_scan',
          scan_attempt=a.scan_attempt+1, scan_token=p_token, scan_started_at=now(), scan_next_at=NULL
        WHERE a.id=p_id AND a.scan_status IN ('pending_scan','scan_failed') AND a.scan_attempt<3
          AND (a.scan_next_at IS NULL OR a.scan_next_at<=now())
          AND (a.scan_token IS NULL OR a.scan_started_at<now()-interval '2 minutes')
        RETURNING a.storage_key,a.byte_size,a.sha256,a.scan_attempt;
      END
      $$;
      CREATE FUNCTION app.record_inbox_attachment_scan(p_id uuid, p_sha text, p_token uuid,
        p_attempt integer, p_verdict text) RETURNS boolean
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
      BEGIN
        IF session_user <> 'elevateo_worker' OR p_verdict NOT IN ('clean','malware','scan_failed') THEN
          RAISE EXCEPTION 'scan unavailable' USING ERRCODE='42501';
        END IF;
        UPDATE app.inbox_attachments a SET scan_status=p_verdict,scan_token=NULL,
          scan_started_at=NULL,scan_next_at=CASE WHEN p_verdict='scan_failed' AND p_attempt<3
            THEN now()+make_interval(secs => 30 * (1 << p_attempt)) ELSE NULL END
        WHERE a.id=p_id AND a.sha256=p_sha AND a.scan_status='pending_scan'
          AND a.scan_token=p_token AND a.scan_attempt=p_attempt;
        RETURN FOUND;
      END
      $$;
      REVOKE ALL ON FUNCTION app.due_inbox_attachment_scans(integer),
        app.claim_inbox_attachment_scan(uuid,uuid),
        app.record_inbox_attachment_scan(uuid,text,uuid,integer,text)
        FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
      GRANT EXECUTE ON FUNCTION app.due_inbox_attachment_scans(integer),
        app.claim_inbox_attachment_scan(uuid,uuid),
        app.record_inbox_attachment_scan(uuid,text,uuid,integer,text) TO elevateo_worker;
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "preserve attachment metadata and quarantine objects"
  end
end
