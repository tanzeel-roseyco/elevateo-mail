SET LOCAL ROLE elevateo_owner;

ALTER TABLE app.threads
  ADD COLUMN folder text NOT NULL DEFAULT 'inbox'
    CHECK (folder IN ('inbox', 'archive', 'spam', 'trash')),
  ADD COLUMN snoozed_until timestamptz
    CHECK (snoozed_until IS NULL OR (isfinite(snoozed_until) AND
      snoozed_until >= timestamptz '0001-01-01 00:00:00+00' AND
      snoozed_until < timestamptz '10000-01-01 00:00:00+00')),
  ADD COLUMN folder_version integer NOT NULL DEFAULT 0 CHECK (folder_version >= 0),
  ADD COLUMN folder_updated_at timestamptz;

CREATE TABLE app.thread_stars (
  organization_id uuid NOT NULL,
  mailbox_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL,
  starred boolean NOT NULL DEFAULT false,
  star_version integer NOT NULL DEFAULT 0 CHECK (star_version >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, mailbox_id, thread_id, user_id),
  FOREIGN KEY (organization_id, mailbox_id, thread_id)
    REFERENCES app.threads(organization_id, mailbox_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, user_id)
    REFERENCES app.organization_memberships(organization_id, user_id) ON DELETE CASCADE
);

CREATE INDEX threads_mailbox_folder_order
  ON app.threads (organization_id, mailbox_id, folder, id DESC);
CREATE INDEX thread_stars_actor ON app.thread_stars
  (organization_id, user_id, mailbox_id, thread_id);
