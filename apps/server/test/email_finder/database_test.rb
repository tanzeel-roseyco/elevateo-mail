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
    @admin.exec_params(<<~SQL, [@org, SecureRandom.uuid])
      WITH job AS (INSERT INTO app.email_finder_jobs(organization_id,user_id,kind,total)
        VALUES($1,$2,'verify',1) RETURNING id,organization_id)
      INSERT INTO app.email_finder_job_items(organization_id,job_id,row_number,input)
        SELECT organization_id,id,1,'{}' FROM job
    SQL
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

  def test_work_rows_preserve_order_and_only_worker_can_mutate_them
    id = nil
    inputs = [{ "email" => "first@example.com" }, { "email" => "second@example.com" }]
    finder_scope(write: true) { |repo| id = repo.enqueue(@org, @user, "verify", inputs).fetch("id") }
    finder_scope do |repo|
      items = repo.job(@org, @user, id).fetch("items")
      assert_equal(inputs, items.map { |item| item.fetch("input") })
      assert_equal([1, 2], items.map { |item| item.fetch("row") })
    end
    assert_raises(ActiveRecord::StatementInvalid) do
      finder_scope(write: true) { |repo| repo.rows("UPDATE app.email_finder_job_items SET work='{}' WHERE job_id=$1::uuid", [id]) }
    end
    assert_raises(PG::ForeignKeyViolation) do
      @admin.exec_params("INSERT INTO app.email_finder_job_items(organization_id,job_id,row_number,input) VALUES($1,$2,1,'{}')", [@org, SecureRandom.uuid])
    end
    assert_raises(PG::CheckViolation) do
      @admin.exec_params("INSERT INTO app.email_finder_job_items(organization_id,job_id,row_number,input) VALUES($1,$2,5001,'{}')", [@org, id])
    end
  end

  def test_people_email_is_canonical_and_domain_is_not_stored
    assert_raises(PG::CheckViolation) do
      @admin.exec_params("INSERT INTO app.email_finder_people(organization_id,email,name) VALUES($1,'Jane@Example.com','jane')", [@org])
    end
    assert_raises(PG::CheckViolation) do
      @admin.exec_params("INSERT INTO app.email_finder_people(organization_id,email,name,patterns) VALUES($1,'jane@example.com','jane','[\"unknown-pattern\"]')", [@org])
    end
    assert_raises(PG::CheckViolation) do
      @admin.exec_params("INSERT INTO app.email_finder_domains(organization_id,domain) VALUES($1,'bad..example.com')", [@org])
    end
    @admin.exec_params("INSERT INTO app.email_finder_people(organization_id,email,name) VALUES($1,'jane@example.com','jane')", [@org])
    assert_equal "example.com", @admin.exec_params("SELECT split_part(email,'@',2) FROM app.email_finder_people WHERE organization_id=$1", [@org]).getvalue(0, 0)
    assert_equal "0", @admin.exec("SELECT count(*) FROM information_schema.columns WHERE table_schema='app' AND table_name='email_finder_people' AND column_name='domain'").getvalue(0, 0)
  end

  def test_progress_cannot_drift_from_child_results
    id = nil
    finder_scope(write: true) { |repo| id = repo.enqueue(@org, @user, "verify", [{ "email" => "jane@example.com" }]).fetch("id") }
    assert_raises(PG::CheckViolation) do
      @admin.exec_params("UPDATE app.email_finder_jobs SET completed=1 WHERE id=$1", [id])
    end
    assert_raises(PG::CheckViolation) do
      @admin.exec_params("DELETE FROM app.email_finder_job_items WHERE job_id=$1", [id])
    end
    @admin.exec_params(<<~SQL, [id])
      WITH finished AS (UPDATE app.email_finder_job_items SET result='{}' WHERE job_id=$1 RETURNING job_id)
      UPDATE app.email_finder_jobs SET completed=1,status='completed' WHERE id IN (SELECT job_id FROM finished)
    SQL
    assert_equal "1", @admin.exec_params("SELECT completed FROM app.email_finder_jobs WHERE id=$1", [id]).getvalue(0, 0)
  end

  def test_maximum_batch_commits_all_work_rows
    id = nil
    inputs = Array.new(5000) { |index| { "email" => "person#{index}@example.com" } }
    finder_scope(write: true) { |repo| id = repo.enqueue(@org, @user, "verify", inputs).fetch("id") }
    assert_equal "5000", @admin.exec_params("SELECT count(*) FROM app.email_finder_job_items WHERE job_id=$1", [id]).getvalue(0, 0)
    finder_scope { |repo| assert_equal 5000, repo.job(@org, @user, id).fetch("items").size }
  end

  def test_progress_checks_reject_stale_transaction_snapshots
    id = nil
    finder_scope(write: true) { |repo| id = repo.enqueue(@org, @user, "verify", [{ "email" => "jane@example.com" }]).fetch("id") }
    @admin.exec("BEGIN ISOLATION LEVEL REPEATABLE READ")
    @admin.exec_params("UPDATE app.email_finder_jobs SET completed=completed WHERE id=$1", [id])
    assert_raises(PG::ActiveSqlTransaction) { @admin.exec("COMMIT") }
  ensure
    @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
  end

  def test_normalization_rollback_preserves_results_and_inflight_work
    id = nil
    inputs = [{ "email" => "first@example.com" }, { "email" => "second@example.com" }]
    finder_scope(write: true) { |repo| id = repo.enqueue(@org, @user, "verify", inputs).fetch("id") }
    @admin.exec_params(<<~SQL, [id])
      WITH finished AS (UPDATE app.email_finder_job_items SET result='{"status":"invalid"}'
        WHERE job_id=$1 AND row_number=1 RETURNING job_id)
      UPDATE app.email_finder_jobs SET completed=1,status='running' WHERE id IN (SELECT job_id FROM finished)
    SQL
    @admin.exec_params("UPDATE app.email_finder_job_items SET work='{\"attempts\":2}' WHERE job_id=$1 AND row_number=2", [id])
    @admin.exec("BEGIN")
    @admin.exec(File.read(File.expand_path("../../db/migrate/normalize_email_finder/down.sql", __dir__)))
    @admin.exec("RESET ROLE")
    legacy = JSON.parse(@admin.exec_params("SELECT items FROM app.email_finder_jobs WHERE id=$1", [id]).getvalue(0, 0))
    assert_equal(inputs, legacy.map { |item| item.fetch("input") })
    assert_equal({ "status" => "invalid" }, legacy.first.fetch("result"))
    assert_equal({ "attempts" => 2 }, legacy.last.fetch("work"))
    @admin.exec(File.read(File.expand_path("../../db/migrate/normalize_email_finder/up.sql", __dir__)))
    @admin.exec("RESET ROLE")
    assert_equal '{"attempts": 2}', @admin.exec_params("SELECT work FROM app.email_finder_job_items WHERE job_id=$1 AND row_number=2", [id]).getvalue(0, 0)
  ensure
    @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
  end
end
