-- AIDEV-NOTE: Bounded operational inventory must not scan years of disconnected mailbox history.
CREATE INDEX mailbox_connection_page ON mailboxes(owner,connected,id);
-- Rollback: DROP INDEX mailbox_connection_page;
