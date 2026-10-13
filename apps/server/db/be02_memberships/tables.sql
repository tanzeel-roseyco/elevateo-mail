-- AIDEV-NOTE: A separate revision avoids the mailbox trigger invalidating every organization member on roster edits.
SET LOCAL ROLE elevateo_owner;
CREATE TABLE app.mailbox_membership_revisions (
  organization_id uuid NOT NULL,
  mailbox_id uuid PRIMARY KEY,
  membership_version integer NOT NULL DEFAULT 0 CHECK (membership_version BETWEEN 0 AND 2147483647),
  FOREIGN KEY (organization_id, mailbox_id) REFERENCES app.mailboxes(organization_id, id) ON DELETE CASCADE
);
ALTER TABLE app.mailbox_membership_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mailbox_membership_revisions FORCE ROW LEVEL SECURITY;

-- AIDEV-NOTE: These policies apply only to the NOLOGIN owner, never the runtime read role or API login.
CREATE POLICY membership_routine_org_read ON app.organization_memberships FOR SELECT TO elevateo_owner USING (true);
CREATE POLICY membership_routine_mailbox_read ON app.mailboxes FOR SELECT TO elevateo_owner USING (true);
CREATE POLICY membership_routine_rows ON app.mailbox_memberships TO elevateo_owner USING (true) WITH CHECK (true);
CREATE POLICY membership_routine_revision ON app.mailbox_membership_revisions TO elevateo_owner
  USING (true) WITH CHECK (true);
REVOKE ALL ON app.mailbox_membership_revisions FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;

INSERT INTO app.mailbox_membership_revisions(organization_id, mailbox_id)
  SELECT organization_id, id FROM app.mailboxes;
