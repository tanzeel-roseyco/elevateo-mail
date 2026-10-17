-- AIDEV-NOTE: Existing stored B states become revision 1; absence alone remains false/version 0/null.
SET LOCAL ROLE elevateo_owner;
ALTER TABLE app.thread_read_states ADD COLUMN read_state_version integer NOT NULL DEFAULT 1
  CHECK (read_state_version BETWEEN 1 AND 2147483647);

CREATE TABLE app.thread_assignments (
  organization_id uuid NOT NULL,
  mailbox_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  assignee_id uuid,
  assignment_version integer NOT NULL DEFAULT 0 CHECK (assignment_version BETWEEN 0 AND 2147483647),
  updated_at timestamptz,
  PRIMARY KEY (organization_id, mailbox_id, thread_id),
  FOREIGN KEY (organization_id, mailbox_id, thread_id)
    REFERENCES app.threads(organization_id, mailbox_id, id) ON DELETE CASCADE,
  CHECK ((assignment_version = 0 AND assignee_id IS NULL AND updated_at IS NULL) OR
    (assignment_version > 0 AND updated_at IS NOT NULL AND
      updated_at >= '0001-01-01 00:00:00+00'::timestamptz AND updated_at < '10000-01-01 00:00:00+00'::timestamptz))
);

-- AIDEV-NOTE: Attribution is historical UUID data; membership deletion must not erase assignment or note history.
CREATE TABLE app.thread_notes (
  organization_id uuid NOT NULL,
  id uuid NOT NULL,
  mailbox_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  author_id uuid NOT NULL,
  body_text text NOT NULL CHECK (char_length(body_text) BETWEEN 1 AND 4096),
  version integer NOT NULL DEFAULT 1 CHECK (version = 1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    CHECK (created_at >= '0001-01-01 00:00:00+00'::timestamptz AND created_at < '10000-01-01 00:00:00+00'::timestamptz),
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, mailbox_id, thread_id)
    REFERENCES app.threads(organization_id, mailbox_id, id) ON DELETE CASCADE
);
CREATE INDEX thread_notes_page ON app.thread_notes(organization_id, mailbox_id, thread_id, created_at, id);
