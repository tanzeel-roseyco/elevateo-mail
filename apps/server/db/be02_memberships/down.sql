-- AIDEV-NOTE: Down restores only this boundary; existing A generation guards and B read policies remain intact.
SET LOCAL ROLE elevateo_owner;
DROP FUNCTION app.change_mailbox_membership(text,uuid,uuid,integer,boolean,boolean,boolean,boolean);
DROP FUNCTION app.mailbox_members_page(uuid,uuid,integer);
DROP FUNCTION app.mailbox_membership_version(uuid);
DROP TRIGGER zz_mailbox_membership_revision ON app.mailbox_memberships;
DROP FUNCTION app.bump_mailbox_membership_revision();
DROP POLICY membership_routine_rows ON app.mailbox_memberships;
DROP POLICY membership_routine_org_read ON app.organization_memberships;
DROP POLICY membership_routine_mailbox_read ON app.mailboxes;
DROP TABLE app.mailbox_membership_revisions;
