-- AIDEV-NOTE: Owner-only preflight is transactional; locks prevent concurrent normalization collisions.
SET LOCAL ROLE elevateo_owner;
ALTER TABLE app.campaign_suppressions NO FORCE ROW LEVEL SECURITY;
LOCK TABLE app.campaign_suppressions IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM app.campaign_suppressions
    GROUP BY organization_id,lower(email) HAVING count(*)>1) THEN
    RAISE EXCEPTION 'campaign suppression normalization collision: preserve and resolve duplicate evidence';
  END IF;
END $$;
UPDATE app.campaign_suppressions SET email=lower(email) WHERE email<>lower(email);
ALTER TABLE app.campaign_suppressions ADD CONSTRAINT campaign_suppressions_lowercase
  CHECK(email=lower(email)) NOT VALID;
ALTER TABLE app.campaign_suppressions VALIDATE CONSTRAINT campaign_suppressions_lowercase;
ALTER TABLE app.campaign_suppressions FORCE ROW LEVEL SECURITY;
GRANT SELECT(reason),TRIGGER ON app.campaign_suppressions TO elevateo_send_owner;
-- AIDEV-NOTE: Only monotonic bounce promotion is writable; existing tenant and protected-write guards still apply.
GRANT UPDATE(reason) ON app.campaign_suppressions TO elevateo_app_read;
CREATE POLICY campaign_suppression_promote ON app.campaign_suppressions FOR UPDATE TO elevateo_app_read
  USING (organization_id=app.context_uuid('app.org_id') AND EXISTS(
    SELECT 1 FROM app.organization_memberships m WHERE m.organization_id=campaign_suppressions.organization_id
      AND m.user_id=app.context_uuid('app.user_id'))
    AND (app.authorize_outreach_draft_write(NULLIF(current_setting('app.outreach_digest',true),''))->>'status')='ok')
  WITH CHECK (reason='bounce' AND organization_id=app.context_uuid('app.org_id')
    AND (app.authorize_outreach_draft_write(NULLIF(current_setting('app.outreach_digest',true),''))->>'status')='ok');
SET LOCAL ROLE elevateo_send_owner;
LOCK TABLE app_send_private.recipient_suppressions IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM app_send_private.recipient_suppressions
    GROUP BY organization_id,lower(canonical_address) HAVING count(*)>1) THEN
    RAISE EXCEPTION 'recipient suppression normalization collision: preserve and resolve duplicate evidence';
  END IF;
END $$;
UPDATE app_send_private.recipient_suppressions SET canonical_address=lower(canonical_address)
  WHERE canonical_address<>lower(canonical_address);
ALTER TABLE app_send_private.recipient_suppressions ADD CONSTRAINT recipient_suppressions_lowercase
  CHECK(canonical_address=lower(canonical_address)) NOT VALID;
ALTER TABLE app_send_private.recipient_suppressions VALIDATE CONSTRAINT recipient_suppressions_lowercase;
SET LOCAL ROLE elevateo_send_owner;
CREATE FUNCTION app_send_private.normalize_suppression() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME='recipient_suppressions' THEN NEW.canonical_address:=lower(NEW.canonical_address);
  ELSE NEW.email:=lower(NEW.email); END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION app_send_private.delivery_suppressed(p_org uuid,p_address text) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM app_send_private.recipient_suppressions
    WHERE organization_id=p_org AND canonical_address=lower(p_address))
    OR EXISTS(SELECT 1 FROM app.campaign_suppressions
      WHERE organization_id=p_org AND email=lower(p_address) AND reason='bounce')
$$;
-- AIDEV-NOTE: Campaign writes run as the application role; definer rights serialize against worker policy locks.
CREATE FUNCTION app_send_private.bump_campaign_suppression_policy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  UPDATE app_send_private.organization_policy SET revision=revision+1,updated_at=clock_timestamp()
    WHERE organization_id=COALESCE(NEW.organization_id,OLD.organization_id);
  IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    UPDATE app_send_private.organization_policy SET revision=revision+1,updated_at=clock_timestamp()
      WHERE organization_id=OLD.organization_id;
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION app_send_private.normalize_suppression(),
  app_send_private.delivery_suppressed(uuid,text),app_send_private.bump_campaign_suppression_policy()
  FROM PUBLIC,elevateo_api,elevateo_app_read,elevateo_worker;

CREATE TRIGGER normalize_recipient_suppression BEFORE INSERT OR UPDATE
  ON app_send_private.recipient_suppressions FOR EACH ROW EXECUTE FUNCTION app_send_private.normalize_suppression();
CREATE TRIGGER normalize_campaign_suppression BEFORE INSERT OR UPDATE
  ON app.campaign_suppressions FOR EACH ROW EXECUTE FUNCTION app_send_private.normalize_suppression();
CREATE TRIGGER campaign_suppression_policy_revision AFTER INSERT OR UPDATE OR DELETE
  ON app.campaign_suppressions FOR EACH ROW EXECUTE FUNCTION app_send_private.bump_campaign_suppression_policy();

SET LOCAL ROLE elevateo_owner;
REVOKE TRIGGER ON app.campaign_suppressions FROM elevateo_send_owner;
RESET ROLE;
