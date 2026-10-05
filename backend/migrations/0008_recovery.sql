-- AIDEV-NOTE: Account IDs survive session rotation; immutable creation cursors avoid status-update pagination drift.
CREATE TABLE accounts(owner TEXT PRIMARY KEY REFERENCES users(id), account_id TEXT NOT NULL UNIQUE);
INSERT INTO accounts SELECT id,lower(hex(randomblob(16))) FROM users;
CREATE TRIGGER create_account AFTER INSERT ON users
BEGIN INSERT INTO accounts VALUES(NEW.id,lower(hex(randomblob(16)))); END;
ALTER TABLE send_intents ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
UPDATE send_intents SET created_at=updated_at;
CREATE TRIGGER immutable_creation BEFORE UPDATE OF created_at ON send_intents
WHEN NEW.created_at != OLD.created_at
BEGIN SELECT RAISE(ABORT,'immutable_intent'); END;
CREATE INDEX send_owner_creation ON send_intents(owner,created_at DESC,id DESC);
CREATE TABLE send_replacements(
  owner TEXT NOT NULL,
  predecessor_id TEXT NOT NULL,
  successor_id TEXT NOT NULL,
  PRIMARY KEY(owner,predecessor_id),
  UNIQUE(owner,successor_id),
  FOREIGN KEY(owner,predecessor_id) REFERENCES send_intents(owner,id),
  FOREIGN KEY(owner,successor_id) REFERENCES send_intents(owner,id)
);
