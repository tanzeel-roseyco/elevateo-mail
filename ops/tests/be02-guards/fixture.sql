-- AIDEV-NOTE: Minimal Auth/app catalog fixture; real Auth and Rails behavior stays in root's integration suite.
BEGIN;
CREATE SCHEMA auth;
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
CREATE TABLE auth.sessions (
  id uuid PRIMARY KEY, user_id uuid NOT NULL, created_at timestamptz NOT NULL,
  not_after timestamptz, private_token text
);
CREATE TABLE auth.guard_other (id bigint);
CREATE SEQUENCE auth.guard_sequence;
REVOKE ALL ON ALL TABLES IN SCHEMA auth FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA auth FROM PUBLIC;
INSERT INTO auth.sessions VALUES ('33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111', statement_timestamp(), NULL, 'fixture');
SET LOCAL ROLE elevateo_owner;
CREATE TABLE app.organizations (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE app.organization_memberships (organization_id uuid NOT NULL, user_id uuid NOT NULL);
GRANT USAGE ON SCHEMA app TO elevateo_session_owner;
GRANT SELECT ON app.organization_memberships TO elevateo_session_owner;
GRANT SELECT (id, name) ON app.organizations TO elevateo_session_owner;
INSERT INTO app.organizations VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Own organization'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Foreign organization');
INSERT INTO app.organization_memberships VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222');
-- AIDEV-NOTE: Mirror the private-owner policies; runtime policy uses its separate app context, never the private GUC.
ALTER TABLE app.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.organization_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE app.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY verified_session_membership ON app.organization_memberships
  FOR SELECT TO elevateo_session_owner USING (
    user_id = NULLIF(current_setting('app_auth.verified_user_id', true), '')::uuid);
CREATE POLICY verified_session_organization ON app.organizations
  FOR SELECT TO elevateo_session_owner USING (EXISTS (
    SELECT 1 FROM app.organization_memberships m WHERE m.organization_id = organizations.id
      AND m.user_id = NULLIF(current_setting('app_auth.verified_user_id', true), '')::uuid));
CREATE POLICY own_org_membership ON app.organization_memberships FOR SELECT TO elevateo_app_read USING (
  user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  AND organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
GRANT USAGE ON SCHEMA app TO elevateo_app_read;
GRANT SELECT ON app.organization_memberships TO elevateo_app_read;
GRANT elevateo_app_read TO elevateo_api WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
COMMIT;
