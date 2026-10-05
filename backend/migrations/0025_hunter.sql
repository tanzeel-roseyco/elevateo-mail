-- AIDEV-NOTE: One encrypted optional enrichment key per owner; tombstones preserve replacement CAS.
CREATE TABLE hunter_credentials (
 owner TEXT PRIMARY KEY REFERENCES users(id), sealed TEXT,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1 AND revision<=9007199254740991)
);
-- Rollback requires approval to discard stored credentials: DROP TABLE hunter_credentials;
