-- AIDEV-NOTE: All axes derive from immutable approval bytes and private routing, never worker-supplied scope keys.
CREATE FUNCTION app_send_private.budget_requirements(p_send uuid)
RETURNS TABLE(kind text,scope jsonb,amount integer,route_id uuid,route_version integer)
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
DECLARE i app_send_private.intents; route app_send_private.budget_routes; snap jsonb;
  recipients jsonb; recipient jsonb; sender text; address text; addresses text[] := ARRAY[]::text[]; total integer;
BEGIN
  SELECT * INTO i FROM app_send_private.intents WHERE send_id=p_send;
  SELECT * INTO route FROM app_send_private.budget_routes
    WHERE organization_id=i.organization_id AND mailbox_id=i.mailbox_id FOR SHARE;
  IF route.id IS NULL OR NOT route.enabled THEN RAISE EXCEPTION 'budget configuration held' USING ERRCODE='PZ001'; END IF;
  snap := convert_from(i.snapshot_bytes,'UTF8')::jsonb;
  IF jsonb_typeof(snap) IS DISTINCT FROM 'array' OR jsonb_array_length(snap)<>14 THEN
    RAISE EXCEPTION 'budget snapshot invalid' USING ERRCODE='PZ001';
  END IF;
  recipients := snap->6; sender := snap->5->>1;
  IF jsonb_typeof(recipients) IS DISTINCT FROM 'array' OR sender IS NULL
    OR app_send_private.canonical_address(sender) IS DISTINCT FROM sender THEN
    RAISE EXCEPTION 'budget envelope invalid' USING ERRCODE='PZ001';
  END IF;
  total := jsonb_array_length(recipients);
  IF total NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'budget recipients invalid' USING ERRCODE='PZ001'; END IF;
  FOR recipient IN SELECT value FROM jsonb_array_elements(recipients) LOOP
    IF jsonb_typeof(recipient) IS DISTINCT FROM 'array' OR jsonb_array_length(recipient)<>2
      OR jsonb_typeof(recipient->1) IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'budget recipient invalid' USING ERRCODE='PZ001';
    END IF;
    address := recipient->>1;
    IF app_send_private.canonical_address(address) IS DISTINCT FROM address OR address=ANY(addresses) THEN
      RAISE EXCEPTION 'budget address invalid' USING ERRCODE='PZ001';
    END IF;
    addresses := array_append(addresses,address);
  END LOOP;
  route_id := route.id; route_version := route.version; amount := total;
  kind := 'organization'; scope := jsonb_build_array(i.organization_id); RETURN NEXT;
  kind := 'group'; scope := jsonb_build_array(i.organization_id,route.group_name); RETURN NEXT;
  kind := 'mailbox'; scope := jsonb_build_array(i.organization_id,i.mailbox_id); RETURN NEXT;
  kind := 'sender_domain'; scope := jsonb_build_array(split_part(sender,'@',2)); RETURN NEXT;
  kind := 'egress'; scope := jsonb_build_array(route.egress_id); RETURN NEXT;
  -- AIDEV-NOTE: Sender, destination and egress scopes are global, preventing tenant splitting from bypassing a pool cap.
  RETURN QUERY SELECT 'destination_domain'::text,jsonb_build_array(split_part(a,'@',2)),count(*)::integer,route.id,route.version
    FROM unnest(addresses) a GROUP BY split_part(a,'@',2);
END $$;
REVOKE ALL ON FUNCTION app_send_private.budget_requirements(uuid) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
