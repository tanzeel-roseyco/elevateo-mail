-- AIDEV-NOTE: NULL marks legacy/imported/unsupported mail as ineligible for a threaded Gmail reply.
ALTER TABLE messages ADD COLUMN gmail_reply TEXT;
-- Rollback requires a forward rebuild of messages without gmail_reply; retain source mail during rollback.
