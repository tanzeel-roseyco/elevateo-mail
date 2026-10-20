# frozen_string_literal: true

# AIDEV-NOTE: One bounded run freezes content and audience; existing send intents remain the delivery authority.
class CreateMarketingRuns < ActiveRecord::Migration[8.1]
  def up
    execute "RESET ROLE"
    execute <<~SQL
      CREATE UNIQUE INDEX marketing_lead_org_identity ON app.campaign_leads(organization_id,id);
      CREATE TABLE app.marketing_runs (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES app.organizations(id),
        campaign_id uuid NOT NULL, mailbox_id uuid NOT NULL, actor_id uuid NOT NULL,
        operation_id uuid NOT NULL, request_digest text NOT NULL CHECK(request_digest ~ '^[0-9a-f]{64}$'),
        state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','cancelled')),
        subject text NOT NULL CHECK(char_length(subject) BETWEEN 1 AND 998),
        body_text text NOT NULL CHECK(octet_length(body_text) BETWEEN 1 AND 65536),
        simulated boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        UNIQUE(organization_id,id), UNIQUE(organization_id,actor_id,operation_id),
        FOREIGN KEY(organization_id,campaign_id) REFERENCES app.campaigns(organization_id,id),
        FOREIGN KEY(organization_id,mailbox_id) REFERENCES app.mailboxes(organization_id,id)
      );
      CREATE TABLE app.marketing_enrollments (
        organization_id uuid NOT NULL, run_id uuid NOT NULL, lead_id uuid NOT NULL,
        draft_id uuid NOT NULL UNIQUE, email text NOT NULL, send_id uuid,
        PRIMARY KEY(run_id,lead_id),
        FOREIGN KEY(organization_id,run_id) REFERENCES app.marketing_runs(organization_id,id),
        FOREIGN KEY(organization_id,lead_id) REFERENCES app.campaign_leads(organization_id,id)
      );
      ALTER TABLE app.marketing_runs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE app.marketing_runs FORCE ROW LEVEL SECURITY;
      ALTER TABLE app.marketing_enrollments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE app.marketing_enrollments FORCE ROW LEVEL SECURITY;
      REVOKE ALL ON app.marketing_runs,app.marketing_enrollments FROM PUBLIC;
      GRANT SELECT,INSERT ON app.marketing_runs TO elevateo_app_read;
      GRANT UPDATE(state) ON app.marketing_runs TO elevateo_app_read;
      GRANT SELECT,INSERT ON app.marketing_enrollments TO elevateo_app_read;
      GRANT UPDATE(send_id) ON app.marketing_enrollments TO elevateo_app_read;
      GRANT SELECT ON app.marketing_runs,app.marketing_enrollments TO elevateo_send_owner;
      GRANT SELECT (organization_id,id,campaign_id,suppressed_at), UPDATE (id) ON app.campaign_leads TO elevateo_send_owner;
      GRANT SELECT (organization_id,id,status), UPDATE (id) ON app.campaigns TO elevateo_send_owner;
      GRANT SELECT (organization_id,email) ON app.campaign_suppressions TO elevateo_send_owner;
      CREATE POLICY send_owner_marketing_campaign ON app.campaigns FOR SELECT TO elevateo_send_owner USING(true);
      CREATE POLICY send_owner_marketing_campaign_lock ON app.campaigns FOR UPDATE TO elevateo_send_owner USING(true) WITH CHECK(false);
      CREATE POLICY send_owner_marketing_suppression ON app.campaign_suppressions FOR SELECT TO elevateo_send_owner USING(true);
    SQL
    %w[marketing_runs marketing_enrollments].each do |table|
      scope = "organization_id=app.context_uuid('app.org_id') AND EXISTS (SELECT 1 FROM app.marketing_runs r " \
        "WHERE r.organization_id=#{table}.organization_id AND r.id=#{table == 'marketing_runs' ? table + '.id' : table + '.run_id'} " \
        "AND r.actor_id=app.context_uuid('app.user_id') AND EXISTS (SELECT 1 FROM app.mailbox_memberships m " \
        "WHERE m.organization_id=r.organization_id AND m.mailbox_id=r.mailbox_id AND m.user_id=r.actor_id AND m.compose AND m.approve_send))"
      # AIDEV-NOTE: Runs avoid self-recursive RLS by spelling their actor/mailbox scope directly.
      if table == 'marketing_runs'
        scope = "organization_id=app.context_uuid('app.org_id') AND actor_id=app.context_uuid('app.user_id') " \
          "AND EXISTS (SELECT 1 FROM app.mailbox_memberships m WHERE m.organization_id=marketing_runs.organization_id " \
          "AND m.mailbox_id=marketing_runs.mailbox_id AND m.user_id=marketing_runs.actor_id AND m.compose AND m.approve_send)"
      end
      read = "(app.authorize_outreach_content_read(NULLIF(current_setting('app.outreach_digest',true),''))->>'status')='ok'"
      write = "(app.authorize_outreach_draft_write(NULLIF(current_setting('app.outreach_digest',true),''))->>'status')='ok'"
      execute "CREATE POLICY marketing_select ON app.#{table} FOR SELECT TO elevateo_app_read USING(#{scope} AND #{read})"
      execute "CREATE POLICY marketing_insert ON app.#{table} FOR INSERT TO elevateo_app_read WITH CHECK(#{scope} AND #{write})"
      execute "CREATE POLICY marketing_owner ON app.#{table} FOR SELECT TO elevateo_send_owner USING(true)"
      execute "CREATE POLICY marketing_update ON app.#{table} FOR UPDATE TO elevateo_app_read USING(#{scope} AND #{write}) WITH CHECK(#{scope} AND #{write})"
    end
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    execute <<~SQL
      SET LOCAL ROLE elevateo_send_owner;
      -- AIDEV-NOTE: Guard exact campaign enrollment, not consent from another campaign sharing the same email.
      CREATE FUNCTION app_send_private.marketing_dispatch_allowed(i app_send_private.intents) RETURNS boolean
      LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
      DECLARE snap jsonb := convert_from(i.snapshot_bytes,'UTF8')::jsonb; r app.marketing_runs; l record;
      BEGIN
        IF snap->>10='correspondence' THEN RETURN true; END IF;
        IF snap->>10 IS DISTINCT FROM 'marketing' OR snap->>11 IS DISTINCT FROM 'recorded_marketing_consent'
          OR jsonb_array_length(snap->6)<>1 THEN RETURN false; END IF;
        SELECT run.* INTO r FROM app.marketing_runs run JOIN app.marketing_enrollments e
          ON e.organization_id=run.organization_id AND e.run_id=run.id
          WHERE e.draft_id=i.draft_id AND run.organization_id=i.organization_id AND run.mailbox_id=i.mailbox_id;
        IF NOT FOUND OR r.state<>'queued' OR snap->>7 IS DISTINCT FROM r.subject OR snap->>8 IS DISTINCT FROM r.body_text THEN RETURN false; END IF;
        PERFORM 1 FROM app.campaigns c WHERE c.organization_id=r.organization_id AND c.id=r.campaign_id AND c.status='draft' FOR SHARE;
        IF NOT FOUND THEN RETURN false; END IF;
        SELECT lead.email,lead.consent_status,lead.consent_recorded_at,lead.consent_source,lead.consent_recorded_by,lead.suppressed_at INTO l FROM app.campaign_leads lead JOIN app.marketing_enrollments e
          ON e.organization_id=lead.organization_id AND e.lead_id=lead.id
          WHERE e.run_id=r.id AND e.draft_id=i.draft_id AND lead.campaign_id=r.campaign_id FOR SHARE OF lead;
        RETURN FOUND AND l.consent_status='granted' AND l.consent_recorded_at IS NOT NULL
          AND l.consent_source IS NOT NULL AND l.consent_recorded_by IS NOT NULL AND l.suppressed_at IS NULL
          AND app_send_private.canonical_address(l.email)=snap->6->0->>1
          AND NOT EXISTS (SELECT 1 FROM app.campaign_suppressions s WHERE s.organization_id=r.organization_id
            AND app_send_private.canonical_address(s.email)=snap->6->0->>1);
      END $$;
      REVOKE ALL ON FUNCTION app_send_private.marketing_dispatch_allowed(app_send_private.intents) FROM PUBLIC,elevateo_api,elevateo_app_read,elevateo_worker;
      RESET ROLE;
    SQL
    execute File.read(File.expand_path("../be03_send/marketing_authority_v1.sql", __dir__))
    execute "RESET ROLE"
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end

  def down
    execute "RESET ROLE"
    if select_value("SELECT EXISTS(SELECT 1 FROM app.marketing_runs)")
      raise ActiveRecord::IrreversibleMigration, "marketing history exists; preserve approvals before rollback"
    end
    # AIDEV-NOTE: Restore immutable prior authorities before removing the empty enrollment schema.
    execute "SET LOCAL ROLE elevateo_send_owner"
    previous = File.read(File.expand_path("../be03_send/resend_attachments_v3.sql", __dir__))
    budget = File.read(File.expand_path("../be03_send/budget_authority_resend_v1.sql", __dir__))
    %w[review_policy snapshot_validation authorize_attempt final_attempt_check].each do |name|
      definition = previous[/CREATE OR REPLACE FUNCTION app_send_private\.#{name}\(.*?\n(?:END )?\$\$;/m]
      raise "Missing prior authority #{name}" unless definition
      execute definition
    end
    %w[authorize_attempt final_attempt_check].each do |name|
      definition = budget[/CREATE OR REPLACE FUNCTION app_send_private\.#{name}\(.*?\n(?:END )?\$\$;/m]
      raise "Missing prior budget authority #{name}" unless definition
      execute definition.sub("app_send_private.#{name}(", "app_send_private.#{name}_legacy_v1(")
    end
    execute "DROP FUNCTION app_send_private.marketing_dispatch_allowed(app_send_private.intents)"
    execute "RESET ROLE"
    execute <<~SQL
      DROP TABLE app.marketing_enrollments;
      DROP TABLE app.marketing_runs;
      DROP INDEX app.marketing_lead_org_identity;
      DROP POLICY send_owner_marketing_campaign ON app.campaigns;
      DROP POLICY send_owner_marketing_campaign_lock ON app.campaigns;
      DROP POLICY send_owner_marketing_suppression ON app.campaign_suppressions;
      REVOKE SELECT(id,campaign_id,suppressed_at), UPDATE(id) ON app.campaign_leads FROM elevateo_send_owner;
      REVOKE SELECT(organization_id,id,status), UPDATE(id) ON app.campaigns FROM elevateo_send_owner;
      REVOKE SELECT(organization_id,email) ON app.campaign_suppressions FROM elevateo_send_owner;
    SQL
  end
end
