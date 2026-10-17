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
    assert_equal JSON.parse(before).fetch("states").first.fetch("updated_at"),
      @admin.exec("SELECT to_jsonb(updated_at)::text FROM app.thread_read_states").getvalue(0, 0).then { |value| JSON.parse(value) }
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
