-- AIDEV-NOTE: App identities are distinct from mailbox grants; email never links application accounts.
CREATE TABLE app_identities (
 issuer TEXT NOT NULL, subject TEXT NOT NULL, owner TEXT NOT NULL UNIQUE REFERENCES users(id),
 PRIMARY KEY(issuer,subject)
);
CREATE TABLE app_login (
 state_hash TEXT PRIMARY KEY, nonce_hash TEXT NOT NULL UNIQUE, sealed TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX app_login_expiry ON app_login(expires_at);
-- Rollback: DROP TABLE app_login; DROP TABLE app_identities; existing users/sessions remain intact.
