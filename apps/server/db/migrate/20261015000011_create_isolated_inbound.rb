# frozen_string_literal: true

class CreateIsolatedInbound < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      CREATE TABLE app.inbound_fake_accounts (
        organization_id uuid NOT NULL,
        mailbox_id uuid NOT NULL,
        provider_account_id text NOT NULL CHECK (provider_account_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
        PRIMARY KEY (organization_id, mailbox_id, provider_account_id),
        FOREIGN KEY (organization_id, mailbox_id) REFERENCES app.mailboxes(organization_id,id) ON DELETE CASCADE
      );
      CREATE TABLE app.inbound_receipts (
        organization_id uuid NOT NULL,
        mailbox_id uuid NOT NULL,
        provider text NOT NULL CHECK (provider = 'fake'),
        provider_account_id text NOT NULL CHECK (length(provider_account_id) BETWEEN 1 AND 128),
        provider_event_id text NOT NULL CHECK (length(provider_event_id) BETWEEN 1 AND 128),
        content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
        attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
        thread_id uuid NOT NULL,
        message_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY (organization_id, mailbox_id, provider, provider_account_id, provider_event_id),
        FOREIGN KEY (organization_id, mailbox_id, provider_account_id)
          REFERENCES app.inbound_fake_accounts(organization_id,mailbox_id,provider_account_id) ON DELETE RESTRICT,
        FOREIGN KEY (organization_id, mailbox_id, thread_id) REFERENCES app.threads(organization_id,mailbox_id,id)
          DEFERRABLE INITIALLY DEFERRED,
        FOREIGN KEY (organization_id, mailbox_id, thread_id, message_id)
          REFERENCES app.messages(organization_id,mailbox_id,thread_id,id) DEFERRABLE INITIALLY DEFERRED
      );
      ALTER TABLE app.inbound_fake_accounts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE app.inbound_fake_accounts FORCE ROW LEVEL SECURITY;
      ALTER TABLE app.inbound_receipts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE app.inbound_receipts FORCE ROW LEVEL SECURITY;
      REVOKE ALL ON app.inbound_fake_accounts, app.inbound_receipts
        FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
      CREATE POLICY inbound_account_owner ON app.inbound_fake_accounts FOR ALL TO elevateo_owner
        USING (organization_id = app.context_uuid('app.org_id'))
        WITH CHECK (organization_id = app.context_uuid('app.org_id'));
      CREATE POLICY inbound_owner ON app.inbound_receipts FOR ALL TO elevateo_owner
        USING (organization_id = app.context_uuid('app.org_id'))
        WITH CHECK (organization_id = app.context_uuid('app.org_id'));
    SQL
    execute <<~SQL
      -- AIDEV-NOTE: A unique receipt and its visible message commit together; conflict waits for the winner's commit.
      CREATE FUNCTION app.ingest_fake_mail(p_session_digest text,p_actor uuid,p_org uuid,p_mailbox uuid,
        p_account text,p_event text,p_digest text,
        p_sender jsonb,p_recipients jsonb,p_subject text,p_body text,p_attachments jsonb)
      RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE receipt app.inbound_receipts%ROWTYPE;
      DECLARE proof jsonb;
      DECLARE new_thread uuid := gen_random_uuid();
      DECLARE new_message uuid := gen_random_uuid();
      DECLARE inserted boolean := false;
      BEGIN
        proof := app_auth.assert_protected_write(p_session_digest,p_actor);
        IF proof->>'status' <> 'ok' THEN
          RAISE EXCEPTION 'inbound authorization expired' USING ERRCODE = '42501';
        END IF;
        IF p_mailbox IS NULL OR p_org IS DISTINCT FROM (proof->>'organization_id')::uuid OR
           p_actor IS DISTINCT FROM (proof->>'user_id')::uuid OR
           NOT EXISTS (SELECT 1 FROM app.mailboxes b WHERE b.organization_id = p_org AND b.id = p_mailbox) OR
           NOT EXISTS (SELECT 1 FROM app.inbound_fake_accounts a WHERE a.organization_id = p_org
             AND a.mailbox_id = p_mailbox AND a.provider_account_id = p_account) OR
           p_account IS NULL OR p_account !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' OR
           p_event IS NULL OR p_event !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' OR
           p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' OR
           p_sender IS NULL OR p_recipients IS NULL OR
           NOT app.thread_address_valid(p_sender) OR NOT app.thread_recipients_valid(p_recipients) OR
           p_subject IS NULL OR char_length(p_subject) > 255 OR
           p_body IS NULL OR octet_length(p_body) > 262144 OR
           CASE WHEN jsonb_typeof(p_attachments) = 'array' THEN
             jsonb_array_length(p_attachments) > 12 OR EXISTS (
               SELECT 1 FROM jsonb_array_elements(p_attachments) AS a(item)
               WHERE jsonb_typeof(a.item) <> 'object' OR
                 NOT (a.item ?& ARRAY['filename','content_type','size','sha256']) OR
                 a.item - ARRAY['filename','content_type','size','sha256'] <> '{}'::jsonb OR
                 jsonb_typeof(a.item->'filename') <> 'string' OR
                 char_length(a.item->>'filename') NOT BETWEEN 1 AND 120 OR
                 position('/' in a.item->>'filename') > 0 OR
                 position(chr(92) in a.item->>'filename') > 0 OR
                 (a.item->>'filename') ~ '[[:cntrl:]]' OR
                 jsonb_typeof(a.item->'content_type') <> 'string' OR
                 a.item->>'content_type' NOT IN ('text/plain','application/octet-stream') OR
                 jsonb_typeof(a.item->'size') <> 'number' OR
                 CASE WHEN (a.item->>'size') ~ '^[0-9]{1,6}$'
                   THEN (a.item->>'size')::integer > 262144 ELSE TRUE END OR
                 jsonb_typeof(a.item->'sha256') <> 'string' OR
                 (a.item->>'sha256') !~ '^[0-9a-f]{64}$')
           ELSE TRUE END THEN
          RAISE EXCEPTION 'invalid inbound input' USING ERRCODE = '22023';
        END IF;
        INSERT INTO app.inbound_receipts(organization_id,mailbox_id,provider,provider_account_id,
          provider_event_id,content_sha256,attachments,thread_id,message_id)
        VALUES (p_org,p_mailbox,'fake',p_account,p_event,p_digest,p_attachments,new_thread,new_message)
        ON CONFLICT DO NOTHING RETURNING * INTO receipt;
        inserted := FOUND;
        proof := app_auth.assert_protected_write(p_session_digest,p_actor);
        IF proof->>'status' <> 'ok' THEN
          RAISE EXCEPTION 'inbound authorization expired' USING ERRCODE = '42501';
        END IF;
        IF NOT inserted THEN
          SELECT * INTO receipt FROM app.inbound_receipts
           WHERE organization_id=p_org AND mailbox_id=p_mailbox AND provider='fake'
             AND provider_account_id=p_account AND provider_event_id=p_event;
          IF NOT FOUND OR receipt.content_sha256 <> p_digest THEN
            RAISE EXCEPTION 'inbound replay mismatch' USING ERRCODE = '23514';
          END IF;
        ELSE
          INSERT INTO app.threads(id,organization_id,mailbox_id,subject)
            VALUES(new_thread,p_org,p_mailbox,p_subject);
          INSERT INTO app.messages(id,organization_id,mailbox_id,thread_id,sender,recipients,sent_at,body_text,
            attachment_count) VALUES(new_message,p_org,p_mailbox,new_thread,p_sender,p_recipients,
            clock_timestamp(),p_body,jsonb_array_length(p_attachments));
        END IF;
        RETURN jsonb_build_object('result',CASE WHEN inserted THEN 'created' ELSE 'duplicate' END,
          'thread_id',receipt.thread_id,'message_id',receipt.message_id);
      END $$;
      REVOKE ALL ON FUNCTION app.ingest_fake_mail(text,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text,text,jsonb)
        FROM PUBLIC, elevateo_app_read, elevateo_worker;
      GRANT EXECUTE ON FUNCTION app.ingest_fake_mail(text,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text,text,jsonb)
        TO elevateo_api;
    SQL
  end

  def down
    execute "DROP FUNCTION app.ingest_fake_mail(text,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text,text,jsonb)"
    execute "DROP TABLE app.inbound_receipts"
    execute "DROP TABLE app.inbound_fake_accounts"
  end
end
