-- AIDEV-NOTE: Serialize rollback with discovery, preserve used rotation state, and restore the original advisory lookup.
SET LOCAL ROLE elevateo_send_owner;
LOCK TABLE app_send_private.scheduler_cursor,app_send_private.mailbox_schedule IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM app_send_private.mailbox_schedule) THEN
    RAISE EXCEPTION 'mailbox rotation rollback requires empty scheduling state' USING ERRCODE='55000';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION app_send_private.next_due_send(p_epoch uuid,p_excluded uuid[]) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result uuid;
BEGIN
  IF p_excluded IS NULL OR cardinality(p_excluded) > 32 OR array_position(p_excluded,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid due lookup exclusions' USING ERRCODE='22023';
  END IF;
  IF p_epoch IS NULL THEN RETURN NULL; END IF;
  SELECT j.send_id INTO result FROM app_send_private.jobs j
    JOIN app_send_private.intents i ON i.send_id=j.send_id
    WHERE i.approval_epoch=p_epoch AND i.simulated AND j.send_id <> ALL(p_excluded)
      AND j.next_check_at <= clock_timestamp() AND j.next_action IN ('submit','reconcile')
      AND j.state NOT IN ('accepted','rejected','cancelled','needs_review')
      AND (j.cancel_requested_at IS NULL OR j.next_action='reconcile')
      AND (j.lease_id IS NULL OR j.lease_expires_at <= clock_timestamp())
    ORDER BY j.next_check_at,j.send_id LIMIT 1;
  RETURN result;
END $$;
DROP INDEX app_send_private.send_intents_epoch_mailbox;
DROP TABLE app_send_private.mailbox_schedule,app_send_private.scheduler_cursor;
SET LOCAL ROLE elevateo_owner;
