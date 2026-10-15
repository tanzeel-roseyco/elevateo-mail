-- AIDEV-NOTE: Recipient quotas are private PostgreSQL state; defaults hold mail until an operator provisions every axis.
SET LOCAL ROLE elevateo_send_owner;
CREATE FUNCTION app_send_private.valid_budget_scope(kind text, scope jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE part text; expected integer;
BEGIN
  IF kind IS NULL OR scope IS NULL OR jsonb_typeof(scope)<>'array' THEN RETURN false; END IF;
  expected := CASE kind WHEN 'organization' THEN 1 WHEN 'group' THEN 2 WHEN 'mailbox' THEN 2
    WHEN 'sender_domain' THEN 1 WHEN 'destination_domain' THEN 1 WHEN 'egress' THEN 1 ELSE 0 END;
  IF expected=0 OR jsonb_array_length(scope)<>expected THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(scope) v WHERE jsonb_typeof(v)<>'string') THEN RETURN false; END IF;
  IF kind IN ('sender_domain','destination_domain') THEN
    part := scope->>0;
    RETURN COALESCE(position('@' IN part)=0 AND app_send_private.canonical_address('a@'||part)='a@'||part,false);
  END IF;
  part := scope->>0;
  IF part !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  IF kind='group' THEN RETURN scope->>1 IN ('personal','outreach','seed'); END IF;
  IF kind='mailbox' THEN RETURN scope->>1 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; END IF;
  RETURN true;
END $$;
CREATE TABLE app_send_private.budget_routes (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, mailbox_id uuid NOT NULL,
  group_name text NOT NULL CHECK (group_name IN ('personal','outreach','seed')),
  egress_id uuid NOT NULL, version integer NOT NULL CHECK (version>0), enabled boolean NOT NULL DEFAULT false,
  UNIQUE (organization_id,mailbox_id),
  FOREIGN KEY (organization_id,mailbox_id) REFERENCES app_send_private.mailbox_policy ON DELETE RESTRICT
);
CREATE TABLE app_send_private.budget_limits (
  id uuid PRIMARY KEY, kind text NOT NULL, scope jsonb NOT NULL,
  version integer NOT NULL CHECK (version>0), ceiling integer NOT NULL CHECK (ceiling BETWEEN 0 AND 1000000),
  enabled boolean NOT NULL DEFAULT false, UNIQUE (kind,scope),
  CHECK (app_send_private.valid_budget_scope(kind,scope))
);
CREATE TABLE app_send_private.budget_usage (
  limit_id uuid NOT NULL REFERENCES app_send_private.budget_limits ON DELETE RESTRICT,
  day date NOT NULL CHECK (isfinite(day)), used integer NOT NULL CHECK (used BETWEEN 0 AND 1000000),
  PRIMARY KEY (limit_id,day)
);
CREATE TABLE app_send_private.attempt_budgets (
  attempt_id uuid NOT NULL REFERENCES app_send_private.attempts(attempt_id) ON DELETE RESTRICT,
  limit_id uuid NOT NULL REFERENCES app_send_private.budget_limits ON DELETE RESTRICT,
  day date NOT NULL, amount integer NOT NULL CHECK (amount BETWEEN 1 AND 100),
  limit_version integer NOT NULL CHECK (limit_version>0),
  route_id uuid NOT NULL REFERENCES app_send_private.budget_routes ON DELETE RESTRICT,
  route_version integer NOT NULL CHECK (route_version>0),
  reserved_at timestamptz NOT NULL CHECK (isfinite(reserved_at)),
  CHECK (day=(reserved_at AT TIME ZONE 'UTC')::date), PRIMARY KEY (attempt_id,limit_id)
);
-- AIDEV-NOTE: Lowering a ceiling below historical usage is legal; only new reservations enforce remaining capacity.
CREATE FUNCTION app_send_private.guard_budget_route() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF ROW(NEW.id,NEW.organization_id,NEW.mailbox_id) IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.mailbox_id)
    OR NEW.version<OLD.version OR (ROW(NEW.group_name,NEW.egress_id,NEW.enabled)
      IS DISTINCT FROM ROW(OLD.group_name,OLD.egress_id,OLD.enabled) AND NEW.version<=OLD.version) THEN
    RAISE EXCEPTION 'budget route identity/version violation' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION app_send_private.guard_budget_limit() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF ROW(NEW.id,NEW.kind,NEW.scope) IS DISTINCT FROM ROW(OLD.id,OLD.kind,OLD.scope)
    OR NEW.version<OLD.version OR (ROW(NEW.ceiling,NEW.enabled) IS DISTINCT FROM ROW(OLD.ceiling,OLD.enabled)
      AND NEW.version<=OLD.version) THEN
    RAISE EXCEPTION 'budget limit identity/version violation' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER budget_route_version BEFORE UPDATE ON app_send_private.budget_routes
  FOR EACH ROW EXECUTE FUNCTION app_send_private.guard_budget_route();
CREATE TRIGGER budget_limit_version BEFORE UPDATE ON app_send_private.budget_limits
  FOR EACH ROW EXECUTE FUNCTION app_send_private.guard_budget_limit();
CREATE TRIGGER attempt_budget_immutable BEFORE UPDATE OR DELETE ON app_send_private.attempt_budgets
  FOR EACH ROW EXECUTE FUNCTION app_send_private.reject_mutation();
DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['budget_routes','budget_limits','budget_usage','attempt_budgets'] LOOP
    EXECUTE format('ALTER TABLE app_send_private.%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('ALTER TABLE app_send_private.%I FORCE ROW LEVEL SECURITY',name);
    EXECUTE format('CREATE POLICY send_owner ON app_send_private.%I TO elevateo_send_owner USING(true) WITH CHECK(true)',name);
    EXECUTE format('REVOKE ALL ON app_send_private.%I FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read',name);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION app_send_private.valid_budget_scope(text,jsonb),app_send_private.guard_budget_route(),
  app_send_private.guard_budget_limit() FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
