# frozen_string_literal: true

require_relative "collaboration_database_helper"

# AIDEV-NOTE: Public services run with real API claims; regressions cover identity isolation and immutable history.
class CollaborationDatabaseTest < CollaborationDatabaseCase
  def test_read_state_noop_versions_and_existing_unread_projection
    witness = foreign_witness
    untouched = witness_rows(witness)
    assert_state_fields(state(false).json, %w[read read_state_version updated_at], [false, 0, nil])
    assert_empty owned_rows("thread_read_states", user: @user)
    first = JSON.parse(state(true).json)
    assert_equal [true, 1], first.values_at("read", "read_state_version")
    assert_equal first, JSON.parse(state(true).json)
    scope(write: false) do |connection|
      before = connection.exec_query("SELECT is_read, read_state_version, updated_at FROM app.thread_read_states").to_a
      detail = JSON.parse(service(Elevateo::ThreadReads, connection).detail(thread_id: @thread, query: { "mailbox_id" => @box }))
      assert_equal false, detail.fetch("thread").fetch("unread")
      assert_equal before, connection.exec_query("SELECT is_read, read_state_version, updated_at FROM app.thread_read_states").to_a
    end
    changed = JSON.parse(state(false).json)
    assert_equal [false, 2], changed.values_at("read", "read_state_version")
    assert_equal 1, @admin.exec_params("UPDATE app.thread_read_states SET read_state_version = 2147483647 WHERE organization_id = $1 AND mailbox_id = $2 AND thread_id = $3 AND user_id = $4", [@org, @box, @thread, @user]).cmd_tuples
    maximum = owned_rows("thread_read_states", user: @user)
    result = state(false)
    assert_equal 200, result.status
    assert_state_fields(result.json, %w[read read_state_version updated_at],
      [false, 2_147_483_647, changed.fetch("updated_at")])
    assert_equal maximum, owned_rows("thread_read_states", user: @user)
    error = assert_raises(Elevateo::CollaborationError) { state(true) }
    assert_equal [503, "temporarily_unavailable"], [error.status, error.code]
    assert_equal maximum, owned_rows("thread_read_states", user: @user)
    assert_equal untouched, witness_rows(witness)
  end

  def test_assignment_cas_noop_max_and_historical_attribution
    other = add_actor
    witness = foreign_witness
    untouched = witness_rows(witness)
    initial = scope(write: false) { |c| service(Elevateo::ThreadAssignment, c).get(thread_id: @thread, query: { "mailbox_id" => @box }) }
    assert_state_fields(initial, %w[assignee_id assignment_version updated_at], [nil, 0, nil])
    assigned = assignment(other.user_id, 0)
    assert_equal 1, JSON.parse(assigned.json)["assignment_version"]
    assert_equal assigned.json, assignment(other.user_id, 1).json
    assert_equal "assignment_conflict", assert_raises(Elevateo::CollaborationError) { assignment(other.user_id, 0) }.code
    assert_equal 1, @admin.exec_params("UPDATE app.thread_assignments SET assignment_version = 2147483647 WHERE organization_id = $1 AND mailbox_id = $2 AND thread_id = $3", [@org, @box, @thread]).cmd_tuples
    maximum = owned_rows("thread_assignments")
    result = assignment(other.user_id, 2_147_483_647)
    assert_equal 200, result.status
    assert_state_fields(result.json, %w[assignee_id assignment_version updated_at],
      [other.user_id, 2_147_483_647, JSON.parse(assigned.json).fetch("updated_at")])
    assert_equal maximum, owned_rows("thread_assignments")
    error = assert_raises(Elevateo::CollaborationError) { assignment(nil, 2_147_483_647) }
    assert_equal [503, "temporarily_unavailable"], [error.status, error.code]
    assert_equal maximum, owned_rows("thread_assignments")
    assert_equal untouched, witness_rows(witness)
    member_change(other.user_id) { |c| c.exec_params("DELETE FROM app.organization_memberships WHERE organization_id = $1 AND user_id = $2", [@org, other.user_id]) }
    history = scope(write: false) { |c| service(Elevateo::ThreadAssignment, c).get(thread_id: @thread, query: { "mailbox_id" => @box }) }
    assert_equal other.user_id, JSON.parse(history)["assignee_id"]
    assert_equal "not_available", assert_raises(Elevateo::CollaborationError) { assignment(other.user_id, 0) }.code
  end

  def test_read_state_is_scoped_to_actor_even_when_both_can_read
    other = add_actor
    state(true)
    assert_state_fields(state(false, identity: other).json, %w[read read_state_version updated_at], [false, 0, nil])
    state(true, identity: other)
    state(false)
    scope(identity: other, write: false) do |connection|
      rows = connection.exec_query("SELECT user_id, is_read, read_state_version FROM app.thread_read_states").to_a
      assert_equal [{ "user_id" => other.user_id, "is_read" => true, "read_state_version" => 1 }], rows
    end
    assert_equal 2, owned_rows("thread_read_states").length
  end

  def test_concurrent_assignment_compare_and_set_has_one_winner
    other = add_actor
    actors = [@identity, other]
    results = parallel_services(2) { |index| assignment(actors[index].user_id, 0, identity: actors[index]) }
    assert_equal [200, 409], results.map(&:status).sort
    assert_equal ["assignment_conflict"], results.grep(Elevateo::CollaborationError).map(&:code)
    assert_equal ["1"], owned_rows("thread_assignments").map { |row| row.fetch("assignment_version") }
  end

  def test_note_same_actor_copies_and_other_actor_collision_are_safe
    retry_digest = SecureRandom.hex(32)
    assert_equal "ok", create(digest: retry_digest)["status"]
    retry_actor = Identity.new(user_id: @user, org_id: @org, digest: retry_digest, auth_session_id: @auth)
    id = SecureRandom.uuid
    actors = [@identity, retry_actor]
    results = parallel_services(2) { |index| note(id, identity: actors[index]) }
    assert_equal [200, 201], results.map(&:status).sort
    assert_equal 1, results.map(&:json).uniq.length
    assert_equal [id], owned_rows("thread_notes").map { |row| row.fetch("id") }
    assert_equal "operation_mismatch", assert_raises(Elevateo::CollaborationError) { note(id, body: "changed") }.code
    other = add_actor
    second_id = SecureRandom.uuid
    authors = [@identity, other]
    collision = parallel_services(2) { |index| note(second_id, identity: authors[index]) }
    assert_equal [201, 404], collision.map(&:status).sort
    assert_equal "This item is unavailable.", collision.grep(Elevateo::CollaborationError).first.message
  end

  def test_notes_current_authorization_replay_binding_and_visibility
    private_box = mailbox(visibility: "private")
    private_thread = conversation(box: private_box)
    private_member(private_box, @identity)
    id = SecureRandom.uuid
    note(id, thread: private_thread, box: private_box)
    assert_equal "operation_mismatch", assert_raises(Elevateo::CollaborationError) { note(id) }.code
    member_change(@user) { |c| c.exec_params("DELETE FROM app.mailbox_memberships WHERE mailbox_id = $1 AND user_id = $2", [private_box, @user]) }
    assert_equal "not_available", assert_raises(Elevateo::CollaborationError) { note(id) }.code
    assert_equal "not_available", assert_raises(Elevateo::CollaborationError) { note(id, thread: private_thread, box: private_box) }.code
    membership(present: false)
    scope(write: false) do |c|
      assert_equal "not_available", assert_raises(Elevateo::CollaborationError) do
        service(Elevateo::ThreadNotes, c).list(thread_id: @thread, query: { "mailbox_id" => @box })
      end.code
    end
  end

  def test_private_foreign_and_mismatched_threads_have_same_error
    private_box = mailbox(visibility: "private")
    private_thread = conversation(box: private_box)
    foreign_org = SecureRandom.uuid
    @foreign_orgs << foreign_org
    @admin.exec_params("INSERT INTO app.organizations(id, name) VALUES ($1, 'foreign fixture')", [foreign_org])
    foreign_box = mailbox(org: foreign_org)
    foreign_thread = conversation(org: foreign_org, box: foreign_box)
    readable_box = mailbox
    readable_thread = conversation(box: readable_box)
    [[@thread, @box], [readable_thread, readable_box]].each do |thread, box|
      assert_equal 200, state(false, thread: thread, box: box).status
    end
    before = %w[thread_read_states thread_assignments thread_notes].map { |table| owned_rows(table) }
    [[private_thread, private_box], [foreign_thread, foreign_box], [@thread, readable_box], [SecureRandom.uuid, @box]].each do |thread, box|
      [-> { state(true, thread: thread, box: box) }, -> { assignment(nil, 0, thread: thread, box: box) },
       -> { note(SecureRandom.uuid, thread: thread, box: box) }].each do |call|
        error = assert_raises(Elevateo::CollaborationError, &call)
        assert_equal [404, "not_available", "This item is unavailable."], [error.status, error.code, error.message]
      end
    end
    assert_equal before, %w[thread_read_states thread_assignments thread_notes].map { |table| owned_rows(table) }
    %w[thread_read_states thread_assignments thread_notes].each do |table|
      assert_empty owned_rows(table, box: readable_box, thread: @thread)
      assert_empty owned_rows(table, box: readable_box, thread: readable_thread)
    end
  end

  def test_forced_rls_immutable_notes_and_minimum_runtime_grants
    note(SecureRandom.uuid)
    %w[thread_notes thread_assignments].each do |table|
      flags = @admin.exec_params("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass", ["app.#{table}"]).first
      assert_equal({ "relrowsecurity" => "t", "relforcerowsecurity" => "t" }, flags)
      assert_raises(PG::InsufficientPrivilege) { @api.exec("DELETE FROM app.#{table}") }
      assert_raises(PG::InsufficientPrivilege) { @worker.exec("SELECT count(*) FROM app.#{table}") }
    end
    assert_raises(PG::InsufficientPrivilege) { @api.exec("UPDATE app.thread_notes SET body_text = 'changed'") }
    assert_raises(PG::InsufficientPrivilege) { @api.exec("UPDATE app.mailbox_memberships SET compose = true") }
    assert_equal "0", @api.exec("SELECT count(id) FROM app.thread_notes").getvalue(0, 0)
    other = add_actor
    allowed_id, denied_id = SecureRandom.uuid, SecureRandom.uuid
    insert = "INSERT INTO app.thread_notes(organization_id, mailbox_id, thread_id, id, author_id, body_text) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::text)"
    binds_for = lambda do |id, author|
      [@org, @box, @thread, id, author, "spoof"].map do |value|
        ActiveRecord::Relation::QueryAttribute.new("fixture", value, ActiveRecord::Type::String.new)
      end
    end
    scope { |connection| connection.exec_query(insert, "Allowed author control", binds_for.call(allowed_id, @user)) }
    assert_includes owned_rows("thread_notes").map { |row| row.fetch("id") }, allowed_id
    scope do |connection|
      error = assert_raises(ActiveRecord::StatementInvalid) do
        connection.exec_query(insert, "Denied other author", binds_for.call(denied_id, other.user_id))
      end
      assert_instance_of PG::InsufficientPrivilege, error.cause
      assert_equal "42501", error.cause.result.error_field(PG::Result::PG_DIAG_SQLSTATE)
      # A failed statement must roll back the owned transaction rather than allowing subsequent SQL.
      raise ActiveRecord::Rollback
    end
    refute_includes owned_rows("thread_notes").map { |row| row.fetch("id") }, denied_id
    assert_raises(PG::InsufficientPrivilege) { @api.exec_params("SELECT app_auth.collaboration_reader($1, $2, $3)", [@digest, @box, other.user_id]) }
  end
end
