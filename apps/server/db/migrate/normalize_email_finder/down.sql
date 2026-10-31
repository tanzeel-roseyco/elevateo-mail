SET LOCAL ROLE elevateo_owner;
DROP TRIGGER finder_job_progress ON app.email_finder_jobs;
DROP TRIGGER finder_item_progress ON app.email_finder_job_items;
DROP FUNCTION app.email_finder_progress_consistent();
-- AIDEV-NOTE: Rebuild legacy documents in row order, retaining partially completed probe work on rollback.
ALTER TABLE app.email_finder_jobs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.email_finder_job_items NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.email_finder_people NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.email_finder_jobs ADD COLUMN items jsonb;
UPDATE app.email_finder_jobs j SET items=(
  SELECT COALESCE(jsonb_agg(jsonb_build_object('row',i.row_number,'input',i.input)
    || CASE WHEN i.work IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('work',i.work) END
    || CASE WHEN i.result IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('result',i.result) END
    ORDER BY i.row_number),'[]'::jsonb) FROM app.email_finder_job_items i WHERE i.job_id=j.id);
ALTER TABLE app.email_finder_jobs ALTER COLUMN items SET NOT NULL;
ALTER TABLE app.email_finder_people ADD COLUMN domain text;
UPDATE app.email_finder_people SET domain=split_part(email,'@',2);
ALTER TABLE app.email_finder_people ALTER COLUMN domain SET NOT NULL;
DROP TABLE app.email_finder_job_items;
ALTER TABLE app.email_finder_people DROP CONSTRAINT finder_people_email, DROP CONSTRAINT finder_people_name,
  DROP CONSTRAINT finder_people_patterns;
ALTER TABLE app.email_finder_domains DROP CONSTRAINT finder_domain_name, DROP CONSTRAINT finder_domain_data;
ALTER TABLE app.email_finder_results DROP CONSTRAINT finder_result_shape;
ALTER TABLE app.email_finder_rate_state DROP CONSTRAINT finder_rate_shape;
ALTER TABLE app.email_finder_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE app.email_finder_people FORCE ROW LEVEL SECURITY;
