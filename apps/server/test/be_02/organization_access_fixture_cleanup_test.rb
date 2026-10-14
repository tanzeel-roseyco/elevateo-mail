# frozen_string_literal: true

require_relative "mailbox_membership_database_helper"
require_relative "draft_database_test_helper"

# AIDEV-NOTE: Manual teardown lets an independent login inspect rows and the fixture lease before Minitest exits.
module ClosedOrganizationFixtureAssertions
  def teardown
    super unless @manual_cleanup_completed
  end

  def assert_closed_connection_cleanup
    owned_org, owned_box = @org, @box
    teardown
    @manual_cleanup_completed = true
    assert_fixture_absent(owned_org, owned_box)
  end

  def assert_fixture_absent(owned_org, owned_box)
    verifier = connect("BE02_ADMIN_DATABASE_URL", "supabase_admin")
    assert_equal "0", verifier.exec_params("SELECT count(*) FROM app.organizations WHERE id=$1", [owned_org]).getvalue(0, 0)
    assert_equal "0", verifier.exec_params("SELECT count(*) FROM app.mailboxes WHERE id=$1", [owned_box]).getvalue(0, 0)
    assert_equal "0", verifier.exec_params("SELECT count(*) FROM app_drafts_private.operations WHERE organization_id=$1", [owned_org]).getvalue(0, 0)
    assert_equal "t", verifier.exec_params("SELECT pg_try_advisory_lock($1::bigint)", [SessionDatabaseTestCase::FIXTURE_LOCK]).getvalue(0, 0)
    verifier.exec_params("SELECT pg_advisory_unlock($1::bigint)", [SessionDatabaseTestCase::FIXTURE_LOCK])
  ensure
    verifier&.finish
  end
end

class ClosedMembershipFixtureCleanupTest < MailboxMembershipDatabaseCase
  include ClosedOrganizationFixtureAssertions

  def test_closed_api_connection_still_releases_owned_fixture
    @api.finish
    assert_closed_connection_cleanup
  end

  def test_closed_admin_connection_reacquires_lease_and_releases_fixture
    @admin.finish
    assert_closed_connection_cleanup
  end

  def test_revision_cleanup_failure_preserves_original_and_still_cleans_fixture
    owned_org, owned_box = @org, @box
    original = RuntimeError.new("injected revision cleanup failure")
    define_singleton_method(:prepare_organization_fixture_cleanup) { raise original }
    assert_same original, assert_raises(RuntimeError) { teardown }
    @manual_cleanup_completed = true
    assert_fixture_absent(owned_org, owned_box)
  end
end

class ClosedDraftFixtureCleanupTest < DraftDatabaseTestCase
  include ClosedOrganizationFixtureAssertions

  def test_closed_admin_connection_reacquires_lease_and_releases_fixture
    @admin.finish
    assert_closed_connection_cleanup
  end

  def test_save_preserves_original_error_after_api_connection_closes
    original = RuntimeError.new("injected draft save failure")
    define_singleton_method(:save_sql) do |*_args, **_kwargs|
      @api.finish
      raise original
    end
    assert_same original, assert_raises(RuntimeError) { save(payload) }
    assert_closed_connection_cleanup
  end
end
