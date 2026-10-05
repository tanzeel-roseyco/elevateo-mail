-- AIDEV-NOTE: One bounded heartbeat per job contains no user or message data.
CREATE TABLE job_health (
 name TEXT PRIMARY KEY CHECK(name IN ('dispatch','inbox','cleanup')),
 started_at INTEGER NOT NULL, run_id TEXT NOT NULL, finished_at INTEGER,
 last_success_at INTEGER, failed INTEGER NOT NULL DEFAULT 0 CHECK(failed IN (0,1))
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
-- Rollback: DROP INDEX sessions_expiry; DROP TABLE job_health;
