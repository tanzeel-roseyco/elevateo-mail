# frozen_string_literal: true

require_relative "collaboration_database_helper"

# AIDEV-NOTE: Constraint probes use fixture authority; runtime RLS and permissions have separate actual-login tests.
class CollaborationSchemaTest < CollaborationDatabaseCase
  PARTS = File.expand_path("../../db/be02_collaboration", __dir__)

  def test_composite_relations_and_bounded_persisted_state
    other_box = mailbox
    assert_raises(PG::ForeignKeyViolation) { insert_note(box: other_box) }
    assert_raises(PG::ForeignKeyViolation) { insert_note(org: SecureRandom.uuid) }
    assert_raises(PG::ForeignKeyViolation) { insert_assignment(box: other_box) }
    assert_raises(PG::ForeignKeyViolation) { insert_assignment(org: SecureRandom.uuid) }
    ["", "x" * 4097].each { |text| assert_raises(PG::CheckViolation) { insert_note(body: text) } }
    assert_raises(PG::CheckViolation) { insert_note(version: 2) }
    assert_raises(PG::CheckViolation) { insert_note(time: "infinity") }
    assert_raises(PG::CheckViolation) { insert_assignment(target: @user) }
    assert_raises(PG::CheckViolation) { insert_assignment(version: 1) }
    assert_raises(PG::CheckViolation) { insert_assignment(version: -1) }
    assert_raises(PG::CheckViolation) { insert_assignment(version: 1, time: "infinity") }
    state(true)
    assert_raises(PG::CheckViolation) { @admin.exec("UPDATE app.thread_read_states SET read_state_version = 0") }
  end

  def test_folder_star_schema_policy_constraints_and_grants
    columns = @admin.exec(<<~SQL).map { |row| row.fetch("column_name") }
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'app' AND table_name = 'threads'
         AND column_name IN ('folder','snoozed_until','folder_version','folder_updated_at')
    SQL
    assert_equal %w[folder folder_updated_at folder_version snoozed_until], columns.sort
    star_columns = @admin.exec(<<~SQL).map { |row| row.values_at("column_name", "is_nullable", "column_default") }
      SELECT column_name, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema = 'app' AND table_name = 'thread_stars'
       ORDER BY ordinal_position
    SQL
    assert_equal [
      ["organization_id", "NO", nil], ["mailbox_id", "NO", nil], ["thread_id", "NO", nil],
      ["user_id", "NO", nil], ["starred", "NO", "false"], ["star_version", "NO", "0"],
      ["updated_at", "NO", "clock_timestamp()"]
    ], star_columns
    constraints = @admin.exec(<<~SQL).to_a
      SELECT contype, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
       WHERE conrelid = 'app.thread_stars'::regclass
    SQL
    assert_equal({ "c" => 1, "f" => 2, "p" => 1 }, constraints.map { |row| row.fetch("contype") }.tally)
    assert(constraints.any? { |row| row.fetch("definition").include?("star_version >= 0") })
    primary = constraints.select { |row| row.fetch("contype") == "p" }.map { |row| row.fetch("definition") }
    assert_equal ["PRIMARY KEY (organization_id, mailbox_id, thread_id, user_id)"], primary
    foreign = constraints.select { |row| row.fetch("contype") == "f" }.map { |row| row.fetch("definition") }
    assert_includes foreign,
      "FOREIGN KEY (organization_id, mailbox_id, thread_id) " \
      "REFERENCES app.threads(organization_id, mailbox_id, id) ON DELETE CASCADE"
    assert_includes foreign,
      "FOREIGN KEY (organization_id, user_id) " \
      "REFERENCES app.organization_memberships(organization_id, user_id) ON DELETE CASCADE"
    actor_index = @admin.exec(<<~SQL).getvalue(0, 0)
      SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'app' AND tablename = 'thread_stars' AND indexname = 'thread_stars_actor'
    SQL
    assert_includes actor_index, "(organization_id, user_id, mailbox_id, thread_id)"
    policy = @admin.exec("SELECT policyname FROM pg_policies WHERE schemaname='app' AND tablename='thread_stars'").column_values(0)
    assert_equal ["own_visible_thread_star"], policy
    assert_equal "t", @admin.exec("SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='app.thread_stars'::regclass").getvalue(0, 0)
    assert_equal "t", @admin.exec("SELECT has_column_privilege('elevateo_app_read','app.threads','folder','SELECT')").getvalue(0, 0)
    assert_equal "t", @admin.exec("SELECT has_column_privilege('elevateo_api','app.threads','folder_version','SELECT')").getvalue(0, 0)
    assert_equal "t", @admin.exec("SELECT has_column_privilege('elevateo_api','app.threads','folder','UPDATE')").getvalue(0, 0)
    assert_equal "t", @admin.exec("SELECT has_column_privilege('elevateo_api','app.thread_stars','star_version','SELECT')").getvalue(0, 0)
    %w[organization_id mailbox_id thread_id user_id starred].each do |column|
      assert_equal "t", @admin.exec_params(
        "SELECT has_column_privilege('elevateo_app_read','app.thread_stars',$1,'SELECT')", [column]
      ).getvalue(0, 0)
    end
    %w[star_version updated_at].each do |column|
      assert_equal "f", @admin.exec_params(
        "SELECT has_column_privilege('elevateo_app_read','app.thread_stars',$1,'SELECT')", [column]
      ).getvalue(0, 0)
    end
    assert_equal "f", @admin.exec("SELECT has_column_privilege('elevateo_api','app.threads','subject','UPDATE')").getvalue(0, 0)
    assert_raises(PG::CheckViolation) { @admin.exec_params("UPDATE app.threads SET folder = $1 WHERE id = $2", ["junk", @thread]) }
    assert_raises(PG::CheckViolation) { @admin.exec_params("UPDATE app.threads SET snoozed_until = $1 WHERE id = $2", ["infinity", @thread]) }
  end

  def test_scoped_down_preserves_b_states_and_rollback_restores_all_d_data
    state(true)
    state(false)
    assignment(@user, 0)
    note(SecureRandom.uuid)
    before = snapshot_rows
    @admin.exec("BEGIN")
    @admin.exec(File.read(File.join(PARTS, "down.sql")))
    @admin.exec("RESET ROLE")
    assert_nil @admin.exec("SELECT to_regclass('app.thread_notes')").getvalue(0, 0)
    assert_nil @admin.exec("SELECT to_regclass('app.thread_assignments')").getvalue(0, 0)
    assert_equal "f", @admin.exec("SELECT is_read FROM app.thread_read_states").getvalue(0, 0)
    refute_nil @admin.exec("SELECT to_regclass('app.drafts')").getvalue(0, 0)
    refute_nil @admin.exec("SELECT to_regclass('app.mailbox_membership_revisions')").getvalue(0, 0)
    assert_equal "f", @admin.exec("SELECT has_column_privilege('elevateo_api', 'app.thread_read_states', 'is_read', 'UPDATE')").getvalue(0, 0)
    %w[tables policies target_reader].each { |part| @admin.exec(File.read(File.join(PARTS, "#{part}.sql"))) }
    @admin.exec("RESET ROLE")
    # AIDEV-NOTE: Reapplying D assigns version 1 to existing B rows without rewriting their boolean or timestamp.
    restored = @admin.exec("SELECT is_read, read_state_version, updated_at::text FROM app.thread_read_states").first
    assert_equal ["f", "1"], restored.values_at("is_read", "read_state_version")
    assert_equal(JSON.parse(before).fetch("states").first.fetch("updated_at"),
      @admin.exec("SELECT to_jsonb(updated_at)::text FROM app.thread_read_states").getvalue(0, 0).then { |value| JSON.parse(value) })
    assert_equal "t", @admin.exec("SELECT has_column_privilege('elevateo_api', 'app.thread_read_states', 'is_read', 'UPDATE')").getvalue(0, 0)
    refute_nil @admin.exec("SELECT to_regprocedure('app_auth.collaboration_reader(text,uuid,uuid)')").getvalue(0, 0)
    @admin.exec("ROLLBACK")
    assert_equal before, snapshot_rows
    assert_equal 2, JSON.parse(state(false).json).fetch("read_state_version")
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end

  private

  def insert_note(org: @org, box: @box, body: "body", version: 1, time: "2026-10-12T00:00:00Z")
    @admin.exec_params(<<~SQL, [org, box, @thread, SecureRandom.uuid, @user, body, version, time])
      INSERT INTO app.thread_notes(organization_id,mailbox_id,thread_id,id,author_id,body_text,version,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    SQL
  end

  def insert_assignment(org: @org, box: @box, target: nil, version: 0, time: nil)
    @admin.exec_params(<<~SQL, [org, box, @thread, target, version, time])
      INSERT INTO app.thread_assignments(organization_id,mailbox_id,thread_id,assignee_id,assignment_version,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6)
    SQL
  end

  def snapshot_rows
    @admin.exec_params(<<~SQL, [@org]).getvalue(0, 0)
      SELECT jsonb_build_object(
        'states', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.thread_id,s.user_id) FROM app.thread_read_states s WHERE organization_id = $1),
        'assignments', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.thread_id) FROM app.thread_assignments a WHERE organization_id = $1),
        'notes', (SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM app.thread_notes n WHERE organization_id = $1))::text
    SQL
  end
end
