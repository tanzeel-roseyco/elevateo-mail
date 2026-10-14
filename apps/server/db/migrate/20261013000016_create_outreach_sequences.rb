# frozen_string_literal: true

# AIDEV-NOTE: Draft/held sequence storage is inert; no grant reaches send intents, workers or provider transport.
class CreateOutreachSequences < ActiveRecord::Migration[8.1]
  TABLES = %w[campaign_sequence_mutations campaign_sequence_occurrences campaign_sequence_steps campaign_sequences].freeze

  def up
    execute <<~SQL
      CREATE TABLE app.campaign_sequences (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        campaign_id uuid NOT NULL,
        status text NOT NULL CHECK (status IN ('draft','held')),
        timezone text NOT NULL CHECK (octet_length(timezone) BETWEEN 1 AND 128),
        version integer NOT NULL CHECK (version BETWEEN 1 AND 2147483647),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id,campaign_id),
        UNIQUE (organization_id,campaign_id,id),
        FOREIGN KEY (organization_id,campaign_id) REFERENCES app.campaigns(organization_id,id)
      );
      CREATE TABLE app.campaign_sequence_steps (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        campaign_id uuid NOT NULL,
        sequence_id uuid NOT NULL,
        position integer NOT NULL CHECK (position BETWEEN 1 AND 20),
        delay_seconds integer NOT NULL CHECK (delay_seconds BETWEEN 0 AND 2592000),
        local_time time(0) without time zone NOT NULL,
        label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120 AND octet_length(label) <= 480),
        UNIQUE (organization_id,campaign_id,sequence_id,position),
        UNIQUE (organization_id,campaign_id,sequence_id,id),
        FOREIGN KEY (organization_id,campaign_id,sequence_id)
          REFERENCES app.campaign_sequences(organization_id,campaign_id,id)
      );
      CREATE TABLE app.campaign_sequence_occurrences (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        campaign_id uuid NOT NULL,
        sequence_id uuid NOT NULL,
        draft_version integer NOT NULL CHECK (draft_version BETWEEN 1 AND 2147483647),
        lead_id uuid NOT NULL,
        step_id uuid NOT NULL,
        account_id uuid NOT NULL,
        anchor_at timestamptz NOT NULL,
        local_at timestamp(0) without time zone NOT NULL,
        timezone text NOT NULL CHECK (octet_length(timezone) BETWEEN 1 AND 128),
        due_at timestamptz NOT NULL,
        state text NOT NULL CHECK (state IN ('pending','cancelled','claimed')),
        claim_token uuid,
        claimed_at timestamptz,
        stop_reason text CHECK (stop_reason IS NULL OR stop_reason IN ('reply','unsubscribe','suppressed','revoked','rescheduled')),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id,campaign_id,lead_id,step_id,draft_version),
        FOREIGN KEY (organization_id,campaign_id,sequence_id)
          REFERENCES app.campaign_sequences(organization_id,campaign_id,id),
        FOREIGN KEY (organization_id,campaign_id,lead_id)
          REFERENCES app.campaign_leads(organization_id,campaign_id,id),
        FOREIGN KEY (organization_id,campaign_id,account_id)
          REFERENCES app.campaign_accounts(organization_id,campaign_id,id),
        CHECK ((state = 'cancelled') = (stop_reason IS NOT NULL)),
        CHECK ((state = 'claimed' AND claim_token IS NOT NULL AND claimed_at IS NOT NULL)
          OR (state <> 'claimed' AND claim_token IS NULL AND claimed_at IS NULL)),
        CHECK (due_at >= anchor_at)
      );
      CREATE INDEX campaign_sequence_due_idx ON app.campaign_sequence_occurrences(due_at,id) WHERE state='pending';
      CREATE TABLE app.campaign_sequence_mutations (
        organization_id uuid NOT NULL,
        campaign_id uuid NOT NULL,
        sequence_id uuid NOT NULL,
        operation_id uuid NOT NULL,
        fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
        result jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (organization_id,campaign_id,operation_id),
        FOREIGN KEY (organization_id,campaign_id,sequence_id)
          REFERENCES app.campaign_sequences(organization_id,campaign_id,id)
      );
    SQL
    TABLES.each do |table|
      execute "ALTER TABLE app.#{table} ENABLE ROW LEVEL SECURITY"
      execute "ALTER TABLE app.#{table} FORCE ROW LEVEL SECURITY"
      execute "REVOKE ALL ON app.#{table} FROM PUBLIC"
    end
    # AIDEV-NOTE: Reads use current content role; each mutation also requires protected write proof.
    %w[campaign_sequences campaign_sequence_steps campaign_sequence_mutations].each do |table|
      execute <<~SQL
        CREATE POLICY sequence_reader ON app.#{table} FOR SELECT TO elevateo_app_read
          USING (organization_id=app.context_uuid('app.org_id')
            AND NULLIF(current_setting('app.outreach_digest',true),'') IS NOT NULL
            AND (app.authorize_outreach_content_read(current_setting('app.outreach_digest',true))->>'status')='ok');
        CREATE POLICY sequence_insert ON app.#{table} FOR INSERT TO elevateo_app_read
          WITH CHECK (organization_id=app.context_uuid('app.org_id')
            AND NULLIF(current_setting('app.outreach_digest',true),'') IS NOT NULL
            AND (app.authorize_outreach_draft_write(current_setting('app.outreach_digest',true))->>'status')='ok');
      SQL
    end
    execute <<~SQL
      CREATE POLICY sequence_update ON app.campaign_sequences FOR UPDATE TO elevateo_app_read
        USING (organization_id=app.context_uuid('app.org_id')
          AND (app.authorize_outreach_draft_write(current_setting('app.outreach_digest',true))->>'status')='ok')
        WITH CHECK (organization_id=app.context_uuid('app.org_id')
          AND (app.authorize_outreach_draft_write(current_setting('app.outreach_digest',true))->>'status')='ok');
      CREATE POLICY sequence_delete ON app.campaign_sequence_steps FOR DELETE TO elevateo_app_read
        USING (organization_id=app.context_uuid('app.org_id')
          AND (app.authorize_outreach_draft_write(current_setting('app.outreach_digest',true))->>'status')='ok');
    SQL
    # Inert occurrence history is visible to an editor; no API role may insert, claim or cancel rows yet.
    execute <<~SQL
      CREATE POLICY sequence_occurrence_read ON app.campaign_sequence_occurrences FOR SELECT TO elevateo_app_read
        USING (organization_id=app.context_uuid('app.org_id')
          AND NULLIF(current_setting('app.outreach_digest',true),'') IS NOT NULL
          AND (app.authorize_outreach_content_read(current_setting('app.outreach_digest',true))->>'status')='ok');
    SQL
    execute "GRANT SELECT ON app.campaign_sequence_occurrences TO elevateo_app_read"
    execute "GRANT SELECT,INSERT,UPDATE ON app.campaign_sequences TO elevateo_app_read"
    execute "GRANT SELECT,INSERT,DELETE ON app.campaign_sequence_steps TO elevateo_app_read"
    execute "GRANT SELECT,INSERT ON app.campaign_sequence_mutations TO elevateo_app_read"
  end

  def down
    execute "SET LOCAL row_security = off"
    TABLES.each do |table|
      present = select_value("SELECT EXISTS (SELECT 1 FROM app.#{table} LIMIT 1)")
      raise ActiveRecord::IrreversibleMigration, "sequence draft contains records" if %w[t true].include?(present.to_s)
    end
    execute "DROP TABLE app.campaign_sequence_mutations, app.campaign_sequence_occurrences, app.campaign_sequence_steps, app.campaign_sequences"
  end
end
