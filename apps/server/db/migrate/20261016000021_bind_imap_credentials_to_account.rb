# frozen_string_literal: true

class BindImapCredentialsToAccount < ActiveRecord::Migration[8.1]
  def up
    replace_claim(<<~SQL)
      'account_id',account.id,'organization_id',account.organization_id,'mailbox_id',account.mailbox_id,
      'credential_version',account.credential_version,
    SQL
  end

  def down
    replace_claim("")
  end

  private

  def replace_claim(identity)
    # AIDEV-NOTE: This read is not a lease; ingest rechecks active/version under its row lock after network IO.
    execute <<~SQL
      CREATE OR REPLACE FUNCTION app.claim_imap_account(p_account uuid,p_version integer)
      RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE account app.inbound_imap_accounts%ROWTYPE;
      BEGIN
        IF session_user <> 'elevateo_worker' THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
        SELECT * INTO account FROM app.inbound_imap_accounts WHERE id=p_account;
        IF NOT FOUND OR NOT account.active OR account.credential_version IS DISTINCT FROM p_version THEN
          RAISE EXCEPTION 'imap account unavailable' USING ERRCODE='42501';
        END IF;
        RETURN jsonb_build_object(#{identity}'credential_ref',account.credential_ref,
          'uidvalidity',account.uidvalidity,'last_uid',account.last_uid);
      END $$;
      REVOKE ALL ON FUNCTION app.claim_imap_account(uuid,integer) FROM PUBLIC,elevateo_api,elevateo_app_read;
      GRANT EXECUTE ON FUNCTION app.claim_imap_account(uuid,integer) TO elevateo_worker;
    SQL
  end
end
