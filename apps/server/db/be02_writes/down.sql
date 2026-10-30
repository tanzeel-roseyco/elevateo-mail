DROP FUNCTION app_auth.assert_protected_write(text,uuid);
DROP FUNCTION app_auth.begin_protected_write(text,uuid,uuid,uuid[]);
ALTER TABLE app_auth.sessions DROP CONSTRAINT protected_write_marker_pair,
  DROP COLUMN write_guard_users, DROP COLUMN write_transaction;
