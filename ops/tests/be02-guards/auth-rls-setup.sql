-- AIDEV-NOTE: Only run.sh's disposable database uses this synthetic vendor-RLS setup before Auth bootstrap.
BEGIN;
ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;
INSERT INTO auth.sessions (id, user_id, created_at, not_after, private_token) VALUES
  ('66666666-6666-4666-8666-666666666666', '22222222-2222-4222-8222-222222222222',
    statement_timestamp(), statement_timestamp() + interval '6 hours', 'foreign-fixture'),
  ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111',
    statement_timestamp(), NULL, 'second-session-fixture');
COMMIT;
