-- AIDEV-NOTE: Rollback restores behavior/ACLs; normalized identities remain valid legacy keys without data deletion.
SET LOCAL ROLE elevateo_owner;
DROP POLICY campaign_suppression_promote ON app.campaign_suppressions;
REVOKE UPDATE(reason) ON app.campaign_suppressions FROM elevateo_app_read;
DROP TRIGGER campaign_suppression_policy_revision ON app.campaign_suppressions;
DROP TRIGGER normalize_campaign_suppression ON app.campaign_suppressions;
REVOKE SELECT(reason) ON app.campaign_suppressions FROM elevateo_send_owner;
ALTER TABLE app.campaign_suppressions DROP CONSTRAINT campaign_suppressions_lowercase;
SET LOCAL ROLE elevateo_send_owner;
DROP TRIGGER normalize_recipient_suppression ON app_send_private.recipient_suppressions;
DROP FUNCTION app_send_private.bump_campaign_suppression_policy(),
  app_send_private.delivery_suppressed(uuid,text),app_send_private.normalize_suppression();
ALTER TABLE app_send_private.recipient_suppressions DROP CONSTRAINT recipient_suppressions_lowercase;
RESET ROLE;
