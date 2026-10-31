# frozen_string_literal: true

require "minitest/autorun"
require "pg"
require "securerandom"

# AIDEV-NOTE: Exercise actual migration SQL inside rollback-only DDL; never leave the shared test schema downgraded.
class SuppressionMigrationDatabaseTest < Minitest::Test
  SQL_DIRECTORY = File.expand_path("../../db/canonical_delivery_suppressions", __dir__)

  def setup
    @db = PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
    raise "wrong disposable database" unless @db.db == ENV.fetch("BE02_TASK_DATABASE_NAME")

    @db.exec("BEGIN")
    @db.exec(File.read(File.join(SQL_DIRECTORY, "down.sql")))
    @org = SecureRandom.uuid
    @db.exec_params("INSERT INTO app.organizations(id,name) VALUES($1,'Suppression migration fixture')", [@org])
    @db.exec_params("INSERT INTO app_send_private.organization_policy VALUES($1,1,clock_timestamp())", [@org])
  end

  def teardown
    @db&.exec("ROLLBACK")
    @db&.close
  end

  def insert_recipient(address)
    @db.exec_params("INSERT INTO app_send_private.recipient_suppressions VALUES($1,$2,'2026-01-01T00:00:00Z')", [@org, address])
  end

  def insert_campaign(address, reason)
    @db.exec_params("INSERT INTO app.campaign_suppressions(organization_id,email,reason) VALUES($1,$2,$3)", [@org, address, reason])
  end

  def rows(table)
    @db.exec_params("SELECT * FROM #{table} WHERE organization_id=$1 ORDER BY 2", [@org]).to_a
  end

  def assert_collision_preserves_rows(table, message)
    before = rows(table)
    @db.exec("SAVEPOINT migration_attempt")
    error = assert_raises(PG::RaiseException) { @db.exec(File.read(File.join(SQL_DIRECTORY, "up.sql"))) }
    assert_includes error.message, message
    @db.exec("ROLLBACK TO SAVEPOINT migration_attempt")
    assert_equal before, rows(table)
  end

  def test_recipient_collision_fails_loudly_without_deleting_evidence
    insert_recipient("Recipient@example.invalid")
    insert_recipient("recipient@example.invalid")
    assert_collision_preserves_rows("app_send_private.recipient_suppressions", "recipient suppression normalization collision")
  end

  def test_campaign_collision_fails_loudly_without_merging_distinct_reasons
    insert_campaign("Recipient@example.invalid", "unsubscribe")
    insert_campaign("recipient@example.invalid", "bounce")
    assert_collision_preserves_rows("app.campaign_suppressions", "campaign suppression normalization collision")
  end

  def test_normalization_preserves_every_nonidentity_field_and_rollback_keeps_rows
    insert_recipient("Recipient@EXAMPLE.invalid")
    insert_campaign("Recipient@EXAMPLE.invalid", "bounce")
    before_recipient = rows("app_send_private.recipient_suppressions").first
    before_campaign = rows("app.campaign_suppressions").first
    @db.exec(File.read(File.join(SQL_DIRECTORY, "up.sql")))
    assert_equal before_recipient.merge("canonical_address" => "recipient@example.invalid"), rows("app_send_private.recipient_suppressions").first
    assert_equal before_campaign.merge("email" => "recipient@example.invalid"), rows("app.campaign_suppressions").first
    @db.exec(File.read(File.join(SQL_DIRECTORY, "down.sql")))
    assert_equal 1, rows("app_send_private.recipient_suppressions").length
    assert_equal 1, rows("app.campaign_suppressions").length
  end
end
