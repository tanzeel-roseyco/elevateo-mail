# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../config/environment"
require_relative "../../db/migrate/20261013000008_create_organization_access"
require_relative "../../db/migrate/20261013000009_create_campaign_foundation"
require_relative "../../db/migrate/20261013000016_create_outreach_sequences"

# AIDEV-NOTE: Exercise actual rollback DDL in a disposable transaction, including the preserved API security boundary.
class OrganizationAccessMigrationTest < Minitest::Test
  SIGNATURE = "app.change_mailbox_membership(text,uuid,uuid,integer,boolean,boolean,boolean,boolean)"

  def test_rollback_restores_legacy_body_without_recreating_identity_or_grants
    connection = ActiveRecord::Base.connection
    assert_equal ["elevateo_migrator", ENV.fetch("BE02_TASK_DATABASE_NAME")],
      connection.select_rows("SELECT session_user,current_database()").first
    before = snapshot(connection)
    assert_equal ["elevateo_owner", "true", "true", "false", "false", "false"], before[1, 6]
    assert_includes before.last, "app.mailbox_security"
    connection.transaction do
      # AIDEV-NOTE: Reverse dependent empty campaign policies first; the outer rollback restores all fixture tables.
      CreateOutreachSequences.new.down
      CreateCampaignFoundation.new.down
      migration = CreateOrganizationAccess.new
      migration.down
      rolled_back = snapshot(connection)
      assert_equal before[0, 7], rolled_back[0, 7], "replacement must preserve identity, owner and grants"
      baseline = File.read(File.expand_path("../../db/be02_memberships/mutation.sql", __dir__))
      assert_equal baseline.match(/\$\$(.*)\$\$/m)[1], rolled_back.last
      assert_nil connection.select_value("SELECT to_regclass('app.organization_access')")
      assert_invalid_input_rejected(connection)
      migration.up
      assert_equal before, snapshot(connection)
      assert_invalid_input_rejected(connection)
      raise ActiveRecord::Rollback
    end
    assert_equal before, snapshot(connection)
  end

  private

  def assert_invalid_input_rejected(connection)
    # AIDEV-NOTE: Recover the expected SQL failure within a savepoint, so the outer migration transaction stays usable.
    error = assert_raises(ActiveRecord::StatementInvalid) do
      connection.transaction(requires_new: true) do
        connection.execute("SELECT app.change_mailbox_membership(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)")
      end
    end
    assert_instance_of PG::InvalidParameterValue, error.cause
    assert_equal "elevateo_owner", connection.select_value("SELECT current_user")
  end

  def snapshot(connection)
    connection.select_rows(<<~SQL).first
      SELECT p.oid::text,p.proowner::regrole::text,p.prosecdef::text,
        has_function_privilege('elevateo_api',p.oid,'EXECUTE')::text,
        has_function_privilege('elevateo_worker',p.oid,'EXECUTE')::text,
        has_function_privilege('elevateo_app_read',p.oid,'EXECUTE')::text,
        EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
          WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')::text,p.prosrc
      FROM pg_proc p WHERE p.oid=to_regprocedure('#{SIGNATURE}')
    SQL
  end
end
