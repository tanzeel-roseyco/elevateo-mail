-- AIDEV-NOTE: Operation identities survive draft deletion; private immutable bytes never use inbox ownership.
CREATE TABLE app_drafts_private.attachment_stage_operations (
  organization_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  mailbox_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  attachment_id uuid NOT NULL UNIQUE,
  reservation_token uuid NOT NULL UNIQUE,
  object_key text NOT NULL UNIQUE,
  filename text NOT NULL CHECK (octet_length(filename) BETWEEN 1 AND 255 AND filename = btrim(filename)
    AND filename NOT IN ('.', '..') AND filename !~ '[[:cntrl:]/]' AND strpos(filename, chr(92)) = 0),
  content_type text NOT NULL CHECK (content_type IN ('application/pdf', 'image/png', 'image/jpeg', 'text/plain')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 1048576),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  stage_state text NOT NULL CHECK (stage_state IN ('reserved', 'committed', 'aborted')),
  reserved_at timestamptz NOT NULL CHECK (isfinite(reserved_at)),
  completed_at timestamptz,
  PRIMARY KEY (organization_id, actor_id, operation_id),
  UNIQUE (organization_id, mailbox_id, draft_id, actor_id, attachment_id),
  CHECK (object_key = 'drafts/' || organization_id::text || '/' || attachment_id::text),
  CHECK ((stage_state = 'reserved' AND completed_at IS NULL) OR
    (stage_state IN ('committed', 'aborted') AND completed_at IS NOT NULL
      AND isfinite(completed_at) AND completed_at >= reserved_at))
);
-- AIDEV-NOTE: A per-file cap alone permits unlimited uploads; reserve one slot before any object-storage I/O.
CREATE UNIQUE INDEX draft_attachment_active_slot
  ON app_drafts_private.attachment_stage_operations(organization_id, mailbox_id, draft_id)
  WHERE stage_state IN ('reserved', 'committed');
CREATE TABLE app.draft_attachments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  mailbox_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  scan_status text NOT NULL CHECK (scan_status IN ('pending_scan', 'clean', 'malware', 'scan_failed')),
  scan_attempt integer NOT NULL DEFAULT 0 CHECK (scan_attempt BETWEEN 0 AND 3),
  scan_token uuid,
  scan_started_at timestamptz,
  scan_next_at timestamptz,
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  scan_updated_at timestamptz NOT NULL CHECK (isfinite(scan_updated_at)),
  UNIQUE (organization_id, mailbox_id, draft_id, id),
  FOREIGN KEY (organization_id, mailbox_id, draft_id)
    REFERENCES app.drafts(organization_id, mailbox_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, mailbox_id, draft_id, actor_id, id)
    REFERENCES app_drafts_private.attachment_stage_operations
      (organization_id, mailbox_id, draft_id, actor_id, attachment_id),
  CHECK ((scan_token IS NULL) = (scan_started_at IS NULL)),
  CHECK (scan_started_at IS NULL OR isfinite(scan_started_at)),
  CHECK (scan_next_at IS NULL OR isfinite(scan_next_at))
);
CREATE INDEX draft_attachment_scan_due ON app.draft_attachments(scan_next_at, created_at, id)
  WHERE scan_status IN ('pending_scan', 'scan_failed') AND scan_attempt < 3;
CREATE INDEX draft_attachment_exhausted_scan ON app.draft_attachments(scan_started_at, id)
  WHERE scan_status = 'pending_scan' AND scan_attempt = 3 AND scan_token IS NOT NULL;
ALTER TABLE app_drafts_private.attachment_stage_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_drafts_private.attachment_stage_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE app.draft_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.draft_attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY draft_attachment_operation_owner ON app_drafts_private.attachment_stage_operations
  TO elevateo_owner USING (true) WITH CHECK (true);
CREATE POLICY draft_attachment_owner ON app.draft_attachments
  TO elevateo_owner USING (true) WITH CHECK (true);
REVOKE ALL ON app_drafts_private.attachment_stage_operations, app.draft_attachments
  FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
