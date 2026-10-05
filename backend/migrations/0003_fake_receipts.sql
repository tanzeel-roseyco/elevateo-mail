-- AIDEV-NOTE: Fake receipts are isolated fixtures, never evidence of external delivery.
CREATE TABLE fake_provider_receipts (
 owner TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, revision TEXT NOT NULL, provider_id TEXT NOT NULL,
 PRIMARY KEY(owner,id)
);
