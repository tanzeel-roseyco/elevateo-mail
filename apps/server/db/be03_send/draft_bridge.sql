-- AIDEV-NOTE: Only the send owner can read/consume a currently authorized author's existing draft.
CREATE FUNCTION app_send_private.read_draft_binding(p_mailbox uuid,p_draft uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  IF NOT app.draft_scope(p_mailbox,p_draft) OR NOT EXISTS (SELECT 1 FROM app.mailbox_memberships
      WHERE organization_id = app.context_uuid('app.org_id') AND mailbox_id = p_mailbox
      AND user_id = app.context_uuid('app.user_id') AND compose AND approve_send) THEN
    RETURN '{"code":"not_available"}'::jsonb;
  END IF;
  SELECT jsonb_build_object('organization_id',d.organization_id,'mailbox_id',d.mailbox_id,'draft_id',d.id,
      'actor_id',d.actor_id,'version',d.version,'state',d.state,'subject',d.subject,'recipients',d.recipients,
      'body_text',d.body_text,'reply_to_thread_id',d.reply_to_thread_id,'sender_address',m.address,
      'reply_available',d.reply_to_thread_id IS NULL OR EXISTS (SELECT 1 FROM app.threads t
        WHERE t.organization_id = d.organization_id AND t.mailbox_id = d.mailbox_id AND t.id = d.reply_to_thread_id))
    INTO result FROM app.drafts d JOIN app.mailboxes m ON m.organization_id = d.organization_id AND m.id = d.mailbox_id
    WHERE d.id = p_draft AND d.mailbox_id = p_mailbox AND d.organization_id = app.context_uuid('app.org_id')
      AND d.actor_id = app.context_uuid('app.user_id');
  RETURN COALESCE(result,'{"code":"not_available"}'::jsonb);
END $$;
CREATE FUNCTION app_send_private.lock_draft_binding(p_digest text,p_mailbox uuid,p_draft uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE guard jsonb;
BEGIN
  guard := app_auth.assert_protected_write(p_digest,app.context_uuid('app.user_id'));
  IF guard->>'status' <> 'ok' THEN RETURN jsonb_build_object('code',CASE guard->>'status'
    WHEN 'unauthorized' THEN 'unauthenticated' WHEN 'not_found' THEN 'not_available'
    WHEN 'context_changed' THEN 'context_changed' ELSE 'temporarily_unavailable' END); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('draft-id:' || p_draft,0));
  PERFORM 1 FROM app.drafts WHERE id = p_draft FOR UPDATE;
  RETURN app_send_private.read_draft_binding(p_mailbox,p_draft);
END $$;
CREATE FUNCTION app_send_private.consume_draft(p_digest text,p_mailbox uuid,p_draft uuid,p_expected integer) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE binding jsonb;
BEGIN
  binding := app_send_private.lock_draft_binding(p_digest,p_mailbox,p_draft);
  IF binding ? 'code' OR binding->>'state' <> 'editable' OR (binding->>'version')::integer <> p_expected THEN
    RAISE EXCEPTION 'draft consumption binding failed' USING ERRCODE = '40001';
  END IF;
  UPDATE app.drafts SET state = 'consumed',updated_at = clock_timestamp() WHERE id = p_draft;
END $$;
-- AIDEV-NOTE: Durable send identity cannot be invalidated by editing a consumed draft through privileged code.
CREATE FUNCTION app_send_private.preserve_consumed_draft() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.state = 'consumed' AND (NEW.state,NEW.organization_id,NEW.mailbox_id,NEW.actor_id,NEW.version,
      NEW.subject,NEW.recipients,NEW.body_text) IS DISTINCT FROM
      (OLD.state,OLD.organization_id,OLD.mailbox_id,OLD.actor_id,OLD.version,
      OLD.subject,OLD.recipients,OLD.body_text) OR
    (OLD.state = 'consumed' AND NEW.reply_to_thread_id IS DISTINCT FROM OLD.reply_to_thread_id
      AND NOT (OLD.reply_to_thread_id IS NOT NULL AND NEW.reply_to_thread_id IS NULL)) THEN
    RAISE EXCEPTION 'consumed draft is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER preserve_consumed_draft BEFORE UPDATE ON app.drafts
  FOR EACH ROW EXECUTE FUNCTION app_send_private.preserve_consumed_draft();
REVOKE ALL ON FUNCTION app_send_private.read_draft_binding(uuid,uuid),
  app_send_private.lock_draft_binding(text,uuid,uuid),app_send_private.consume_draft(text,uuid,uuid,integer),
  app_send_private.preserve_consumed_draft() FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app_send_private.read_draft_binding(uuid,uuid),
  app_send_private.lock_draft_binding(text,uuid,uuid),app_send_private.consume_draft(text,uuid,uuid,integer)
  TO elevateo_send_owner;
-- AIDEV-NOTE: Status needs compose, while review/approval additionally require approve_send.
CREATE FUNCTION app_send_private.status_scope(p_mailbox uuid,p_draft uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT app.draft_scope(p_mailbox,p_draft) AND EXISTS (SELECT 1 FROM app.drafts WHERE id = p_draft
    AND organization_id = app.context_uuid('app.org_id') AND mailbox_id = p_mailbox AND actor_id = app.context_uuid('app.user_id'))
$$;
REVOKE ALL ON FUNCTION app_send_private.status_scope(uuid,uuid) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app_send_private.status_scope(uuid,uuid) TO elevateo_send_owner;
-- AIDEV-NOTE: Deferred integrity checks expose one boolean, allowing worker projections without general draft reads.
CREATE FUNCTION app_send_private.consumed_draft_matches(p_org uuid,p_mailbox uuid,p_draft uuid,p_actor uuid,p_version integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM app.drafts WHERE organization_id = p_org AND mailbox_id = p_mailbox AND id = p_draft
    AND actor_id = p_actor AND version = p_version AND state = 'consumed')
$$;
REVOKE ALL ON FUNCTION app_send_private.consumed_draft_matches(uuid,uuid,uuid,uuid,integer)
  FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app_send_private.consumed_draft_matches(uuid,uuid,uuid,uuid,integer) TO elevateo_send_owner;
