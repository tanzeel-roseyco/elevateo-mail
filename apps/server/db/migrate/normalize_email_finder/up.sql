SET LOCAL ROLE elevateo_owner;
-- AIDEV-NOTE: Transactional owner backfill bypasses tenant filtering, restored before commit; no rows are discarded.
ALTER TABLE app.email_finder_jobs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.email_finder_people NO FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.email_finder_jobs WHERE jsonb_typeof(items) IS DISTINCT FROM 'array') THEN
    RAISE EXCEPTION 'Finder normalization requires array job items';
  END IF;
  IF EXISTS (SELECT 1 FROM app.email_finder_jobs j WHERE jsonb_array_length(items)<>total
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(items) WITH ORDINALITY i(value,n)
      WHERE jsonb_typeof(value) IS DISTINCT FROM 'object' OR value->>'row' IS DISTINCT FROM n::text
        OR jsonb_typeof(value->'input') IS DISTINCT FROM 'object'
        OR (value - ARRAY['row','input','work','result'])<>'{}'::jsonb
        OR (value ? 'work' AND jsonb_typeof(value->'work') IS DISTINCT FROM 'object')
        OR (value ? 'result' AND jsonb_typeof(value->'result') IS DISTINCT FROM 'object')
        OR (value ? 'result') IS DISTINCT FROM (n<=j.completed))) THEN
    RAISE EXCEPTION 'Finder normalization requires contiguous rows and consistent progress; repair source data first';
  END IF;
  IF EXISTS (SELECT 1 FROM app.email_finder_people WHERE domain IS DISTINCT FROM split_part(email,'@',2)) THEN
    RAISE EXCEPTION 'Finder person domain disagrees with email; repair source data first';
  END IF;
END $$;

CREATE TABLE app.email_finder_job_items (
  organization_id uuid NOT NULL,
  job_id uuid NOT NULL,
  row_number smallint NOT NULL CHECK(row_number BETWEEN 1 AND 5000),
  input jsonb NOT NULL CHECK(jsonb_typeof(input)='object'),
  work jsonb CHECK(jsonb_typeof(work)='object'),
  result jsonb CHECK(jsonb_typeof(result)='object'),
  PRIMARY KEY(job_id,row_number),
  FOREIGN KEY(organization_id,job_id) REFERENCES app.email_finder_jobs(organization_id,id) ON DELETE CASCADE,
  CHECK(work IS NULL OR result IS NULL)
);
CREATE INDEX email_finder_items_organization_job ON app.email_finder_job_items(organization_id,job_id);
INSERT INTO app.email_finder_job_items(organization_id,job_id,row_number,input,work,result)
SELECT j.organization_id,j.id,i.n,i.value->'input',i.value->'work',i.value->'result'
FROM app.email_finder_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.items) WITH ORDINALITY i(value,n);
ALTER TABLE app.email_finder_jobs DROP COLUMN items;
ALTER TABLE app.email_finder_people DROP COLUMN domain;

-- AIDEV-NOTE: Domain is derived at read time; canonical email keeps the expression index and lookup identical.
ALTER TABLE app.email_finder_people ADD CONSTRAINT finder_people_email CHECK(
  octet_length(email) BETWEEN 3 AND 254 AND email=lower(btrim(email))
  AND email ~ '^[a-z0-9][a-z0-9.!#$%&''*+/=?^_`{|}~-]{0,63}@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  AND split_part(email,'@',1) NOT LIKE '%..%' AND split_part(email,'@',1) NOT LIKE '%.') NOT VALID;
ALTER TABLE app.email_finder_people ADD CONSTRAINT finder_people_name CHECK(
  octet_length(name) BETWEEN 1 AND 200 AND name=btrim(name) AND name !~ '[[:cntrl:]]') NOT VALID;
-- AIDEV-NOTE: Pattern names mirror Core::PATTERNS; the bounded set is evidence, not independently mutable entities.
ALTER TABLE app.email_finder_people ADD CONSTRAINT finder_people_patterns CHECK(jsonb_typeof(patterns)='array'
  AND patterns <@ '["first.last","firstlast","flast","f.last","first","firstl","last.first","last","first_last","first-last"]'::jsonb
  AND jsonb_array_length(patterns)<=10) NOT VALID;
ALTER TABLE app.email_finder_domains ADD CONSTRAINT finder_domain_name CHECK(
  octet_length(domain) BETWEEN 3 AND 253 AND domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$') NOT VALID;
ALTER TABLE app.email_finder_domains ADD CONSTRAINT finder_domain_data CHECK(jsonb_typeof(data)='object') NOT VALID;
ALTER TABLE app.email_finder_results ADD CONSTRAINT finder_result_shape CHECK(
  cache_key ~ '^[0-9a-f]{64}$' AND jsonb_typeof(input)='object' AND jsonb_typeof(result)='object') NOT VALID;
ALTER TABLE app.email_finder_rate_state ADD CONSTRAINT finder_rate_shape CHECK(
  octet_length(key) BETWEEN 1 AND 258 AND key=btrim(key) AND key !~ '[[:cntrl:]]'
  AND jsonb_typeof(value)='object') NOT VALID;
ALTER TABLE app.email_finder_people VALIDATE CONSTRAINT finder_people_email;
ALTER TABLE app.email_finder_people VALIDATE CONSTRAINT finder_people_name;
ALTER TABLE app.email_finder_people VALIDATE CONSTRAINT finder_people_patterns;
ALTER TABLE app.email_finder_domains VALIDATE CONSTRAINT finder_domain_name;
ALTER TABLE app.email_finder_domains VALIDATE CONSTRAINT finder_domain_data;
ALTER TABLE app.email_finder_results VALIDATE CONSTRAINT finder_result_shape;
ALTER TABLE app.email_finder_rate_state VALIDATE CONSTRAINT finder_rate_shape;

ALTER TABLE app.email_finder_job_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.email_finder_job_items FORCE ROW LEVEL SECURITY;
CREATE POLICY worker ON app.email_finder_job_items TO elevateo_worker USING(true) WITH CHECK(true);
CREATE POLICY tenant_read ON app.email_finder_job_items FOR SELECT TO elevateo_app_read USING(
  EXISTS (SELECT 1 FROM app.email_finder_jobs j WHERE j.id=job_id AND j.organization_id=email_finder_job_items.organization_id));
CREATE POLICY tenant_insert ON app.email_finder_job_items FOR INSERT TO elevateo_api WITH CHECK(
  organization_id=app.context_uuid('app.org_id') AND
  (app.authorize_outreach_draft_write(NULLIF(current_setting('app.outreach_digest',true),''))->>'status')='ok'
  AND EXISTS (SELECT 1 FROM app.email_finder_jobs j WHERE j.id=job_id AND j.user_id=app.context_uuid('app.user_id')
    AND j.organization_id=email_finder_job_items.organization_id));
REVOKE ALL ON app.email_finder_job_items FROM PUBLIC;
GRANT SELECT ON app.email_finder_job_items TO elevateo_app_read;
GRANT INSERT ON app.email_finder_job_items TO elevateo_api;
GRANT SELECT,INSERT,UPDATE,DELETE ON app.email_finder_job_items TO elevateo_worker;
ALTER TABLE app.email_finder_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE app.email_finder_people FORCE ROW LEVEL SECURITY;

-- AIDEV-NOTE: Cached progress avoids hot-path aggregates; deferred checks prove it matches children at commit.
CREATE FUNCTION app.email_finder_progress_consistent() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE ids uuid[]; target uuid; expected_total integer; expected_completed integer;
  actual_total integer; actual_completed integer; invalid_rows integer;
BEGIN
  -- AIDEV-NOTE: Advisory waits require fresh snapshots, matching the existing protected-write transaction guard.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'finder writes require read committed' USING ERRCODE='25001';
  END IF;
  IF TG_TABLE_NAME='email_finder_jobs' THEN
    IF TG_OP='UPDATE' AND NEW.total=OLD.total AND NEW.completed=OLD.completed THEN RETURN NULL; END IF;
    ids:=ARRAY[NEW.id];
  ELSE
    IF TG_OP='UPDATE' AND NEW.organization_id=OLD.organization_id AND NEW.job_id=OLD.job_id
      AND NEW.row_number=OLD.row_number AND NEW.result IS NOT DISTINCT FROM OLD.result THEN
      RETURN NULL;
    END IF;
    IF TG_OP='INSERT' THEN ids:=ARRAY[NEW.job_id];
    ELSIF TG_OP='DELETE' THEN ids:=ARRAY[OLD.job_id];
    ELSE ids:=ARRAY[OLD.job_id,NEW.job_id]; END IF;
  END IF;
  FOREACH target IN ARRAY ids LOOP
    -- AIDEV-NOTE: API has no UPDATE grant; an advisory lock serializes counts without granting parent mutation.
    PERFORM pg_advisory_xact_lock(hashtextextended('finder-progress:'||target::text,0));
    SELECT total,completed INTO expected_total,expected_completed FROM app.email_finder_jobs WHERE id=target;
    CONTINUE WHEN NOT FOUND;
    SELECT count(*),count(result),count(*) FILTER(WHERE row_number>expected_total
      OR (result IS NOT NULL) IS DISTINCT FROM (row_number<=expected_completed))
      INTO actual_total,actual_completed,invalid_rows FROM app.email_finder_job_items WHERE job_id=target;
    IF actual_total<>expected_total OR actual_completed<>expected_completed OR invalid_rows<>0 THEN
      RAISE EXCEPTION 'Finder progress must match contiguous child rows' USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.email_finder_progress_consistent() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER finder_job_progress AFTER INSERT OR UPDATE ON app.email_finder_jobs
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.email_finder_progress_consistent();
CREATE CONSTRAINT TRIGGER finder_item_progress AFTER INSERT OR UPDATE OR DELETE ON app.email_finder_job_items
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.email_finder_progress_consistent();
