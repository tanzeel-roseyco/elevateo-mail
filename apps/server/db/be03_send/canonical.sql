-- AIDEV-NOTE: Compare exact compact bytes independently; JSONB equality alone would admit changed byte spelling.
CREATE FUNCTION app_send_private.compact_json(p_value jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE result text; element jsonb;
BEGIN
  IF jsonb_typeof(p_value) <> 'array' THEN RETURN p_value::text; END IF;
  result := '[';
  FOR element IN SELECT value FROM jsonb_array_elements(p_value) LOOP
    IF result <> '[' THEN result := result || ','; END IF;
    result := result || app_send_private.compact_json(element);
  END LOOP;
  RETURN result || ']';
END $$;
CREATE FUNCTION app_send_private.canonical_address(p_address text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE local_part text; domain_part text; label text;
BEGIN
  IF p_address IS NULL OR octet_length(p_address) NOT BETWEEN 3 AND 254 OR
    length(p_address) - length(replace(p_address,'@','')) <> 1 THEN RETURN NULL; END IF;
  local_part := split_part(p_address,'@',1); domain_part := split_part(p_address,'@',2);
  IF octet_length(local_part) NOT BETWEEN 1 AND 64 OR local_part ~ '(^\.|\.$|\.\.)' OR
    local_part ~ $rx$[^A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]$rx$ OR domain_part NOT LIKE '%.%' THEN RETURN NULL; END IF;
  FOREACH label IN ARRAY string_to_array(domain_part,'.') LOOP
    IF octet_length(label) NOT BETWEEN 1 AND 63 OR label !~ '^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$' THEN
      RETURN NULL;
    END IF;
  END LOOP;
  RETURN local_part || '@' || lower(domain_part COLLATE "C");
END $$;
CREATE FUNCTION app_send_private.snapshot_validation(p_binding jsonb,p_bytes bytea,p_digest text) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE recipients jsonb := '[]'; item jsonb; address text; seen text[] := '{}'; expected jsonb;
BEGIN
  IF p_binding->>'policy_revision' IS NULL OR NOT (p_binding->>'mailbox_enabled')::boolean OR
    NOT (p_binding->>'reply_available')::boolean OR app_send_private.canonical_address(p_binding->>'sender_address') IS NULL OR
    (p_binding->>'subject') COLLATE "C" ~ '[[:cntrl:]]' OR jsonb_array_length(p_binding->'recipients') NOT BETWEEN 1 AND 100 THEN
    RETURN 'send_not_ready';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_binding->'recipients') LOOP
    address := app_send_private.canonical_address(item->>'address');
    IF address IS NULL OR address = ANY(seen) OR (item->>'display_name') COLLATE "C" ~ '[[:cntrl:]]'
      OR (p_binding->'suppressed_addresses') ? address THEN RETURN 'send_not_ready'; END IF;
    seen := array_append(seen,address);
    recipients := recipients || jsonb_build_array(jsonb_build_array(item->'display_name',address));
  END LOOP;
  expected := jsonb_build_array('elevateo.send.snapshot.v1',p_binding->'organization_id',p_binding->'mailbox_id',
    p_binding->'draft_id',p_binding->'version',jsonb_build_array(NULL,app_send_private.canonical_address(p_binding->>'sender_address')),
    recipients,p_binding->'subject',p_binding->'body_text',p_binding->'reply_to_thread_id','correspondence',
    'human_correspondence_attestation','[]'::jsonb,p_binding->'policy_revision');
  IF octet_length(convert_to(app_send_private.compact_json(expected),'UTF8')) > 1048576 THEN RETURN 'send_not_ready'; END IF;
  IF p_bytes IS NULL OR octet_length(p_bytes) NOT BETWEEN 1 AND 1048576 OR
    p_bytes <> convert_to(app_send_private.compact_json(expected),'UTF8') OR
    encode(sha256(p_bytes),'hex') IS DISTINCT FROM p_digest THEN RETURN 'review_stale'; END IF;
  RETURN NULL;
END $$;
