# frozen_string_literal: true

class CreateHeldImapIngress < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      -- AIDEV-NOTE: Provision mappings offline; the worker sees only named functions, never credential references or rows.
      CREATE TABLE app.inbound_imap_accounts (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, mailbox_id uuid NOT NULL,
        credential_ref text NOT NULL CHECK (credential_ref ~ '^test:[A-Za-z0-9_.:-]{1,120}$'),
        credential_version integer NOT NULL CHECK (credential_version > 0),
        active boolean NOT NULL DEFAULT false,
        uidvalidity bigint CHECK (uidvalidity > 0),
        last_uid bigint NOT NULL DEFAULT 0 CHECK (last_uid >= 0),
        FOREIGN KEY (organization_id,mailbox_id) REFERENCES app.mailboxes(organization_id,id) ON DELETE RESTRICT,
        CHECK (uidvalidity IS NOT NULL OR last_uid = 0)
      );
      CREATE TABLE app.inbound_imap_receipts (
        account_id uuid NOT NULL REFERENCES app.inbound_imap_accounts(id) ON DELETE RESTRICT,
        organization_id uuid NOT NULL, mailbox_id uuid NOT NULL,
        uidvalidity bigint NOT NULL CHECK (uidvalidity > 0), uid bigint NOT NULL CHECK (uid > 0),
        content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
        thread_id uuid NOT NULL, message_id uuid NOT NULL,
        PRIMARY KEY(account_id,uidvalidity,uid),
        FOREIGN KEY (organization_id,mailbox_id,thread_id) REFERENCES app.threads(organization_id,mailbox_id,id)
          DEFERRABLE INITIALLY DEFERRED,
        FOREIGN KEY (organization_id,mailbox_id,thread_id,message_id)
          REFERENCES app.messages(organization_id,mailbox_id,thread_id,id) DEFERRABLE INITIALLY DEFERRED
      );
      ALTER TABLE app.inbound_imap_accounts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE app.inbound_imap_accounts FORCE ROW LEVEL SECURITY;
      ALTER TABLE app.inbound_imap_receipts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE app.inbound_imap_receipts FORCE ROW LEVEL SECURITY;
      CREATE POLICY imap_account_owner ON app.inbound_imap_accounts TO elevateo_owner USING (true) WITH CHECK (true);
      CREATE POLICY imap_receipt_owner ON app.inbound_imap_receipts TO elevateo_owner USING (true) WITH CHECK (true);
      CREATE POLICY imap_owner_mailbox ON app.mailboxes FOR SELECT TO elevateo_owner
        USING (organization_id = app.context_uuid('app.org_id'));
      CREATE POLICY imap_owner_thread_insert ON app.threads FOR INSERT TO elevateo_owner
        WITH CHECK (organization_id = app.context_uuid('app.org_id'));
      CREATE POLICY imap_owner_message_insert ON app.messages FOR INSERT TO elevateo_owner
        WITH CHECK (organization_id = app.context_uuid('app.org_id'));
      REVOKE ALL ON app.inbound_imap_accounts,app.inbound_imap_receipts
        FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
    SQL
    execute <<~SQL
      -- AIDEV-NOTE: Account mapping, receipt, visible rows and cursor advance share one worker-only transaction.
      CREATE FUNCTION app.ingest_imap_mail(p_account uuid,p_version integer,p_validity bigint,p_uid bigint,
        p_digest text,p_sender jsonb,p_recipients jsonb,p_subject text,p_body text)
      RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE account app.inbound_imap_accounts%ROWTYPE;
      DECLARE receipt app.inbound_imap_receipts%ROWTYPE;
      DECLARE new_thread uuid := gen_random_uuid();
      DECLARE new_message uuid := gen_random_uuid();
      BEGIN
        IF session_user <> 'elevateo_worker' THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
        SELECT * INTO account FROM app.inbound_imap_accounts WHERE id=p_account FOR UPDATE;
        IF NOT FOUND OR NOT account.active OR account.credential_version IS DISTINCT FROM p_version THEN
          RAISE EXCEPTION 'imap account unavailable' USING ERRCODE='42501';
        END IF;
        IF p_validity IS NULL OR p_validity <= 0 OR p_uid IS NULL OR p_uid <= 0 OR
           p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' OR
           p_sender IS NULL OR NOT app.thread_address_valid(p_sender) OR
           p_recipients IS NULL OR NOT app.thread_recipients_valid(p_recipients) OR
           p_subject IS NULL OR char_length(p_subject) > 255 OR
           p_body IS NULL OR octet_length(p_body) > 262144 THEN
          RAISE EXCEPTION 'invalid imap input' USING ERRCODE='22023';
        END IF;
        IF account.uidvalidity IS NOT NULL AND account.uidvalidity <> p_validity THEN
          RETURN jsonb_build_object('result','uidvalidity_changed');
        END IF;
        IF p_uid <= account.last_uid THEN
          SELECT * INTO receipt FROM app.inbound_imap_receipts
            WHERE account_id=p_account AND uidvalidity=p_validity AND uid=p_uid;
          IF NOT FOUND OR receipt.content_sha256 <> p_digest THEN
            RAISE EXCEPTION 'imap replay mismatch' USING ERRCODE='23514';
          END IF;
          RETURN jsonb_build_object('result','duplicate','thread_id',receipt.thread_id,
            'message_id',receipt.message_id,'last_uid',account.last_uid);
        END IF;
        PERFORM set_config('app.org_id',account.organization_id::text,true);
        INSERT INTO app.inbound_imap_receipts(account_id,organization_id,mailbox_id,uidvalidity,uid,
          content_sha256,thread_id,message_id) VALUES(p_account,account.organization_id,account.mailbox_id,
          p_validity,p_uid,p_digest,new_thread,new_message);
        INSERT INTO app.threads(id,organization_id,mailbox_id,subject)
          VALUES(new_thread,account.organization_id,account.mailbox_id,p_subject);
        INSERT INTO app.messages(id,organization_id,mailbox_id,thread_id,sender,recipients,sent_at,body_text,attachment_count)
          VALUES(new_message,account.organization_id,account.mailbox_id,new_thread,p_sender,p_recipients,
            clock_timestamp(),p_body,0);
        UPDATE app.inbound_imap_accounts SET uidvalidity=p_validity,last_uid=p_uid WHERE id=p_account;
        RETURN jsonb_build_object('result','created','thread_id',new_thread,
          'message_id',new_message,'last_uid',p_uid);
      END $$;
      REVOKE ALL ON FUNCTION app.ingest_imap_mail(uuid,integer,bigint,bigint,text,jsonb,jsonb,text,text)
        FROM PUBLIC,elevateo_api,elevateo_app_read;
      GRANT EXECUTE ON FUNCTION app.ingest_imap_mail(uuid,integer,bigint,bigint,text,jsonb,jsonb,text,text)
        TO elevateo_worker;
      -- AIDEV-NOTE: A changed UIDVALIDITY never silently reuses the old cursor; the worker must confirm the new epoch.
      CREATE FUNCTION app.reset_imap_uidvalidity(p_account uuid,p_version integer,p_expected bigint,p_new bigint)
      RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE account app.inbound_imap_accounts%ROWTYPE;
      BEGIN
        IF session_user <> 'elevateo_worker' THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
        SELECT * INTO account FROM app.inbound_imap_accounts WHERE id=p_account FOR UPDATE;
        IF NOT FOUND OR NOT account.active OR account.credential_version IS DISTINCT FROM p_version THEN
          RAISE EXCEPTION 'imap account unavailable' USING ERRCODE='42501';
        END IF;
        IF p_new IS NULL OR p_new <= 0 OR account.uidvalidity IS DISTINCT FROM p_expected OR
           account.uidvalidity IS NOT DISTINCT FROM p_new THEN
          RAISE EXCEPTION 'imap cursor changed' USING ERRCODE='22023';
        END IF;
        UPDATE app.inbound_imap_accounts SET uidvalidity=p_new,last_uid=0 WHERE id=p_account;
        RETURN true;
      END $$;
      REVOKE ALL ON FUNCTION app.reset_imap_uidvalidity(uuid,integer,bigint,bigint)
        FROM PUBLIC,elevateo_api,elevateo_app_read;
      GRANT EXECUTE ON FUNCTION app.reset_imap_uidvalidity(uuid,integer,bigint,bigint) TO elevateo_worker;
      CREATE FUNCTION app.claim_imap_account(p_account uuid,p_version integer)
      RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE account app.inbound_imap_accounts%ROWTYPE;
      BEGIN
        IF session_user <> 'elevateo_worker' THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
        SELECT * INTO account FROM app.inbound_imap_accounts WHERE id=p_account;
        IF NOT FOUND OR NOT account.active OR account.credential_version IS DISTINCT FROM p_version THEN
          RAISE EXCEPTION 'imap account unavailable' USING ERRCODE='42501';
        END IF;
        RETURN jsonb_build_object('credential_ref',account.credential_ref,
          'uidvalidity',account.uidvalidity,'last_uid',account.last_uid);
      END $$;
      REVOKE ALL ON FUNCTION app.claim_imap_account(uuid,integer) FROM PUBLIC,elevateo_api,elevateo_app_read;
      GRANT EXECUTE ON FUNCTION app.claim_imap_account(uuid,integer) TO elevateo_worker;
    SQL
  end

  def down
    execute "DROP FUNCTION app.claim_imap_account(uuid,integer)"
    execute "DROP FUNCTION app.reset_imap_uidvalidity(uuid,integer,bigint,bigint)"
    execute "DROP FUNCTION app.ingest_imap_mail(uuid,integer,bigint,bigint,text,jsonb,jsonb,text,text)"
    execute "DROP POLICY imap_owner_message_insert ON app.messages"
    execute "DROP POLICY imap_owner_thread_insert ON app.threads"
    execute "DROP POLICY imap_owner_mailbox ON app.mailboxes"
    execute "DROP TABLE app.inbound_imap_receipts"
    execute "DROP TABLE app.inbound_imap_accounts"
  end
end
