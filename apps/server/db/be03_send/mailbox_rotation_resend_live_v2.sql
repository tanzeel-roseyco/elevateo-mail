CREATE OR REPLACE FUNCTION app_send_private.next_due_send(p_epoch uuid,p_excluded uuid[]) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result uuid; selected_org uuid; selected_box uuid; current_turn bigint; n timestamptz;
BEGIN
  IF p_excluded IS NULL OR cardinality(p_excluded)>32 OR array_position(p_excluded,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid due lookup exclusions' USING ERRCODE='22023';
  END IF;
  IF p_epoch IS NULL THEN RETURN NULL; END IF;
  -- AIDEV-NOTE: Autocommit discovery holds only this cursor lock; no job lock or network call belongs here.
  SELECT turn INTO STRICT current_turn FROM app_send_private.scheduler_cursor WHERE singleton FOR UPDATE;
  n := clock_timestamp();
  -- AIDEV-NOTE: Persist newcomers at the current turn so continuous arrival cannot jump ahead of waiting mailboxes.
  INSERT INTO app_send_private.mailbox_schedule(organization_id,mailbox_id,last_turn)
    SELECT p.organization_id,p.mailbox_id,current_turn FROM app_send_private.mailbox_policy p
    WHERE NOT EXISTS (SELECT 1 FROM app_send_private.mailbox_schedule s
      WHERE s.organization_id=p.organization_id AND s.mailbox_id=p.mailbox_id)
      AND EXISTS (SELECT 1 FROM app_send_private.intents i WHERE i.organization_id=p.organization_id
        AND i.mailbox_id=p.mailbox_id AND i.approval_epoch=p_epoch)
    ON CONFLICT DO NOTHING;
  SELECT due.send_id,s.organization_id,s.mailbox_id INTO result,selected_org,selected_box
    FROM app_send_private.mailbox_schedule s CROSS JOIN LATERAL (
      SELECT j.send_id,j.next_check_at FROM app_send_private.intents i JOIN app_send_private.jobs j USING(send_id)
      WHERE i.organization_id=s.organization_id AND i.mailbox_id=s.mailbox_id AND i.approval_epoch=p_epoch
        AND j.send_id<>ALL(p_excluded) AND j.next_check_at<=n
        AND j.next_action IN ('submit','reconcile') AND j.state NOT IN ('accepted','rejected','cancelled','needs_review')
        AND (j.cancel_requested_at IS NULL OR j.next_action='reconcile')
        AND (j.lease_id IS NULL OR j.lease_expires_at<=n)
      ORDER BY j.next_check_at,j.send_id LIMIT 1
    ) due ORDER BY s.last_turn,due.next_check_at,s.organization_id,s.mailbox_id,due.send_id LIMIT 1;
  IF result IS NOT NULL THEN
    UPDATE app_send_private.scheduler_cursor SET turn=turn+1 WHERE singleton RETURNING turn INTO current_turn;
    UPDATE app_send_private.mailbox_schedule SET last_turn=current_turn
      WHERE organization_id=selected_org AND mailbox_id=selected_box;
  END IF;
  RETURN result;
END $$;
SET LOCAL ROLE elevateo_owner;

