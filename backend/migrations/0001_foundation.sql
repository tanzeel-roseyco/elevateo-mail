-- AIDEV-NOTE: Composite ownership keys and triggers protect every path, including concurrent queue dispatch.
PRAGMA foreign_keys = ON;
CREATE TABLE users (id TEXT PRIMARY KEY);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
);
CREATE TABLE mailboxes (
 owner TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, provider TEXT NOT NULL CHECK(provider IN ('fake','gmail','resend')),
 subject TEXT NOT NULL, address TEXT NOT NULL, connected INTEGER NOT NULL DEFAULT 1 CHECK(connected IN (0,1)),
 send_enabled INTEGER NOT NULL DEFAULT 0 CHECK(send_enabled IN (0,1)), verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)),
 ai_read INTEGER NOT NULL DEFAULT 0 CHECK(ai_read IN (0,1)), ai_send INTEGER NOT NULL DEFAULT 0 CHECK(ai_send IN (0,1)),
 PRIMARY KEY(owner,id), UNIQUE(owner,provider,subject), UNIQUE(owner,address)
);
CREATE TRIGGER mailbox_cap BEFORE INSERT ON mailboxes
WHEN (SELECT count(*) FROM mailboxes WHERE owner=NEW.owner)>=10
 AND NOT EXISTS(SELECT 1 FROM mailboxes WHERE owner=NEW.owner AND provider=NEW.provider AND subject=NEW.subject)
BEGIN SELECT RAISE(ABORT,'mailbox_limit'); END;
CREATE TABLE contacts (
 owner TEXT NOT NULL REFERENCES users(id), email TEXT NOT NULL, consent_source TEXT NOT NULL,
 opted_in INTEGER NOT NULL CHECK(opted_in IN (0,1)), PRIMARY KEY(owner,email)
);
CREATE TABLE suppressions (
 owner TEXT NOT NULL REFERENCES users(id), email TEXT NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL,
 PRIMARY KEY(owner,email)
);
CREATE TABLE campaigns (
 owner TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','running','paused')),
 PRIMARY KEY(owner,id)
);
CREATE TABLE campaign_stops (
 owner TEXT NOT NULL, campaign_id TEXT NOT NULL, email TEXT NOT NULL,
 PRIMARY KEY(owner,campaign_id,email), FOREIGN KEY(owner,campaign_id) REFERENCES campaigns(owner,id)
);
CREATE TABLE send_intents (
 owner TEXT NOT NULL, id TEXT NOT NULL, mailbox_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
 revision TEXT NOT NULL, envelope TEXT NOT NULL CHECK(json_valid(envelope)), recipients TEXT NOT NULL CHECK(json_valid(recipients)),
 recipient_count INTEGER NOT NULL CHECK(recipient_count BETWEEN 1 AND 30),
 kind TEXT NOT NULL CHECK(kind IN ('manual','campaign','ai')), campaign_id TEXT,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','dispatching','accepted','rejected','unknown','cancelled')),
 approved_revision TEXT, scheduled_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, dispatch_at INTEGER,
 provider_id TEXT, attempts INTEGER NOT NULL DEFAULT 0, error_code TEXT,
 PRIMARY KEY(owner,id), UNIQUE(owner,idempotency_key),
 FOREIGN KEY(owner,mailbox_id) REFERENCES mailboxes(owner,id),
 FOREIGN KEY(owner,campaign_id) REFERENCES campaigns(owner,id),
 CHECK((kind='campaign')=(campaign_id IS NOT NULL))
);
CREATE INDEX due_intents ON send_intents(status,scheduled_at);
CREATE INDEX mailbox_quota ON send_intents(owner,mailbox_id,status,dispatch_at);
CREATE TRIGGER immutable_send BEFORE UPDATE OF envelope,recipients,recipient_count,kind,mailbox_id,revision,campaign_id,idempotency_key ON send_intents
BEGIN SELECT RAISE(ABORT,'immutable_revision'); END;
-- Pending/uncertain reservations never expire. Accepted quota expires only from the actual dispatch time.
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
 SELECT CASE WHEN NEW.recipient_count + COALESCE((SELECT sum(recipient_count) FROM send_intents WHERE owner=NEW.owner
 AND mailbox_id=NEW.mailbox_id AND id<>NEW.id AND (status IN ('pending','dispatching','unknown')
 OR (status='accepted' AND dispatch_at>NEW.updated_at-86400000))),0)>30 THEN RAISE(ABORT,'quota_exceeded') END;
END;
CREATE TABLE event_receipts (
 owner TEXT NOT NULL, mailbox_id TEXT NOT NULL, event_id TEXT NOT NULL, payload_hash TEXT NOT NULL, at INTEGER NOT NULL,
 PRIMARY KEY(owner,mailbox_id,event_id), FOREIGN KEY(owner,mailbox_id) REFERENCES mailboxes(owner,id)
);
CREATE TABLE messages (
 owner TEXT NOT NULL, mailbox_id TEXT NOT NULL, id TEXT NOT NULL, thread_id TEXT NOT NULL,
 sender TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL,
 PRIMARY KEY(owner,mailbox_id,id), FOREIGN KEY(owner,mailbox_id) REFERENCES mailboxes(owner,id)
);
CREATE INDEX message_page ON messages(owner,mailbox_id,at,id);
