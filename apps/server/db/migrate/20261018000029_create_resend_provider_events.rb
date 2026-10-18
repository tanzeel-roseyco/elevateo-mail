# frozen_string_literal: true

class CreateResendProviderEvents < ActiveRecord::Migration[8.1]
  def up
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    execute <<~SQL
      -- AIDEV-NOTE: The private send owner must own the table and has REFERENCES authority on the intent ledger.
      SET LOCAL ROLE elevateo_send_owner;
      CREATE TABLE app_send_private.resend_events (
        event_id text PRIMARY KEY CHECK (event_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
        event_type text NOT NULL CHECK (event_type IN ('email.sent','email.delivered','email.delivery_delayed',
          'email.bounced','email.complained','email.received')),
        provider_id text NOT NULL CHECK (provider_id ~ '^[A-Za-z0-9_-]{1,128}$'),
        delivery_state text NOT NULL CHECK (delivery_state IN
          ('sent','delivered','delivery_delayed','bounced','complained','received')),
        send_id uuid REFERENCES app_send_private.intents(send_id) ON DELETE RESTRICT,
        recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        UNIQUE(event_id,event_type,provider_id)
      );
      ALTER TABLE app_send_private.resend_events ENABLE ROW LEVEL SECURITY;
      ALTER TABLE app_send_private.resend_events FORCE ROW LEVEL SECURITY;
      CREATE POLICY resend_event_owner ON app_send_private.resend_events TO elevateo_send_owner
        USING (true) WITH CHECK (true);
      REVOKE ALL ON app_send_private.resend_events FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;

      -- AIDEV-NOTE: A provider event is inserted before effects; replay returns duplicate without repeating suppression writes.
      CREATE FUNCTION app.ingest_resend_event(p_event text,p_type text,p_provider text,p_email text) RETURNS jsonb
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE target uuid; target_org uuid; inserted boolean;
      BEGIN
        SELECT j.send_id,i.organization_id INTO target,target_org
          FROM app_send_private.jobs j JOIN app_send_private.intents i USING(send_id)
          WHERE j.accepted_receipt_ref='resend:'||p_provider;
        INSERT INTO app_send_private.resend_events(event_id,event_type,provider_id,delivery_state,send_id)
          VALUES(p_event,p_type,p_provider,CASE p_type WHEN 'email.sent' THEN 'sent'
            WHEN 'email.delivered' THEN 'delivered' WHEN 'email.delivery_delayed' THEN 'delivery_delayed'
            WHEN 'email.bounced' THEN 'bounced' WHEN 'email.complained' THEN 'complained' ELSE 'received' END,target)
          ON CONFLICT(event_id) DO NOTHING;
        inserted := FOUND;
        IF inserted AND target IS NOT NULL AND p_type IN ('email.bounced','email.complained') AND p_email IS NOT NULL THEN
          INSERT INTO app_send_private.recipient_suppressions(organization_id,canonical_address,created_at)
            VALUES(target_org,app_send_private.canonical_address(p_email),clock_timestamp()) ON CONFLICT DO NOTHING;
        END IF;
        RETURN jsonb_build_object('result',CASE WHEN inserted THEN 'created' ELSE 'duplicate' END,
          'delivery_state',CASE p_type WHEN 'email.sent' THEN 'sent' WHEN 'email.delivered' THEN 'delivered'
            WHEN 'email.delivery_delayed' THEN 'delivery_delayed' WHEN 'email.bounced' THEN 'bounced'
            WHEN 'email.complained' THEN 'complained' ELSE 'received' END);
      END $$;
      REVOKE ALL ON FUNCTION app.ingest_resend_event(text,text,text,text) FROM PUBLIC,elevateo_worker,elevateo_app_read;
      GRANT EXECUTE ON FUNCTION app.ingest_resend_event(text,text,text,text) TO elevateo_api;
    SQL
    # SET LOCAL ROLE survives until the migration transaction ends, including Rails' schema-migration insert.
    execute "RESET ROLE"
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end

  def down
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute "DROP FUNCTION app.ingest_resend_event(text,text,text,text)"
    execute "DROP TABLE app_send_private.resend_events"
    execute "RESET ROLE"
  end
end
