-- AIDEV-NOTE: Activity/counts stay derived from messages; no cached counter can drift or cross an RLS boundary.
CREATE TABLE app.threads (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  mailbox_id uuid NOT NULL,
  subject text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (organization_id, mailbox_id, id),
  FOREIGN KEY (organization_id, mailbox_id)
    REFERENCES app.mailboxes(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE app.messages (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  mailbox_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  sender jsonb CHECK (sender IS NULL OR app.thread_address_valid(sender)),
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (app.thread_recipients_valid(recipients)),
  sent_at timestamptz CHECK (sent_at IS NULL OR (isfinite(sent_at) AND
    sent_at >= timestamptz '0001-01-01 00:00:00+00' AND sent_at < timestamptz '10000-01-01 00:00:00+00')),
  body_text text NOT NULL DEFAULT '',
  attachment_count integer NOT NULL DEFAULT 0 CHECK (attachment_count BETWEEN 0 AND 1000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (organization_id, mailbox_id, thread_id, id),
  FOREIGN KEY (organization_id, mailbox_id, thread_id)
    REFERENCES app.threads(organization_id, mailbox_id, id) ON DELETE CASCADE
);

-- AIDEV-NOTE: D will upsert only the authenticated actor's state through its guarded write transaction.
CREATE TABLE app.thread_read_states (
  organization_id uuid NOT NULL,
  mailbox_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, mailbox_id, thread_id, user_id),
  FOREIGN KEY (organization_id, mailbox_id, thread_id)
    REFERENCES app.threads(organization_id, mailbox_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, user_id)
    REFERENCES app.organization_memberships(organization_id, user_id) ON DELETE CASCADE
);

CREATE INDEX threads_mailbox_order ON app.threads (organization_id, mailbox_id, id DESC);
-- AIDEV-NOTE: Reverse scans also satisfy detail order: sent_at ASC NULLS FIRST, id ASC.
CREATE INDEX messages_thread_order ON app.messages
  (organization_id, mailbox_id, thread_id, sent_at DESC NULLS LAST, id DESC);
CREATE INDEX thread_read_states_actor ON app.thread_read_states
  (organization_id, user_id, mailbox_id, thread_id);
