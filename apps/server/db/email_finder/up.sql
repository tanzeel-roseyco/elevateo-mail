SET LOCAL ROLE elevateo_owner;

CREATE TABLE app.email_finder_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('person','verify','company','decision_maker')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  total integer NOT NULL CHECK (total BETWEEN 1 AND 5000),
  completed integer NOT NULL DEFAULT 0 CHECK (completed >= 0 AND completed <= total),
  items jsonb NOT NULL,
  next_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id)
);
CREATE INDEX email_finder_ready ON app.email_finder_jobs(next_at) WHERE status IN ('queued','running');
CREATE TABLE app.email_finder_domains (
  organization_id uuid NOT NULL REFERENCES app.organizations(id), domain text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}', checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,domain)
);
CREATE TABLE app.email_finder_people (
  organization_id uuid NOT NULL REFERENCES app.organizations(id), email text NOT NULL,
  name text NOT NULL, domain text NOT NULL, patterns jsonb NOT NULL DEFAULT '[]',
  checked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (organization_id,email)
);
CREATE TABLE app.email_finder_results (
  organization_id uuid NOT NULL REFERENCES app.organizations(id), cache_key text NOT NULL,
  input jsonb NOT NULL, result jsonb NOT NULL, checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,cache_key)
);
CREATE TABLE app.email_finder_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES app.organizations(id),
  kind text NOT NULL CHECK (kind IN ('email','domain','person')), value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id,kind,value)
);
-- AIDEV-NOTE: Limits are global across tenants and restarts; only the worker may mutate them.
CREATE TABLE app.email_finder_rate_state (key text PRIMARY KEY, value jsonb NOT NULL);

DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['jobs','domains','people','results','suppressions'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY','email_finder_' || relation);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY','email_finder_' || relation);
    EXECUTE format('CREATE POLICY worker ON app.%I TO elevateo_worker USING(true) WITH CHECK(true)','email_finder_' || relation);
    EXECUTE format('CREATE POLICY tenant_read ON app.%I FOR SELECT TO elevateo_app_read USING (
      organization_id=app.context_uuid(''app.org_id'') AND
      (app.authorize_outreach_content_read(NULLIF(current_setting(''app.outreach_digest'',true),''''))->>''status'')=''ok'')','email_finder_' || relation);
    EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC','email_finder_' || relation);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON app.%I TO elevateo_worker','email_finder_' || relation);
    EXECUTE format('GRANT SELECT ON app.%I TO elevateo_app_read','email_finder_' || relation);
  END LOOP;
  FOREACH relation IN ARRAY ARRAY['jobs','suppressions'] LOOP
    -- AIDEV-NOTE: Command-specific policies keep protected-write assertions out of ordinary SELECT paths.
    EXECUTE format('CREATE POLICY tenant_insert ON app.%I FOR INSERT TO elevateo_api
      WITH CHECK (organization_id=app.context_uuid(''app.org_id'') AND
      (app.authorize_outreach_draft_write(NULLIF(current_setting(''app.outreach_digest'',true),''''))->>''status'')=''ok'')','email_finder_' || relation);
    EXECUTE format('CREATE POLICY tenant_delete ON app.%I FOR DELETE TO elevateo_api USING (
      organization_id=app.context_uuid(''app.org_id'') AND
      (app.authorize_outreach_draft_write(NULLIF(current_setting(''app.outreach_digest'',true),''''))->>''status'')=''ok'')','email_finder_' || relation);
    EXECUTE format('GRANT INSERT,DELETE ON app.%I TO elevateo_api','email_finder_' || relation);
  END LOOP;
END $$;
-- AIDEV-NOTE: Job visibility is owner-scoped even within a tenant; worker remains globally queued.
CREATE POLICY job_owner ON app.email_finder_jobs AS RESTRICTIVE TO elevateo_api,elevateo_app_read
  USING (user_id=app.context_uuid('app.user_id')) WITH CHECK (user_id=app.context_uuid('app.user_id'));
ALTER TABLE app.email_finder_rate_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.email_finder_rate_state FORCE ROW LEVEL SECURITY;
CREATE POLICY worker ON app.email_finder_rate_state TO elevateo_worker USING(true) WITH CHECK(true);
CREATE POLICY health_read ON app.email_finder_rate_state FOR SELECT TO elevateo_app_read USING (
  key IN ('health','smtp') AND
  (app.authorize_outreach_content_read(NULLIF(current_setting('app.outreach_digest',true),''))->>'status')='ok');
REVOKE ALL ON app.email_finder_rate_state FROM PUBLIC;
GRANT SELECT ON app.email_finder_rate_state TO elevateo_app_read;
GRANT SELECT,INSERT,UPDATE ON app.email_finder_rate_state TO elevateo_worker;
