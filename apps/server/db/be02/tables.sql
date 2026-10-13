-- AIDEV-NOTE: Opaque digests/ciphertexts are the only stored cookie/token material; Rails owns authenticated encryption.
CREATE TABLE app_auth.sessions (
  cookie_digest text PRIMARY KEY CHECK (cookie_digest ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL,
  auth_session_id uuid NOT NULL,
  organization_id uuid,
  context_id uuid NOT NULL,
  csrf_token text NOT NULL CHECK (octet_length(csrf_token) BETWEEN 32 AND 512),
  access_token_ciphertext text NOT NULL CHECK (octet_length(access_token_ciphertext) BETWEEN 1 AND 16384),
  refresh_token_ciphertext text NOT NULL CHECK (octet_length(refresh_token_ciphertext) BETWEEN 1 AND 16384),
  access_expires_at timestamptz NOT NULL CHECK (isfinite(access_expires_at)),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  absolute_expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'refreshing', 'refresh_uncertain', 'revoked')),
  refresh_generation bigint NOT NULL DEFAULT 0 CHECK (refresh_generation >= 0),
  refresh_claim_id uuid,
  refresh_claim_deadline timestamptz,
  revoked_at timestamptz,
  revocation_scope text CHECK (revocation_scope IN ('local', 'global')),
  CHECK (absolute_expires_at <= created_at + interval '12 hours'),
  CHECK (idle_expires_at <= absolute_expires_at),
  CHECK ((refresh_claim_id IS NULL) = (refresh_claim_deadline IS NULL)),
  CHECK (state <> 'refreshing' OR refresh_claim_id IS NOT NULL)
);
CREATE INDEX sessions_user_idx ON app_auth.sessions (user_id, cookie_digest);

-- Tombstones deliberately have no membership FK: removal/re-addition must never recycle an authorization version.
CREATE TABLE app_auth.authorization_generations (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
  PRIMARY KEY (organization_id, user_id)
);
CREATE TABLE app_auth.revocation_intents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cookie_digest text NOT NULL REFERENCES app_auth.sessions (cookie_digest),
  credential_generation bigint NOT NULL,
  scope text NOT NULL CHECK (scope IN ('local', 'global')),
  access_token_ciphertext text NOT NULL CHECK (octet_length(access_token_ciphertext) BETWEEN 1 AND 16384),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'completed', 'failed')),
  claim_id uuid,
  claim_deadline timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 8),
  next_attempt_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (cookie_digest, credential_generation, scope)
);
CREATE INDEX revocation_ready_idx ON app_auth.revocation_intents (next_attempt_at, id)
  WHERE state IN ('pending', 'claimed');

CREATE TABLE app_auth.pending_entries (
  digest text PRIMARY KEY CHECK (digest ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK (kind IN ('invite', 'recovery')),
  token_ciphertext text NOT NULL CHECK (octet_length(token_ciphertext) BETWEEN 1 AND 16384),
  state text NOT NULL DEFAULT 'staged'
    CHECK (state IN ('staged', 'verifying', 'password_pending', 'completed', 'uncertain')),
  expires_at timestamptz NOT NULL DEFAULT statement_timestamp() + interval '10 minutes',
  claim_id uuid,
  claim_deadline timestamptz,
  user_id uuid,
  auth_session_id uuid,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  access_expires_at timestamptz
);
CREATE TABLE app_auth.rate_limits (
  kind text NOT NULL CHECK (kind IN ('email', 'ip')),
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 31),
  PRIMARY KEY (kind, digest)
);
CREATE INDEX rate_limit_expiry_idx ON app_auth.rate_limits (window_start);
REVOKE ALL ON ALL TABLES IN SCHEMA app_auth FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_auth FROM PUBLIC;
