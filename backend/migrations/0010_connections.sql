-- AIDEV-NOTE: OAuth secrets are encrypted; state hashes bind a single attempt to an existing app session.
CREATE TABLE provider_credentials (
  owner TEXT NOT NULL REFERENCES users(id),
  id TEXT NOT NULL,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  sealed TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(owner,id),
  UNIQUE(owner,provider,subject)
);
CREATE TABLE connection_oauth (
  state_hash TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES users(id),
  session_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  sealed TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(owner,session_hash,provider)
);
CREATE INDEX connection_oauth_expiry ON connection_oauth(expires_at);
-- Rollback after explicitly discarding connections: DROP TABLE connection_oauth; DROP TABLE provider_credentials;
