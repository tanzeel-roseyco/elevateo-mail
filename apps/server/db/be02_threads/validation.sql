-- AIDEV-NOTE: Stored address objects match the canonical plaintext shape; JSON null differs from SQL NULL.
CREATE FUNCTION app.thread_address_valid(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
  SELECT CASE WHEN jsonb_typeof(value) = 'object' THEN
    value ?& ARRAY['display_name', 'address'] AND
    value - ARRAY['display_name', 'address'] = '{}'::jsonb AND
    (jsonb_typeof(value->'display_name') = 'null' OR
      (jsonb_typeof(value->'display_name') = 'string' AND char_length(value->>'display_name') <= 256)) AND
    (jsonb_typeof(value->'address') = 'null' OR
      (jsonb_typeof(value->'address') = 'string' AND char_length(value->>'address') <= 256))
  ELSE false END
$$;

CREATE FUNCTION app.thread_recipients_valid(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
  SELECT CASE WHEN jsonb_typeof(value) = 'array' THEN
    jsonb_array_length(value) <= 100 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(value) AS recipients(recipient)
      WHERE NOT app.thread_address_valid(recipient)
    )
  ELSE false END
$$;

REVOKE ALL ON FUNCTION app.thread_address_valid(jsonb), app.thread_recipients_valid(jsonb) FROM PUBLIC;
