-- AIDEV-NOTE: compare semantic app rows after down/up; heap insertion order is not evidence.
CREATE TEMP TABLE ops820_data_fingerprint(name text PRIMARY KEY, rows bigint, digest text);
DO $$
DECLARE item record; count_rows bigint; row_digest text;
BEGIN
  FOR item IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname LIKE 'app%' AND c.relkind IN ('r', 'p')
    ORDER BY n.nspname, c.relname
  LOOP
    EXECUTE format(
      'SELECT count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E''\n'' ORDER BY to_jsonb(t)::text), '''')) FROM %I.%I t',
      item.schema_name, item.table_name
    ) INTO count_rows, row_digest;
    INSERT INTO ops820_data_fingerprint VALUES
      (item.schema_name || '.' || item.table_name, count_rows, row_digest);
  END LOOP;
END $$;
COPY (SELECT name, rows, digest FROM ops820_data_fingerprint ORDER BY name) TO STDOUT WITH CSV;
