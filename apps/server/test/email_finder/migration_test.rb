# frozen_string_literal: true
require "minitest/autorun"
require "pg"

# AIDEV-NOTE: DDL reversal is transactional in the explicitly named disposable DB; rollback preserves fixtures.
class EmailFinderMigrationTest < Minitest::Test
  def setup
    @connection = PG.connect(ENV.fetch("BE02_MIGRATOR_DATABASE_URL"))
    database = ENV.fetch("BE02_TASK_DATABASE_NAME")
    refute_empty database
    assert_equal ["elevateo_migrator", database], @connection.exec("SELECT session_user,current_database()").values.first
    @connection.exec("SET statement_timeout='10s'; SET lock_timeout='2s'")
  end

  def teardown
    @connection.exec("ROLLBACK") if @connection && @connection.transaction_status != PG::PQTRANS_IDLE
  ensure
    @connection&.close unless @connection&.finished?
  end

  def snapshot
    tables = @connection.exec(<<~SQL).values
      SELECT relname,relrowsecurity::text,relforcerowsecurity::text,relowner::regrole::text,relacl::text
      FROM pg_class WHERE relnamespace='app'::regnamespace AND relname LIKE 'email_finder_%'
        AND relkind='r' ORDER BY relname
    SQL
    policies = @connection.exec(<<~SQL).values
      SELECT tablename,policyname,permissive,roles::text,cmd,qual,with_check
      FROM pg_policies WHERE schemaname='app' AND tablename LIKE 'email_finder_%'
      ORDER BY tablename,policyname
    SQL
    [tables, policies]
  end

  def test_reverse_reapply_restores_tables_permissions_and_policies
    before = snapshot
    assert_equal 7, before.first.length
    assert(before.first.all? { |row| row[1, 3] == ["true", "true", "elevateo_owner"] })
    @connection.exec("BEGIN")
    @connection.exec(File.read(File.expand_path("../../db/migrate/normalize_email_finder/down.sql", __dir__)))
    @connection.exec(File.read(File.expand_path("../../db/email_finder/down.sql", __dir__)))
    assert_equal [[], []], snapshot
    @connection.exec(File.read(File.expand_path("../../db/email_finder/up.sql", __dir__)))
    @connection.exec(File.read(File.expand_path("../../db/migrate/normalize_email_finder/up.sql", __dir__)))
    assert_equal before, snapshot
    @connection.exec("ROLLBACK")
    assert_equal before, snapshot
  end
end
