-- AIDEV-NOTE: Immutable bindings survive rollback/retry; only jobs have a monotonic mutable projection.
CREATE FUNCTION app_send_private.reject_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'send history is immutable' USING ERRCODE = '55000'; END $$;
DO $$ DECLARE relation text; BEGIN
  FOREACH relation IN ARRAY ARRAY['intents','approval_operations','attempts','observations','audit_events'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_send_history BEFORE UPDATE OR DELETE ON app_send_private.%I
      FOR EACH ROW EXECUTE FUNCTION app_send_private.reject_mutation()',relation);
  END LOOP;
END $$;
CREATE FUNCTION app_send_private.monotonic_job() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.send_id <> OLD.send_id OR NEW.lease_generation < OLD.lease_generation OR NEW.attempt_count < OLD.attempt_count
    OR (OLD.first_possible_at IS NOT NULL AND NEW.first_possible_at IS DISTINCT FROM OLD.first_possible_at)
    OR (OLD.retry_deadline_at IS NOT NULL AND (NEW.retry_deadline_at IS NULL OR NEW.retry_deadline_at > OLD.retry_deadline_at))
    OR (OLD.state = 'accepted' AND (NEW.state <> 'accepted' OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
      OR NEW.accepted_receipt_ref IS DISTINCT FROM OLD.accepted_receipt_ref))
    OR (OLD.state <> 'queued' AND NEW.state = 'queued')
    OR (OLD.cancel_requested_at IS NOT NULL AND NEW.cancel_requested_at IS DISTINCT FROM OLD.cancel_requested_at)
    OR NEW.policy_profile <> OLD.policy_profile THEN
    RAISE EXCEPTION 'send job monotonicity violation' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER monotonic_send_job BEFORE UPDATE ON app_send_private.jobs
  FOR EACH ROW EXECUTE FUNCTION app_send_private.monotonic_job();
CREATE FUNCTION app_send_private.assert_complete_intent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE intent app_send_private.intents; job app_send_private.jobs; send uuid := COALESCE(NEW.send_id,OLD.send_id);
BEGIN
  SELECT * INTO STRICT intent FROM app_send_private.intents WHERE send_id = send;
  SELECT * INTO job FROM app_send_private.jobs WHERE send_id = send;
  IF job.send_id IS NULL OR NOT EXISTS (SELECT 1 FROM app_send_private.audit_events
      WHERE send_id = send AND event_key = 'approved' AND kind = 'approved')
    OR NOT app_send_private.consumed_draft_matches(intent.organization_id,intent.mailbox_id,intent.draft_id,
      intent.approved_by,intent.draft_version)
    OR NOT EXISTS (SELECT 1 FROM app_send_private.approval_operations WHERE send_id = send AND outcome = 'approved')
    OR job.attempt_count <> (SELECT count(*) FROM app_send_private.attempts WHERE send_id = send)
    OR job.attempt_count <> COALESCE((SELECT max(attempt_no) FROM app_send_private.attempts WHERE send_id = send),0) THEN
    RAISE EXCEPTION 'incomplete send intent' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER complete_send_intent AFTER INSERT ON app_send_private.intents
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_send_private.assert_complete_intent();
CREATE CONSTRAINT TRIGGER complete_send_job AFTER INSERT OR UPDATE OR DELETE ON app_send_private.jobs
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_send_private.assert_complete_intent();
CREATE CONSTRAINT TRIGGER complete_send_attempt AFTER INSERT ON app_send_private.attempts
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_send_private.assert_complete_intent();
