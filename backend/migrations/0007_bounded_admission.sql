-- AIDEV-NOTE: Separate indexed status/range scans exclude old accepted history from hot admission reads.
DROP TRIGGER send_guard;
CREATE TRIGGER send_guard BEFORE UPDATE OF status ON send_intents
WHEN NEW.status IN ('pending','dispatching')
BEGIN
 SELECT CASE WHEN NEW.approved_revision IS NULL OR NEW.approved_revision<>NEW.revision THEN RAISE(ABORT,'approval_required') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM mailboxes WHERE owner=NEW.owner AND id=NEW.mailbox_id AND connected=1 AND send_enabled=1
 AND (NEW.kind<>'ai' OR ai_send=1) AND (provider<>'resend' OR (verified=1 AND NEW.kind='campaign')))
 THEN RAISE(ABORT,'mailbox_permission') END;
 SELECT CASE WHEN NEW.kind='campaign' AND NOT EXISTS(SELECT 1 FROM campaigns WHERE owner=NEW.owner AND id=NEW.campaign_id AND status='running')
 THEN RAISE(ABORT,'campaign_paused') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.recipients) r JOIN suppressions s ON s.owner=NEW.owner AND s.email=r.value)
 THEN RAISE(ABORT,'suppressed') END;
 SELECT CASE WHEN NEW.kind='campaign' AND EXISTS(SELECT 1 FROM json_each(NEW.recipients) r WHERE
 NOT EXISTS(SELECT 1 FROM contacts c WHERE c.owner=NEW.owner AND c.email=r.value AND c.opted_in=1 AND length(c.consent_source)>0)
 OR EXISTS(SELECT 1 FROM campaign_stops s WHERE s.owner=NEW.owner AND s.campaign_id=NEW.campaign_id AND s.email=r.value))
 THEN RAISE(ABORT,'consent_or_reply_stop') END;
 SELECT CASE WHEN NEW.recipient_count + COALESCE((SELECT sum(recipient_count) FROM (
 SELECT recipient_count FROM send_intents WHERE owner=NEW.owner AND mailbox_id=NEW.mailbox_id AND id<>NEW.id
 AND status IN ('pending','dispatching','unknown') UNION ALL
 SELECT recipient_count FROM send_intents WHERE owner=NEW.owner AND mailbox_id=NEW.mailbox_id AND id<>NEW.id
 AND status='accepted' AND dispatch_at>NEW.updated_at-86400000)),0)>30 THEN RAISE(ABORT,'quota_exceeded') END;
END;
