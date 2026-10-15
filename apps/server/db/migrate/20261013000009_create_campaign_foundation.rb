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
        creation_fingerprint text NOT NULL CHECK (creation_fingerprint ~ '^[0-9a-f]{64}$'),
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
        consent_operation_id uuid,
        suppressed_at timestamptz,
        operation_id uuid NOT NULL,
        creation_fingerprint text NOT NULL CHECK (creation_fingerprint ~ '^[0-9a-f]{64}$'),
        version integer NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 2147483647),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id, campaign_id, id),
        UNIQUE (organization_id, campaign_id, operation_id),
        UNIQUE (organization_id, campaign_id, email),
        FOREIGN KEY (organization_id, campaign_id) REFERENCES app.campaigns(organization_id, id) ON DELETE CASCADE,
        CHECK (consent_status <> 'granted' OR (consent_recorded_at IS NOT NULL AND consent_source IS NOT NULL AND consent_recorded_by IS NOT NULL)),
        CHECK (consent_operation_id IS NOT NULL OR (consent_status='unknown' AND consent_recorded_at IS NULL
          AND consent_source IS NULL AND consent_recorded_by IS NULL))
      );
      CREATE TABLE app.campaign_consent_events (
        organization_id uuid NOT NULL,
        campaign_id uuid NOT NULL,
        lead_id uuid NOT NULL,
        operation_id uuid NOT NULL,
        actor_id uuid NOT NULL,
        email text NOT NULL CHECK (octet_length(email) BETWEEN 3 AND 254),
        lead_version integer NOT NULL CHECK (lead_version BETWEEN 2 AND 2147483647),
        status text NOT NULL CHECK (status IN ('unknown', 'granted', 'withdrawn')),
        evidence_kind text NOT NULL CHECK (evidence_kind IN ('manual_attestation', 'status_change')),
        source text CHECK (source IS NULL OR length(source) BETWEEN 1 AND 200),
        observed_at timestamptz,
        recorded_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (organization_id, operation_id),
        FOREIGN KEY (organization_id, campaign_id, lead_id)
          REFERENCES app.campaign_leads(organization_id, campaign_id, id) ON DELETE CASCADE,
        CHECK (status <> 'granted' OR (evidence_kind = 'manual_attestation' AND source IS NOT NULL AND observed_at IS NOT NULL))
      );
      CREATE TABLE app.campaign_accounts (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        campaign_id uuid NOT NULL,
        mailbox_id uuid NOT NULL,
        label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
        status text NOT NULL DEFAULT 'disabled' CHECK (status = 'disabled'),
        operation_id uuid NOT NULL,
        creation_fingerprint text NOT NULL CHECK (creation_fingerprint ~ '^[0-9a-f]{64}$'),
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
      CREATE FUNCTION app.guard_campaign_lead_update() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF NEW.version <> OLD.version + 1 THEN
          RAISE EXCEPTION 'campaign lead version must advance' USING ERRCODE='23514';
        END IF;
        IF OLD.consent_operation_id IS NOT NULL AND NEW.consent_operation_id IS NULL THEN
          RAISE EXCEPTION 'campaign lead consent link cannot be cleared' USING ERRCODE='23514';
        END IF;
        IF (NEW.consent_operation_id IS DISTINCT FROM OLD.consent_operation_id
          OR NEW.email IS DISTINCT FROM OLD.email OR NEW.consent_status IS DISTINCT FROM OLD.consent_status
          OR NEW.consent_source IS DISTINCT FROM OLD.consent_source
          OR NEW.consent_recorded_at IS DISTINCT FROM OLD.consent_recorded_at
          OR NEW.consent_recorded_by IS DISTINCT FROM OLD.consent_recorded_by)
          AND (NEW.consent_operation_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM app.campaign_consent_events e
            WHERE e.organization_id=NEW.organization_id AND e.campaign_id=NEW.campaign_id
              AND e.lead_id=NEW.id AND e.operation_id=NEW.consent_operation_id
              AND e.lead_version=NEW.version)) THEN
          RAISE EXCEPTION 'campaign lead change requires fresh consent event' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END;
      $fn$;
      CREATE TRIGGER campaign_lead_update_guard BEFORE UPDATE ON app.campaign_leads
        FOR EACH ROW EXECUTE FUNCTION app.guard_campaign_lead_update();
    SQL
    %w[campaigns campaign_leads campaign_consent_events campaign_accounts campaign_suppressions campaign_mutations].each do |table|
      execute "ALTER TABLE app.#{table} ENABLE ROW LEVEL SECURITY"
      execute "ALTER TABLE app.#{table} FORCE ROW LEVEL SECURITY"
      execute "REVOKE ALL ON app.#{table} FROM PUBLIC"
      visible_mailbox = if table == "campaign_accounts"
        " AND EXISTS (SELECT 1 FROM app.mailboxes mb WHERE mb.organization_id = " \
          "campaign_accounts.organization_id AND mb.id = campaign_accounts.mailbox_id)" \
          " AND EXISTS (SELECT 1 FROM app.mailbox_memberships mm WHERE mm.organization_id = " \
          "campaign_accounts.organization_id AND mm.mailbox_id = campaign_accounts.mailbox_id " \
          "AND mm.user_id = app.context_uuid('app.user_id'))"
      elsif table == "campaign_mutations"
        " AND (campaign_mutations.resource_kind <> 'account' OR EXISTS " \
          "(SELECT 1 FROM app.campaign_accounts a WHERE a.organization_id = " \
          "campaign_mutations.organization_id AND a.id = campaign_mutations.resource_id))"
      else
        ""
      end
      # AIDEV-NOTE: Reads use a current session/role proof; every inert write also needs the DB-private protected-write marker.
      read_guard = <<~SQL.squish
        AND CASE WHEN NULLIF(current_setting('app.outreach_digest', true), '') IS NULL THEN false
          ELSE (SELECT app.authorize_outreach_content_read(
            NULLIF(current_setting('app.outreach_digest', true), ''))->>'status' = 'ok') END
      SQL
      write_guard = <<~SQL.squish
        AND CASE WHEN NULLIF(current_setting('app.outreach_digest', true), '') IS NULL THEN false
          ELSE (SELECT app.authorize_outreach_draft_write(
            NULLIF(current_setting('app.outreach_digest', true), ''))->>'status' = 'ok') END
      SQL
      write_integrity = case table
      when "campaign_leads"
        <<~SQL.squish
          AND ((consent_operation_id IS NULL AND consent_status='unknown' AND consent_recorded_at IS NULL
            AND consent_source IS NULL AND consent_recorded_by IS NULL)
          OR EXISTS (SELECT 1 FROM app.campaign_consent_events e
            WHERE e.organization_id=campaign_leads.organization_id
              AND e.campaign_id=campaign_leads.campaign_id AND e.lead_id=campaign_leads.id
              AND e.operation_id=campaign_leads.consent_operation_id AND e.email=campaign_leads.email
              AND e.lead_version<=campaign_leads.version
              AND e.status=campaign_leads.consent_status
              AND e.source IS NOT DISTINCT FROM campaign_leads.consent_source
              AND e.observed_at IS NOT DISTINCT FROM campaign_leads.consent_recorded_at
              AND (campaign_leads.consent_status <> 'granted' OR e.actor_id=campaign_leads.consent_recorded_by)))
        SQL
      when "campaign_consent_events"
        " AND campaign_consent_events.actor_id = app.context_uuid('app.user_id')"
      when "campaign_mutations"
        <<~SQL.squish
          AND ((resource_kind='campaign' AND EXISTS (SELECT 1 FROM app.campaigns c
            WHERE c.organization_id=campaign_mutations.organization_id AND c.id=campaign_mutations.resource_id))
          OR (resource_kind='lead' AND EXISTS (SELECT 1 FROM app.campaign_leads l
            WHERE l.organization_id=campaign_mutations.organization_id AND l.id=campaign_mutations.resource_id))
          OR (resource_kind='account' AND EXISTS (SELECT 1 FROM app.campaign_accounts a
            WHERE a.organization_id=campaign_mutations.organization_id AND a.id=campaign_mutations.resource_id)))
        SQL
      else
        ""
      end
      scope = <<~SQL.squish
        organization_id = app.context_uuid('app.org_id') AND EXISTS (
          SELECT 1 FROM app.organization_memberships m
          WHERE m.organization_id = #{table}.organization_id AND m.user_id = app.context_uuid('app.user_id'))#{visible_mailbox}
      SQL
      execute <<~SQL
        CREATE POLICY campaign_select ON app.#{table} FOR SELECT TO elevateo_app_read
          USING (#{scope} #{read_guard});
      SQL
      execute <<~SQL
        CREATE POLICY campaign_insert ON app.#{table} FOR INSERT TO elevateo_app_read
          WITH CHECK (#{scope} #{write_guard} #{write_integrity});
      SQL
      next unless %w[campaigns campaign_leads campaign_accounts].include?(table)

      execute <<~SQL
        CREATE POLICY campaign_update ON app.#{table} FOR UPDATE TO elevateo_app_read
          USING (#{scope} #{write_guard})
          WITH CHECK (#{scope} #{write_guard} #{write_integrity});
      SQL
    end
    # AIDEV-NOTE: Membership RLS limits inert CRUD; no privilege reaches send intents or provider transport.
    execute "GRANT SELECT, INSERT, UPDATE ON app.campaigns, app.campaign_leads, app.campaign_accounts TO elevateo_app_read"
    execute "GRANT SELECT, INSERT ON app.campaign_mutations, app.campaign_consent_events, app.campaign_suppressions TO elevateo_app_read"
  end

  def down
    # AIDEV-NOTE: Rollback is supported for empty disposable schemas only; populated draft/audit rows are preserved.
    tables = %w[campaign_mutations campaign_suppressions campaign_accounts campaign_consent_events campaign_leads campaigns]
    # AIDEV-NOTE: Lock before inspecting all tenants; savepoint rollback restores FORCE even when callers rescue.
    connection.transaction(requires_new: true) do
      tables.each { |table| execute "ALTER TABLE app.#{table} NO FORCE ROW LEVEL SECURITY" }
      tables.each do |table|
        present = select_value("SELECT EXISTS (SELECT 1 FROM app.#{table} LIMIT 1)")
        raise ActiveRecord::IrreversibleMigration, "campaign foundation contains records" if %w[t true].include?(present.to_s)
      end
      execute "DROP TABLE app.campaign_mutations, app.campaign_suppressions, app.campaign_accounts, app.campaign_consent_events, app.campaign_leads, app.campaigns"
      execute "DROP FUNCTION app.guard_campaign_lead_update()"
    end
  end
end
