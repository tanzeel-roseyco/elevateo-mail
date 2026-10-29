-- AIDEV-NOTE: Migration refuses rollback once V3 history exists, so restoring V1 authority cannot strand replies.
DROP FUNCTION app_send_private.snapshot_validation(jsonb,bytea,text);
ALTER FUNCTION app_send_private.snapshot_validation_without_rfc(jsonb,bytea,text) RENAME TO snapshot_validation;
CREATE OR REPLACE FUNCTION app_send_private.mox_dispatch_allowed(i app_send_private.intents) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
DECLARE snap jsonb := convert_from(i.snapshot_bytes,'UTF8')::jsonb; enabled boolean;
BEGIN
  IF jsonb_array_length(snap)<>14 OR snap->>0<>'elevateo.send.snapshot.v1' OR jsonb_array_length(snap->12)<>0 THEN RETURN false; END IF;
  SELECT d.enabled INTO enabled FROM app_send_private.mox_domains d
    WHERE d.organization_id=i.organization_id AND d.domain=split_part(snap->5->>1,'@',2) FOR SHARE;
  RETURN COALESCE(enabled,false) AND EXISTS (SELECT 1 FROM app_send_private.smtp_accounts a
    WHERE a.organization_id=i.organization_id AND a.mailbox_id=i.mailbox_id AND a.active
      AND a.sender=snap->5->>1 AND a.credential_ref LIKE 'secret:%');
END $$;
ALTER TABLE app_send_private.intents DROP CONSTRAINT intents_snapshot_format_check;
ALTER TABLE app_send_private.intents ADD CONSTRAINT intents_snapshot_format_check
  CHECK(snapshot_format IN ('elevateo.send.snapshot.v1','elevateo.send.snapshot.v2'));
