-- AIDEV-NOTE: Existing API SELECT grants/policies stay intact; explicit false capabilities confer no write authority.
CREATE TRIGGER session_org_generation AFTER INSERT OR UPDATE OR DELETE ON app.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION app_auth.bump_authorization_generation();
CREATE TRIGGER session_mailbox_member_generation AFTER INSERT OR UPDATE OR DELETE ON app.mailbox_memberships
  FOR EACH ROW EXECUTE FUNCTION app_auth.bump_authorization_generation();
CREATE TRIGGER session_mailbox_generation AFTER INSERT OR UPDATE OR DELETE ON app.mailboxes
  FOR EACH ROW EXECUTE FUNCTION app_auth.bump_authorization_generation();
