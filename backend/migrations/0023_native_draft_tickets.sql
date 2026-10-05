-- AIDEV-NOTE: Short-lived hashed tickets transfer draft context, never account cookies or sending authority.
CREATE TABLE native_draft_tickets (
 ticket_hash TEXT PRIMARY KEY, lease_hash TEXT UNIQUE, owner TEXT NOT NULL,
 session_hash TEXT NOT NULL, request_id TEXT NOT NULL, mailbox_id TEXT NOT NULL,
 message_ids TEXT NOT NULL, instruction TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX native_draft_expiry ON native_draft_tickets(expires_at);
-- Rollback: DROP TABLE native_draft_tickets;
