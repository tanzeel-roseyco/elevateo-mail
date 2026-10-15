-- AIDEV-NOTE: Caller owns job lock and an exception subtransaction spanning attempt, all reservations and job transition.
CREATE FUNCTION app_send_private.reserve_budget(p_send uuid,p_attempt uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
DECLARE required jsonb; ids uuid[]; locked integer; charged integer; n timestamptz; d date; item record;
BEGIN
  SELECT jsonb_agg(to_jsonb(r)) INTO required FROM app_send_private.budget_requirements(p_send) r;
  SELECT array_agg(l.id ORDER BY l.id) INTO ids
    FROM jsonb_to_recordset(required) r(kind text,scope jsonb) JOIN app_send_private.budget_limits l USING(kind,scope);
  IF COALESCE(cardinality(ids),0)<>jsonb_array_length(required) THEN
    RAISE EXCEPTION 'budget limit missing' USING ERRCODE='PZ001';
  END IF;
  -- AIDEV-NOTE: Acquire every limit in UUID order before changing counters; capture UTC day after all lock waits.
  PERFORM 1 FROM app_send_private.budget_limits WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS locked=ROW_COUNT;
  IF locked<>cardinality(ids) THEN RAISE EXCEPTION 'budget configuration changed' USING ERRCODE='PZ001'; END IF;
  n := clock_timestamp(); d := (n AT TIME ZONE 'UTC')::date;
  FOR item IN SELECT l.*,r.amount,r.route_id,r.route_version FROM jsonb_to_recordset(required)
      r(kind text,scope jsonb,amount integer,route_id uuid,route_version integer)
      JOIN app_send_private.budget_limits l USING(kind,scope) ORDER BY l.id LOOP
    IF NOT item.enabled THEN RAISE EXCEPTION 'budget disabled' USING ERRCODE='PZ001'; END IF;
    IF item.amount>item.ceiling THEN RAISE EXCEPTION 'budget exhausted' USING ERRCODE='PZ002'; END IF;
    INSERT INTO app_send_private.budget_usage(limit_id,day,used) VALUES(item.id,d,item.amount)
      ON CONFLICT(limit_id,day) DO UPDATE SET used=app_send_private.budget_usage.used+item.amount
      WHERE app_send_private.budget_usage.used<=item.ceiling-item.amount RETURNING used INTO charged;
    IF NOT FOUND THEN RAISE EXCEPTION 'budget exhausted' USING ERRCODE='PZ002'; END IF;
    INSERT INTO app_send_private.attempt_budgets(attempt_id,limit_id,day,amount,limit_version,route_id,route_version,reserved_at)
      VALUES(p_attempt,item.id,d,item.amount,item.version,item.route_id,item.route_version,n);
  END LOOP;
END $$;

-- AIDEV-NOTE: Final fencing validates exactly the frozen reservations; it never charges again or refunds an uncertain send.
CREATE FUNCTION app_send_private.check_budget(p_send uuid,p_attempt uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
DECLARE required jsonb; ids uuid[]; locked integer; matched integer; stored integer; times integer;
BEGIN
  SELECT jsonb_agg(to_jsonb(r)) INTO required FROM app_send_private.budget_requirements(p_send) r;
  SELECT array_agg(l.id ORDER BY l.id) INTO ids
    FROM jsonb_to_recordset(required) r(kind text,scope jsonb) JOIN app_send_private.budget_limits l USING(kind,scope);
  IF COALESCE(cardinality(ids),0)<>jsonb_array_length(required) THEN RETURN false; END IF;
  PERFORM 1 FROM app_send_private.budget_limits WHERE id=ANY(ids) ORDER BY id FOR SHARE;
  GET DIAGNOSTICS locked=ROW_COUNT;
  IF locked<>cardinality(ids) THEN RETURN false; END IF;
  SELECT count(*) INTO matched FROM jsonb_to_recordset(required)
    r(kind text,scope jsonb,amount integer,route_id uuid,route_version integer)
    JOIN app_send_private.budget_limits l USING(kind,scope)
    JOIN app_send_private.attempt_budgets b ON b.limit_id=l.id AND b.attempt_id=p_attempt
    JOIN app_send_private.attempts a ON a.attempt_id=b.attempt_id AND a.send_id=p_send
    WHERE l.enabled AND b.amount=r.amount AND b.limit_version=l.version
      AND b.route_id=r.route_id AND b.route_version=r.route_version
      AND b.reserved_at>=a.authorized_at AND b.reserved_at<a.call_deadline_at
      AND b.day=(clock_timestamp() AT TIME ZONE 'UTC')::date;
  SELECT count(*),count(DISTINCT reserved_at) INTO stored,times
    FROM app_send_private.attempt_budgets WHERE attempt_id=p_attempt;
  RETURN matched=jsonb_array_length(required) AND stored=matched AND times=1;
EXCEPTION WHEN SQLSTATE 'PZ001' THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION app_send_private.reserve_budget(uuid,uuid),app_send_private.check_budget(uuid,uuid)
  FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
