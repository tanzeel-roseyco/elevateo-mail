# frozen_string_literal: true

require_relative "../be_02/mailbox_membership_database_helper"
require_relative "../../lib/elevateo/email_finder/repository"

# AIDEV-NOTE: Actual API login exercises inherited auth and owner RLS; no network adapters run in this suite.
class EmailFinderDatabaseTest < MailboxMembershipDatabaseCase
  def prepare_organization_fixture_cleanup
    super
    %w[jobs domains people results suppressions].each do |table|
      @admin.exec_params("DELETE FROM app.email_finder_#{table} WHERE organization_id=$1", [@org])
    end
  end

  def finder_scope(write: false)
    scope(write: write) do |connection|
      bind = ActiveRecord::Relation::QueryAttribute.new("finder", @identity.digest, ActiveRecord::Type::String.new)
      function = write ? "app.authorize_outreach_draft_write" : "app.authorize_outreach_content_read"
      connection.exec_query("SELECT #{function}($1::text)", "Finder auth", [bind])
      connection.exec_query("SELECT set_config('app.outreach_digest',$1,true)", "Finder scope", [bind])
      yield Elevateo::EmailFinder::Repository.new(connection: connection)
    end
  end

  def test_queue_round_trip_and_suppression_redacts_completed_results
    id = nil
    finder_scope(write: true) { |repo| id = repo.enqueue(@org, @user, "verify", [{ "email" => "jane@example.com" }]).fetch("id") }
    finder_scope { |repo| assert_equal "queued", repo.job(@org, @user, id).fetch("status") }
    finder_scope(write: true) { |repo| repo.suppress(@org, "domain", "example.com") }
    finder_scope do |repo|
      item = repo.job(@org, @user, id).fetch("items").first
      assert_equal "suppressed", item.fetch("result").fetch("status")
      assert_empty item.fetch("input")
    end
  end

  def test_other_owner_job_hidden_even_when_query_has_no_owner_filter
    @admin.exec_params("INSERT INTO app.email_finder_jobs(organization_id,user_id,kind,total,items) VALUES($1,$2,'verify',1,'[]')", [@org, SecureRandom.uuid])
    finder_scope { |repo| assert_empty repo.rows("SELECT id FROM app.email_finder_jobs") }
  end

  def test_api_cannot_insert_job_for_another_owner_or_modify_global_limits
    assert_raises(ActiveRecord::StatementInvalid) do
      finder_scope(write: true) { |repo| repo.enqueue(@org, SecureRandom.uuid, "verify", [{ "email" => "jane@example.com" }]) }
    end
    assert_raises(ActiveRecord::StatementInvalid) do
      finder_scope(write: true) { |repo| repo.state_put("smtp", { "used" => 0 }) }
    end
  end
end
