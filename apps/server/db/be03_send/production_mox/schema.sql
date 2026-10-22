-- AIDEV-NOTE: Operator-owned domain evidence defaults disabled; runtime roles cannot create activation authority.
SET LOCAL ROLE elevateo_send_owner;
CREATE TABLE app_send_private.mox_domains (
  organization_id uuid NOT NULL REFERENCES app.organizations(id),
  domain text NOT NULL CHECK(domain ~ '^[a-z0-9][a-z0-9.-]{0,251}[a-z0-9]$'),
  enabled boolean NOT NULL DEFAULT false, verified_at timestamptz, evidence_ref text,
  PRIMARY KEY(organization_id,domain),
  CHECK(NOT enabled OR (verified_at IS NOT NULL AND evidence_ref IS NOT NULL AND evidence_ref ~ '^[0-9a-f]{64}$'))
);
ALTER TABLE app_send_private.mox_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_send_private.mox_domains FORCE ROW LEVEL SECURITY;
CREATE POLICY send_owner ON app_send_private.mox_domains TO elevateo_send_owner USING(true) WITH CHECK(true);
REVOKE ALL ON app_send_private.mox_domains FROM PUBLIC,elevateo_api,elevateo_app_read,elevateo_worker;
ALTER TABLE app_send_private.smtp_accounts DROP CONSTRAINT smtp_accounts_credential_ref_check;
ALTER TABLE app_send_private.smtp_accounts ADD CONSTRAINT smtp_accounts_credential_ref_check
  CHECK(credential_ref ~ '^(test|secret):[A-Za-z0-9_.:-]{1,120}$');
ALTER TABLE app_send_private.attempts DROP CONSTRAINT attempts_smtp_credential_ref_check;
ALTER TABLE app_send_private.attempts ADD CONSTRAINT attempts_smtp_credential_ref_check
  CHECK(smtp_credential_ref ~ '^(test|secret):[A-Za-z0-9_.:-]{1,120}$');
ALTER TABLE app_send_private.attempts DROP CONSTRAINT send_attempt_smtp_binding;
ALTER TABLE app_send_private.attempts ADD CONSTRAINT send_attempt_smtp_binding CHECK (
  (profile='mox-smtp-v1' AND num_nonnulls(smtp_account_id,smtp_credential_version,smtp_credential_ref,smtp_sender)=4
    AND smtp_credential_ref LIKE 'secret:%')
  OR (profile<>'mox-smtp-v1' AND (num_nonnulls(smtp_account_id,smtp_credential_version,smtp_credential_ref,smtp_sender)=0
    OR (profile='mox-smtp-test-v1' AND num_nonnulls(smtp_account_id,smtp_credential_version,smtp_credential_ref,smtp_sender)=4
      AND smtp_credential_ref LIKE 'test:%'))));
ALTER TABLE app_send_private.attempts DROP CONSTRAINT send_attempt_profile_v4;
ALTER TABLE app_send_private.attempts ADD CONSTRAINT send_attempt_profile_v5
  CHECK(profile IN ('none','synthetic-v1','mailpit-smtp-test-v1','mox-smtp-test-v1','mox-smtp-v1','resend-v1'));
ALTER TABLE app_send_private.observations DROP CONSTRAINT send_observation_source_v4;
ALTER TABLE app_send_private.observations DROP CONSTRAINT send_observation_receipt_source_v4;
ALTER TABLE app_send_private.observations ADD CONSTRAINT send_observation_source_v5
  CHECK(source IN ('local_failure_driver','mailpit_smtp_test_v1','mox_smtp_test_v1','mox_smtp_v1','resend_v1'));
ALTER TABLE app_send_private.observations ADD CONSTRAINT send_observation_receipt_source_v5 CHECK (
  (source='local_failure_driver' AND (receipt_ref IS NULL OR receipt_ref ~ '^local:[0-9a-f]{64}$'))
  OR (source='mailpit_smtp_test_v1' AND (receipt_ref IS NULL OR receipt_ref ~ '^mailpit-test-v1:[0-9a-f]{64}$'))
  OR (source='mox_smtp_test_v1' AND (receipt_ref IS NULL OR receipt_ref ~ '^mox-test-v1:[0-9a-f]{64}$'))
  OR (source='mox_smtp_v1' AND (receipt_ref IS NULL OR receipt_ref ~ '^mox-v1:[0-9a-f]{64}$'))
  OR (source='resend_v1' AND (receipt_ref IS NULL OR receipt_ref ~ '^resend:[A-Za-z0-9_-]{1,128}$')));
CREATE FUNCTION app_send_private.mox_dispatch_allowed(i app_send_private.intents) RETURNS boolean
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
REVOKE ALL ON FUNCTION app_send_private.mox_dispatch_allowed(app_send_private.intents)
  FROM PUBLIC,elevateo_api,elevateo_app_read,elevateo_worker;
RESET ROLE;

-- AIDEV-NOTE: IMAP is a separate Bundle protocol; opening its namespace never grants SMTP authority.
RESET ROLE;
ALTER TABLE app.inbound_imap_accounts DROP CONSTRAINT inbound_imap_accounts_credential_ref_check;
ALTER TABLE app.inbound_imap_accounts ADD CONSTRAINT inbound_imap_accounts_credential_ref_check
  CHECK(credential_ref ~ '^(test|secret):[A-Za-z0-9_.:-]{1,120}$');
