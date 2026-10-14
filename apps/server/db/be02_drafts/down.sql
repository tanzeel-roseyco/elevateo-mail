DROP FUNCTION app.compact_draft_operations(integer);
DROP FUNCTION app.draft_operation(uuid, uuid, uuid);
DROP FUNCTION app.save_draft(text, uuid, uuid, uuid, text, integer, text, jsonb, text, uuid);
DROP FUNCTION app.draft_scope(uuid, uuid);
DROP TABLE app_drafts_private.operations;
DROP TABLE app.drafts;
-- AIDEV-NOTE: Keep the bootstrap-owned empty schema so reapply needs no database CREATE privilege.
DROP POLICY draft_owner_thread_read ON app.threads;
DROP POLICY draft_owner_mailbox_read ON app.mailboxes;
DROP POLICY draft_owner_membership_read ON app.mailbox_memberships;
DROP POLICY draft_owner_org_read ON app.organization_memberships;
