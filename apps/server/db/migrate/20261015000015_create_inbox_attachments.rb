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
        storage_key text NOT NULL UNIQUE CHECK (storage_key ~ '^quarantine/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
        filename text NOT NULL CHECK (octet_length(filename) BETWEEN 1 AND 255),
        content_type text NOT NULL CHECK (content_type IN ('application/pdf','image/png','image/jpeg','text/plain')),
        byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
        scan_status text NOT NULL DEFAULT 'pending_scan' CHECK (scan_status IN ('pending_scan','clean','malware','scan_failed')),
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (organization_id, mailbox_id, thread_id, message_id)
          REFERENCES app.messages(organization_id, mailbox_id, thread_id, id) ON DELETE CASCADE
      );
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
      -- AIDEV-NOTE: API cannot INSERT directly; the definer checks current compose rights and fixed pending state.
      REVOKE ALL ON app.inbox_attachments FROM elevateo_app_read, elevateo_api;
      GRANT SELECT (id, organization_id, mailbox_id, thread_id, message_id, storage_key, filename,
        content_type, byte_size, scan_status) ON app.inbox_attachments TO elevateo_app_read;
      CREATE FUNCTION app.stage_inbox_attachment(p_id uuid, p_org uuid, p_box uuid, p_thread uuid,
        p_message uuid, p_key text, p_filename text, p_type text, p_bytes integer) RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
      BEGIN
        IF p_org IS DISTINCT FROM app.context_uuid('app.org_id') OR
          NOT app.draft_scope(p_box, NULL) OR
          NOT EXISTS (SELECT 1 FROM app.messages m WHERE m.organization_id = p_org
            AND m.mailbox_id = p_box AND m.thread_id = p_thread AND m.id = p_message) THEN
          RAISE EXCEPTION 'attachment not available' USING ERRCODE = '42501';
        END IF;
        INSERT INTO app.inbox_attachments(id,organization_id,mailbox_id,thread_id,message_id,
          storage_key,filename,content_type,byte_size,scan_status)
        VALUES (p_id,p_org,p_box,p_thread,p_message,p_key,p_filename,p_type,p_bytes,'pending_scan');
      END
      $$;
      REVOKE ALL ON FUNCTION app.stage_inbox_attachment(uuid,uuid,uuid,uuid,uuid,text,text,text,integer)
        FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
      GRANT EXECUTE ON FUNCTION app.stage_inbox_attachment(uuid,uuid,uuid,uuid,uuid,text,text,text,integer)
        TO elevateo_api;
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "preserve attachment metadata and quarantine objects"
  end
end
