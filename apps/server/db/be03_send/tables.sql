-- AIDEV-NOTE: One immutable send identity stores reviewed bytes; no second snapshot/outbox identity exists.
CREATE TABLE app_send_private.organization_policy (
  organization_id uuid PRIMARY KEY REFERENCES app.organizations(id) ON DELETE RESTRICT,
  revision bigint NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL CHECK (isfinite(updated_at))
);
CREATE TABLE app_send_private.mailbox_policy (
  organization_id uuid NOT NULL, mailbox_id uuid NOT NULL, enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (organization_id, mailbox_id),
  FOREIGN KEY (organization_id, mailbox_id) REFERENCES app.mailboxes(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id) REFERENCES app_send_private.organization_policy ON DELETE RESTRICT
);
CREATE TABLE app_send_private.recipient_suppressions (
  organization_id uuid NOT NULL REFERENCES app_send_private.organization_policy ON DELETE RESTRICT,
  canonical_address text NOT NULL CHECK (octet_length(canonical_address) BETWEEN 1 AND 254),
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)), PRIMARY KEY (organization_id,canonical_address)
);
CREATE TABLE app_send_private.intents (
  send_id uuid PRIMARY KEY, organization_id uuid NOT NULL, mailbox_id uuid NOT NULL, draft_id uuid NOT NULL UNIQUE,
  draft_version integer NOT NULL CHECK (draft_version BETWEEN 1 AND 2147483647), approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL CHECK (isfinite(approved_at)),
  approval_session_digest text NOT NULL CHECK (approval_session_digest ~ '^[0-9a-f]{64}$'),
  approval_auth_session_id uuid NOT NULL, approval_context_id uuid NOT NULL,
  approval_generation bigint NOT NULL CHECK (approval_generation > 0),
  approval_policy_revision bigint NOT NULL CHECK (approval_policy_revision > 0), approval_epoch uuid NOT NULL,
  review_digest text NOT NULL CHECK (review_digest ~ '^[0-9a-f]{64}$'),
  snapshot_bytes bytea NOT NULL CHECK (octet_length(snapshot_bytes) BETWEEN 1 AND 1048576),
  snapshot_format text NOT NULL CHECK (snapshot_format = 'elevateo.send.snapshot.v1'),
  simulated boolean NOT NULL CHECK (simulated),
  UNIQUE (organization_id,mailbox_id,draft_id,draft_version),
  FOREIGN KEY (organization_id,mailbox_id,draft_id) REFERENCES app.drafts(organization_id,mailbox_id,id) ON DELETE RESTRICT,
  CHECK (encode(sha256(snapshot_bytes),'hex') = review_digest)
);
CREATE TABLE app_send_private.approval_operations (
  organization_id uuid NOT NULL, actor_id uuid NOT NULL, operation_id uuid NOT NULL,
  mailbox_id uuid NOT NULL, draft_id uuid NOT NULL, expected_version integer NOT NULL CHECK (expected_version >= 1),
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('approved','conflict')),
  send_id uuid REFERENCES app_send_private.intents ON DELETE RESTRICT,
  error_code text CHECK (error_code IN ('draft_conflict','draft_consumed','review_stale','send_not_ready')),
  recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at)),
  PRIMARY KEY (organization_id,actor_id,operation_id),
  CHECK ((outcome = 'approved' AND send_id IS NOT NULL AND error_code IS NULL) OR
         (outcome = 'conflict' AND send_id IS NULL AND error_code IS NOT NULL))
);
CREATE TABLE app_send_private.jobs (
  send_id uuid PRIMARY KEY REFERENCES app_send_private.intents ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('queued','dispatching','unknown','needs_review','cancelled','accepted','rejected')),
  next_action text NOT NULL CHECK (next_action IN ('submit','reconcile','none')), next_check_at timestamptz CHECK (isfinite(next_check_at)),
  lease_generation bigint NOT NULL DEFAULT 0 CHECK (lease_generation >= 0), lease_id uuid,
  lease_expires_at timestamptz CHECK (isfinite(lease_expires_at)),
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  preflight_failures smallint NOT NULL DEFAULT 0 CHECK (preflight_failures BETWEEN 0 AND 3),
  reconcile_count smallint NOT NULL DEFAULT 0 CHECK (reconcile_count BETWEEN 0 AND 5),
  first_possible_at timestamptz CHECK (isfinite(first_possible_at)), retry_deadline_at timestamptz CHECK (isfinite(retry_deadline_at)),
  policy_profile text NOT NULL CHECK (policy_profile IN ('none','synthetic-v1')),
  cancel_requested_at timestamptz CHECK (isfinite(cancel_requested_at)), accepted_at timestamptz CHECK (isfinite(accepted_at)),
  accepted_receipt_ref text CHECK (char_length(accepted_receipt_ref) BETWEEN 1 AND 256),
  hold_reason text CHECK (hold_reason IN ('session_invalid','authorization_changed','capability_revoked','mailbox_disabled',
    'suppressed','policy_changed','restore_unreconciled','control_unavailable','auth_unavailable','uncertain',
    'retry_expired','attempt_limit','evidence_conflict','counter_exhausted')),
  updated_at timestamptz NOT NULL CHECK (isfinite(updated_at)),
  CHECK ((lease_id IS NULL) = (lease_expires_at IS NULL)),
  CHECK ((next_action = 'none') = (next_check_at IS NULL))
);
CREATE TABLE app_send_private.attempts (
  send_id uuid NOT NULL REFERENCES app_send_private.intents ON DELETE RESTRICT,
  attempt_no smallint NOT NULL CHECK (attempt_no BETWEEN 1 AND 3), attempt_id uuid NOT NULL UNIQUE,
  lease_generation bigint NOT NULL CHECK (lease_generation > 0),
  authorized_at timestamptz NOT NULL CHECK (isfinite(authorized_at)),
  call_deadline_at timestamptz NOT NULL CHECK (isfinite(call_deadline_at) AND call_deadline_at > authorized_at),
  capability_hash bytea NOT NULL CHECK (octet_length(capability_hash) = 32),
  profile text NOT NULL CHECK (profile IN ('none','synthetic-v1')), PRIMARY KEY (send_id,attempt_no)
);
CREATE TABLE app_send_private.observations (
  observation_id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES app_send_private.attempts(attempt_id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('accepted','rejected','unknown')),
  source text NOT NULL CHECK (source = 'local_failure_driver'), receipt_ref text CHECK (char_length(receipt_ref) BETWEEN 1 AND 256),
  evidence_digest bytea NOT NULL CHECK (octet_length(evidence_digest) = 32),
  received_at timestamptz NOT NULL CHECK (isfinite(received_at)), UNIQUE (attempt_id,kind),
  CHECK ((kind = 'accepted' AND receipt_ref IS NOT NULL) OR (kind <> 'accepted' AND receipt_ref IS NULL))
);
CREATE TABLE app_send_private.audit_events (
  send_id uuid NOT NULL REFERENCES app_send_private.intents ON DELETE RESTRICT,
  event_key text NOT NULL CHECK (char_length(event_key) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('approved','attempt_authorized','cancel_requested','held','observation_applied','observation_rejected')),
  actor_id uuid, lease_generation bigint CHECK (lease_generation > 0),
  observation_id uuid UNIQUE REFERENCES app_send_private.observations ON DELETE RESTRICT,
  from_state text CHECK (from_state IN ('queued','dispatching','unknown','needs_review','cancelled','accepted','rejected')),
  to_state text CHECK (to_state IN ('queued','dispatching','unknown','needs_review','cancelled','accepted','rejected')),
  reason_code text CHECK (char_length(reason_code) <= 80), recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at)),
  PRIMARY KEY (send_id,event_key), CHECK ((kind = 'approved') = (event_key = 'approved'))
);
CREATE INDEX send_jobs_due ON app_send_private.jobs(next_check_at,send_id);
CREATE INDEX send_jobs_leased ON app_send_private.jobs(lease_expires_at,send_id) WHERE lease_expires_at IS NOT NULL;
CREATE INDEX send_intents_author ON app_send_private.intents(organization_id,mailbox_id,approved_by,send_id);
DO $$ DECLARE relation text; BEGIN
  FOREACH relation IN ARRAY ARRAY['organization_policy','mailbox_policy','recipient_suppressions','intents',
      'approval_operations','jobs','attempts','observations','audit_events'] LOOP
    EXECUTE format('ALTER TABLE app_send_private.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE app_send_private.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY send_owner ON app_send_private.%I TO elevateo_send_owner USING (true) WITH CHECK (true)', relation);
  END LOOP;
END $$;
