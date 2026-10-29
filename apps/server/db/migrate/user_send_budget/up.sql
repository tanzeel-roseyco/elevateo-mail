-- AIDEV-NOTE: The approving user is global across tenants; immutable approval identity prevents mailbox splitting.
SET LOCAL ROLE elevateo_send_owner;
CREATE OR REPLACE FUNCTION app_send_private.valid_budget_scope(kind text, scope jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE part text; expected integer;
BEGIN
  IF kind IS NULL OR scope IS NULL OR jsonb_typeof(scope)<>'array' THEN RETURN false; END IF;
  expected := CASE kind WHEN 'organization' THEN 1 WHEN 'user' THEN 1 WHEN 'group' THEN 2 WHEN 'mailbox' THEN 2
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

ALTER FUNCTION app_send_private.budget_requirements(uuid) RENAME TO route_budget_requirements;
CREATE FUNCTION app_send_private.budget_requirements(p_send uuid)
RETURNS TABLE(kind text,scope jsonb,amount integer,route_id uuid,route_version integer)
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
DECLARE requirement record; actor uuid;
BEGIN
  SELECT approved_by INTO actor FROM app_send_private.intents WHERE send_id=p_send;
  IF actor IS NULL THEN RAISE EXCEPTION 'budget actor missing' USING ERRCODE='PZ001'; END IF;
  FOR requirement IN SELECT * FROM app_send_private.route_budget_requirements(p_send) LOOP
    kind := requirement.kind; scope := requirement.scope; amount := requirement.amount;
    route_id := requirement.route_id; route_version := requirement.route_version;
    RETURN NEXT;
    IF kind='mailbox' THEN
      kind := 'user'; scope := jsonb_build_array(actor); RETURN NEXT;
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION app_send_private.budget_requirements(uuid)
  FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
