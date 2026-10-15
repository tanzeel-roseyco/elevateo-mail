-- AIDEV-NOTE: SQL owns admission/backoff; short transactions never span IMAP or private object storage I/O.
ALTER TABLE app.inbound_imap_accounts
  ADD COLUMN poll_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN poll_next_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN poll_failures integer NOT NULL DEFAULT 0 CHECK (poll_failures BETWEEN 0 AND 8),
  ADD COLUMN poll_lease_token uuid,
  ADD COLUMN poll_lease_until timestamptz,
  ADD COLUMN poll_lease_version integer,
  ADD CONSTRAINT imap_poll_lease_complete CHECK (
    (poll_lease_token IS NULL AND poll_lease_until IS NULL AND poll_lease_version IS NULL) OR
    (poll_lease_token IS NOT NULL AND poll_lease_until IS NOT NULL AND poll_lease_version IS NOT NULL AND poll_lease_version > 0));
CREATE INDEX imap_poll_due ON app.inbound_imap_accounts(poll_next_at,id) WHERE active AND poll_enabled;

CREATE FUNCTION app.invalidate_imap_poll_lease() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF ROW(OLD.active,OLD.poll_enabled,OLD.credential_version,OLD.credential_ref,OLD.organization_id,OLD.mailbox_id)
     IS DISTINCT FROM
     ROW(NEW.active,NEW.poll_enabled,NEW.credential_version,NEW.credential_ref,NEW.organization_id,NEW.mailbox_id) THEN
    NEW.poll_lease_token := NULL; NEW.poll_lease_until := NULL; NEW.poll_lease_version := NULL;
    NEW.poll_failures := 0; NEW.poll_next_at := clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.invalidate_imap_poll_lease() FROM PUBLIC,elevateo_worker,elevateo_api,elevateo_app_read;
CREATE TRIGGER imap_poll_binding_change BEFORE UPDATE ON app.inbound_imap_accounts
  FOR EACH ROW EXECUTE FUNCTION app.invalidate_imap_poll_lease();

CREATE FUNCTION app.require_imap_poll_lease(p_account uuid,p_version integer,p_lease uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE account app.inbound_imap_accounts%ROWTYPE;
BEGIN
  IF session_user <> 'elevateo_worker' THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
  SELECT * INTO account FROM app.inbound_imap_accounts WHERE id=p_account FOR UPDATE;
  IF NOT FOUND OR NOT account.active OR account.credential_version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'imap account unavailable' USING ERRCODE='42501';
  END IF;
  -- AIDEV-NOTE: Check wall time AFTER the row lock; a blocked transaction's start timestamp is unsafe here.
  IF account.poll_enabled THEN
    IF p_lease IS NULL OR account.poll_lease_token IS DISTINCT FROM p_lease OR
       account.poll_lease_version IS DISTINCT FROM p_version OR account.poll_lease_until IS NULL OR
       account.poll_lease_until <= clock_timestamp() THEN
      RAISE EXCEPTION 'imap lease unavailable' USING ERRCODE='42501';
    END IF;
    -- AIDEV-NOTE: Each bounded import renews ownership; slow external storage may expire and must fail closed.
    UPDATE app.inbound_imap_accounts SET poll_lease_until=clock_timestamp()+interval '120 seconds' WHERE id=p_account;
  ELSIF p_lease IS NOT NULL THEN
    RAISE EXCEPTION 'imap polling disabled' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION app.require_imap_poll_lease(uuid,integer,uuid)
  FROM PUBLIC,elevateo_worker,elevateo_api,elevateo_app_read;

CREATE FUNCTION app.lease_due_imap_account() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE account app.inbound_imap_accounts%ROWTYPE;
DECLARE token uuid := gen_random_uuid();
BEGIN
  IF session_user <> 'elevateo_worker' THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
  SELECT * INTO account FROM app.inbound_imap_accounts
    WHERE active AND poll_enabled AND poll_next_at <= clock_timestamp()
      AND (poll_lease_until IS NULL OR poll_lease_until <= clock_timestamp())
    ORDER BY poll_next_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE app.inbound_imap_accounts SET poll_lease_token=token,
    poll_lease_version=credential_version,poll_lease_until=clock_timestamp()+interval '120 seconds' WHERE id=account.id;
  RETURN jsonb_build_object('account_id',account.id,'credential_version',account.credential_version,'lease_token',token);
END $$;
REVOKE ALL ON FUNCTION app.lease_due_imap_account() FROM PUBLIC,elevateo_api,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app.lease_due_imap_account() TO elevateo_worker;

CREATE FUNCTION app.finish_imap_poll(p_account uuid,p_version integer,p_lease uuid,p_outcome text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE failures integer;
DECLARE delay_seconds integer;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('success','full','failure') OR p_lease IS NULL THEN
    RAISE EXCEPTION 'invalid poll outcome' USING ERRCODE='22023';
  END IF;
  PERFORM app.require_imap_poll_lease(p_account,p_version,p_lease);
  SELECT CASE WHEN p_outcome='failure' THEN LEAST(poll_failures+1,8) ELSE 0 END
    INTO failures FROM app.inbound_imap_accounts WHERE id=p_account;
  delay_seconds := CASE WHEN p_outcome='full' THEN 1 WHEN p_outcome='success' THEN 60
    ELSE LEAST(900,15*(2^failures)::integer + floor(random()*6)::integer) END;
  UPDATE app.inbound_imap_accounts SET poll_next_at=clock_timestamp()+make_interval(secs=>delay_seconds),
    poll_failures=failures,poll_lease_token=NULL,poll_lease_until=NULL,poll_lease_version=NULL WHERE id=p_account;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION app.finish_imap_poll(uuid,integer,uuid,text) FROM PUBLIC,elevateo_api,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app.finish_imap_poll(uuid,integer,uuid,text) TO elevateo_worker;
