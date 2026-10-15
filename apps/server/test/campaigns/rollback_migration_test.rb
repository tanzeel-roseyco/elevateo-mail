# frozen_string_literal: true

require "minitest/autorun"
require "pg"
require "securerandom"
require_relative "../../config/environment"
require_relative "../../db/migrate/20261013000009_create_campaign_foundation"
require_relative "../../db/migrate/20261013000016_create_outreach_sequences"

# AIDEV-NOTE: Real owner DDL runs only in a disposable database; no API bypass or production fixtures are used.
class CampaignRollbackMigrationTest < Minitest::Test
  FOUNDATION = %w[campaign_mutations campaign_suppressions campaign_accounts campaign_consent_events campaign_leads campaigns].freeze

  def setup
    @connection = ActiveRecord::Base.connection
    database = ENV.fetch("BE02_TASK_DATABASE_NAME")
    refute_empty database
    assert_equal ["elevateo_migrator", database],
      @connection.select_rows("SELECT session_user,current_database()").first
    @admin = PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
    assert_equal ["supabase_admin", database], @admin.exec("SELECT session_user,current_database()").values.first
    @admin.exec("SET statement_timeout='3s'; SET lock_timeout='1s'")
    @org, @campaign, @sequence = Array.new(3) { SecureRandom.uuid }
  end

  def teardown
    return unless @admin && !@admin.finished?

    if @org
      @admin.exec_params("DELETE FROM app.campaign_sequences WHERE organization_id=$1", [@org])
      @admin.exec_params("DELETE FROM app.campaigns WHERE organization_id=$1", [@org])
      @admin.exec_params("DELETE FROM app.organizations WHERE id=$1", [@org])
    end
  ensure
    @admin&.close unless @admin&.finished?
  end

  def test_empty_sequences_reverse_and_reapply_with_security_unchanged
    tables = CreateOutreachSequences::TABLES
    before = snapshot(tables)
    assert_forced(before, tables.length)
    @connection.transaction do
      migration = CreateOutreachSequences.new
      migration.down
      assert_empty snapshot(tables)
      migration.up
      assert_equal before, snapshot(tables)
      raise ActiveRecord::Rollback
    end
    assert_equal before, snapshot(tables)
  end

  def test_populated_sequence_refusal_restores_force_even_when_caller_rescues
    seed_campaign
    @admin.exec_params(<<~SQL, [@sequence, @org, @campaign])
      INSERT INTO app.campaign_sequences(id,organization_id,campaign_id,status,timezone,version)
      VALUES ($1,$2,$3,'draft','UTC',1)
    SQL
    assert_refusal(CreateOutreachSequences.new, CreateOutreachSequences::TABLES, "sequence draft contains records")
    assert_equal "1", @admin.exec_params("SELECT count(*) FROM app.campaign_sequences WHERE id=$1", [@sequence]).getvalue(0, 0)
  end

  def test_populated_campaign_refusal_restores_force_even_when_caller_rescues
    seed_campaign
    assert_refusal(CreateCampaignFoundation.new, FOUNDATION, "campaign foundation contains records")
    assert_equal "1", @admin.exec_params("SELECT count(*) FROM app.campaigns WHERE id=$1", [@campaign]).getvalue(0, 0)
  end

  def test_failed_empty_drop_restores_force_and_leaves_outer_transaction_usable
    tables = CreateOutreachSequences::TABLES
    before = snapshot(tables)
    assert_forced(before, tables.length)
    @connection.transaction do
      # AIDEV-NOTE: A dependent view forces DROP to fail after the empty guard, exercising savepoint error recovery.
      @connection.execute("CREATE VIEW app.rollback_test_sequence_view AS SELECT id FROM app.campaign_sequences")
      error = assert_raises(ActiveRecord::StatementInvalid) { CreateOutreachSequences.new.down }
      assert_instance_of PG::DependentObjectsStillExist, error.cause
      assert_equal before, snapshot(tables)
      assert_equal 1, @connection.select_value("SELECT 1")
      raise ActiveRecord::Rollback
    end
    assert_equal before, snapshot(tables)
    assert_nil @connection.select_value("SELECT to_regclass('app.rollback_test_sequence_view')")
  end

  private

  def seed_campaign
    @admin.exec_params("INSERT INTO app.organizations(id,name) VALUES ($1,'Disposable rollback fixture')", [@org])
    @admin.exec_params(<<~SQL, [@campaign, @org, SecureRandom.uuid])
      INSERT INTO app.campaigns(id,organization_id,operation_id,name,status,creation_fingerprint)
      VALUES ($1,$2,$3,'Preserved campaign','draft',repeat('a',64))
    SQL
  end

  def assert_refusal(migration, tables, expected_message)
    before = snapshot(tables)
    assert_forced(before, tables.length)
    @connection.transaction do
      error = assert_raises(ActiveRecord::IrreversibleMigration) { migration.down }
      assert_includes error.message, expected_message
      assert_equal before, snapshot(tables), "refusal must restore FORCE before the caller resumes"
      assert_equal 1, @connection.select_value("SELECT 1")
      raise ActiveRecord::Rollback
    end
    assert_equal before, snapshot(tables)
  end

  def snapshot(tables)
    quoted = tables.map { |table| @connection.quote(table) }.join(",")
    @connection.select_rows(<<~SQL)
      SELECT relname,relrowsecurity::text,relforcerowsecurity::text,relowner::regrole::text,relacl::text
      FROM pg_class WHERE relnamespace='app'::regnamespace AND relname IN (#{quoted}) ORDER BY relname
    SQL
  end

  def assert_forced(rows, expected_count)
    assert_equal expected_count, rows.length
    assert rows.all? { |row| row[1, 3] == ["true", "true", "elevateo_owner"] }
  end
end
