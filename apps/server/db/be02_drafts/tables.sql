-- AIDEV-NOTE: API reads own drafts through RLS; only bounded definer functions may mutate or inspect the ledger.
CREATE TABLE app.drafts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  mailbox_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  subject text NOT NULL CHECK (char_length(subject) <= 998),
  recipients jsonb NOT NULL CHECK (app.thread_recipients_valid(recipients)),
  body_text text NOT NULL CHECK (char_length(body_text) <= 65536),
  reply_to_thread_id uuid,
  version integer NOT NULL CHECK (version BETWEEN 1 AND 2147483647),
  state text NOT NULL CHECK (state IN ('editable', 'consumed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(created_at)),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(updated_at)),
  UNIQUE (organization_id, mailbox_id, id),
  FOREIGN KEY (organization_id, mailbox_id) REFERENCES app.mailboxes(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, mailbox_id, reply_to_thread_id)
    REFERENCES app.threads(organization_id, mailbox_id, id) ON DELETE SET NULL (reply_to_thread_id)
);
CREATE INDEX drafts_actor_page ON app.drafts
  (organization_id, actor_id, mailbox_id, updated_at DESC, id DESC);

-- AIDEV-NOTE: No cascading FK can erase a used operation ID and permit accidental re-execution after seven days.
CREATE TABLE app_drafts_private.operations (
  organization_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  mailbox_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  payload_digest text NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at)),
  detail_expires_at timestamptz NOT NULL CHECK (detail_expires_at = recorded_at + interval '604800 seconds'),
  detail jsonb CHECK (detail IS NULL OR (jsonb_typeof(detail) = 'object' AND
    detail->>'outcome' IN ('applied', 'conflict') AND octet_length(detail::text) <= 2048)),
  PRIMARY KEY (organization_id, actor_id, operation_id)
);
CREATE INDEX draft_operations_compaction ON app_drafts_private.operations(detail_expires_at)
  WHERE detail IS NOT NULL;
ALTER TABLE app.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.drafts FORCE ROW LEVEL SECURITY;
ALTER TABLE app_drafts_private.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_drafts_private.operations FORCE ROW LEVEL SECURITY;
