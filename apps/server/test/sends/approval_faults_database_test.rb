# frozen_string_literal: true

require_relative "approval_database_helper"

# AIDEV-NOTE: Admin-only fault triggers exist only in a disposable fixture and cannot be installed by runtime roles.
class SendApprovalFaultsDatabaseTest < SendDatabaseTestCase
  def test_failure_after_every_mutation_rolls_back_snapshot_job_audit_consumption_and_operation
    @admin.exec(<<~SQL)
      CREATE FUNCTION app_send_private.fixture_raise_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fixture fault' USING ERRCODE = '23514'; END $$;
    SQL
    %w[app_send_private.intents app_send_private.jobs app_send_private.audit_events app.drafts app_send_private.approval_operations].each do |table|
      event = table == "app.drafts" ? "UPDATE" : "INSERT"
      condition = table == "app.drafts" ? "WHEN (NEW.state = 'consumed')" : ""
      @admin.exec("CREATE TRIGGER fixture_raise_fault AFTER #{event} ON #{table} FOR EACH ROW #{condition} EXECUTE FUNCTION app_send_private.fixture_raise_fault()")
      begin
        assert_raises(PG::CheckViolation) { approve }
        assert_equal [0, 0, 0, 0], counts, table
        assert_equal "editable", draft_row.fetch("state"), table
        assert_equal "1", draft_row.fetch("version"), table
      ensure
        @admin.exec("DROP TRIGGER fixture_raise_fault ON #{table}")
      end
    end
    refute approve.key?("code")
    assert_equal [1, 1, 1, 1], counts
  ensure
    @admin.exec("DROP FUNCTION IF EXISTS app_send_private.fixture_raise_fault()") if @admin
  end
end
