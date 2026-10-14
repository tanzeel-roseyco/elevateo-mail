# frozen_string_literal: true

# AIDEV-NOTE: OUT-804 stores inert campaign plans; no table or grant can initiate transport.
class CreateCampaignFoundation < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      CREATE TABLE app.campaigns (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
        name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'paused')),
        operation_id uuid NOT NULL,
        version integer NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 2147483647),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id, id),
        UNIQUE (organization_id, operation_id)
      );
      CREATE TABLE app.campaign_leads (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        campaign_id uuid NOT NULL,
        email text NOT NULL CHECK (octet_length(email) BETWEEN 3 AND 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
        consent_status text NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('unknown', 'granted', 'withdrawn')),
        consent_recorded_at timestamptz,
        consent_recorded_by uuid,
        consent_source text CHECK (consent_source IS NULL OR length(consent_source) BETWEEN 1 AND 200),
        suppressed_at timestamptz,
        operation_id uuid NOT NULL,
        version integer NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 2147483647),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id, campaign_id, id),
        UNIQUE (organization_id, campaign_id, operation_id),
        UNIQUE (organization_id, campaign_id, email),
        FOREIGN KEY (organization_id, campaign_id) REFERENCES app.campaigns(organization_id, id) ON DELETE CASCADE,
        CHECK (consent_status <> 'granted' OR (consent_recorded_at IS NOT NULL AND consent_source IS NOT NULL AND consent_recorded_by IS NOT NULL))
      );
      CREATE TABLE app.campaign_consent_events (
        organization_id uuid NOT NULL,
        campaign_id uuid NOT NULL,
        lead_id uuid NOT NULL,
        operation_id uuid NOT NULL,
        actor_id uuid NOT NULL,
        status text NOT NULL CHECK (status IN ('unknown', 'granted', 'withdrawn')),
        source text CHECK (source IS NULL OR length(source) BETWEEN 1 AND 200),
        observed_at timestamptz,
        recorded_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (organization_id, operation_id),
        FOREIGN KEY (organization_id, campaign_id, lead_id)
          REFERENCES app.campaign_leads(organization_id, campaign_id, id) ON DELETE CASCADE,
        CHECK (status <> 'granted' OR (source IS NOT NULL AND observed_at IS NOT NULL))
      );
      CREATE TABLE app.campaign_accounts (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        campaign_id uuid NOT NULL,
        mailbox_id uuid NOT NULL,
        label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
        status text NOT NULL DEFAULT 'disabled' CHECK (status = 'disabled'),
        operation_id uuid NOT NULL,
        version integer NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 2147483647),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id, campaign_id, id),
        UNIQUE (organization_id, campaign_id, mailbox_id),
        UNIQUE (organization_id, campaign_id, operation_id),
        FOREIGN KEY (organization_id, campaign_id) REFERENCES app.campaigns(organization_id, id) ON DELETE CASCADE,
        FOREIGN KEY (organization_id, mailbox_id) REFERENCES app.mailboxes(organization_id, id)
      );
      CREATE TABLE app.campaign_suppressions (
        organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
        email text NOT NULL CHECK (octet_length(email) BETWEEN 3 AND 254),
        reason text NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'manual')),
        recorded_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (organization_id, email)
      );
      CREATE TABLE app.campaign_mutations (
        organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
        operation_id uuid NOT NULL,
        resource_kind text NOT NULL CHECK (resource_kind IN ('campaign','lead','account')),
        resource_id uuid NOT NULL,
        fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
        result jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (organization_id, operation_id)
      );
      CREATE INDEX campaign_leads_analytics_idx ON app.campaign_leads(organization_id, campaign_id, consent_status);
    SQL
    %w[campaigns campaign_leads campaign_consent_events campaign_accounts campaign_suppressions campaign_mutations].each do |table|
      execute "ALTER TABLE app.#{table} ENABLE ROW LEVEL SECURITY"
      execute "ALTER TABLE app.#{table} FORCE ROW LEVEL SECURITY"
      execute "REVOKE ALL ON app.#{table} FROM PUBLIC"
      visible_mailbox = if table == "campaign_accounts"
        " AND EXISTS (SELECT 1 FROM app.mailboxes mb WHERE mb.organization_id = " \
          "campaign_accounts.organization_id AND mb.id = campaign_accounts.mailbox_id)"
      elsif table == "campaign_mutations"
        " AND (campaign_mutations.resource_kind <> 'account' OR EXISTS " \
          "(SELECT 1 FROM app.campaign_accounts a WHERE a.organization_id = " \
          "campaign_mutations.organization_id AND a.id = campaign_mutations.resource_id))"
      else
        ""
      end
      execute <<~SQL
        CREATE POLICY campaign_tenant ON app.#{table} FOR ALL TO elevateo_app_read
          USING (organization_id = app.context_uuid('app.org_id') AND EXISTS (
            SELECT 1 FROM app.organization_memberships m
            WHERE m.organization_id = #{table}.organization_id AND m.user_id = app.context_uuid('app.user_id'))#{visible_mailbox})
          WITH CHECK (organization_id = app.context_uuid('app.org_id') AND EXISTS (
            SELECT 1 FROM app.organization_memberships m
            WHERE m.organization_id = #{table}.organization_id AND m.user_id = app.context_uuid('app.user_id'))#{visible_mailbox})
      SQL
    end
    # AIDEV-NOTE: Membership RLS limits inert CRUD; no privilege reaches send intents or provider transport.
    execute "GRANT SELECT, INSERT, UPDATE ON app.campaigns, app.campaign_leads, app.campaign_accounts TO elevateo_app_read"
    execute "GRANT SELECT, INSERT ON app.campaign_mutations, app.campaign_consent_events, app.campaign_suppressions TO elevateo_app_read"
  end

  def down
    execute "DROP TABLE app.campaign_mutations, app.campaign_suppressions, app.campaign_accounts, app.campaign_consent_events, app.campaign_leads, app.campaigns"
  end
end
