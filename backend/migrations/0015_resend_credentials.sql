-- AIDEV-NOTE: Separate purpose-bound storage avoids treating static API keys as expiring OAuth grants.
CREATE TABLE resend_credentials (
 owner TEXT NOT NULL REFERENCES users(id),
 id TEXT NOT NULL,
 sealed TEXT,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1 AND revision<=9007199254740991),
 PRIMARY KEY(owner,id)
);
-- Rollback only after explicit confirmation to discard stored keys: DROP TABLE resend_credentials;
