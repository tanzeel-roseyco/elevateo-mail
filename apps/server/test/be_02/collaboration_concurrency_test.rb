# frozen_string_literal: true

require_relative "collaboration_database_helper"

# AIDEV-NOTE: Database lock observation supplies barriers; assertions never depend on which Ruby thread runs first.
class CollaborationConcurrencyTest < CollaborationDatabaseCase
  def test_differing_read_writes_from_separate_sessions_serialize
    retry_digest = SecureRandom.hex(32)
    assert_equal "ok", create(digest: retry_digest)["status"]
    retry_actor = Identity.new(user_id: @user, org_id: @org, digest: retry_digest, auth_session_id: @auth)
    refute_equal @identity.digest, retry_actor.digest
    assert_equal 2, @admin.exec_params("SELECT cookie_digest FROM app_auth.sessions WHERE organization_id = $1 AND user_id = $2 AND cookie_digest IN ($3, $4)", [@org, @user, @identity.digest, retry_actor.digest]).ntuples
    contender = nil
    scope do |connection|
      # AIDEV-NOTE: Observe blocking before any business row exists; distinct cookie rows exclude session contention.
      assert_empty owned_rows("thread_read_states", user: @user)
      contender, pid = start_service { state(false, identity: retry_actor) }
      wait_for_lock(pid, blocker: connection.raw_connection.backend_pid)
      first = service(Elevateo::ThreadReadState, connection).put(thread_id: @thread,
        input: { "mailbox_id" => @box, "read" => true })
      assert_equal 1, JSON.parse(first.json)["read_state_version"]
    end
    assert_equal [false, 2], JSON.parse(contender.value.json).values_at("read", "read_state_version")
    assert_equal 1, owned_rows("thread_read_states", user: @user).length
  ensure
    contender&.join
  end

  def test_target_revocation_waits_for_assignment_serialization_and_commit
    other, private_box, private_thread = private_pair
    revoker = connect("BE02_ADMIN_DATABASE_URL", "supabase_admin")
    contender = nil
    scope(targets: [other.user_id]) do |connection|
      result = service(Elevateo::ThreadAssignment, connection).put(thread_id: private_thread,
        input: assignment_input(private_box, other.user_id))
      assert_equal 1, JSON.parse(result.json)["assignment_version"]
      contender = Thread.new { revoke_private(other, private_box, revoker) }
      contender.report_on_exception = false
      wait_for_lock(revoker.backend_pid, blocker: connection.raw_connection.backend_pid)
      # The serialized result exists while the target's revoke transaction still cannot obtain its guard.
      assert_equal other.user_id, JSON.parse(result.json)["assignee_id"]
    end
    contender.value
    history = scope(write: false) do |connection|
      service(Elevateo::ThreadAssignment, connection).get(thread_id: private_thread, query: { "mailbox_id" => private_box })
    end
    assert_equal other.user_id, JSON.parse(history)["assignee_id"]
    error = assert_raises(Elevateo::CollaborationError) do
      assignment(other.user_id, 1, thread: private_thread, box: private_box)
    end
      assert_equal "not_available", error.code
  ensure
    contender&.join
    close_connections([revoker])
  end

  def test_target_revocation_committed_while_writer_waits_precedes_version_conflict
    other, private_box, private_thread = private_pair
    assignment(@user, 0, thread: private_thread, box: private_box)
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT cookie_digest FROM app_auth.sessions WHERE user_id = $1 ORDER BY cookie_digest FOR UPDATE", [other.user_id])
    @admin.exec_params("SELECT app_auth.lock_authorization_generations($1, $2)", [@org, other.user_id])
    @admin.exec_params("DELETE FROM app.mailbox_memberships WHERE mailbox_id = $1 AND user_id = $2", [private_box, other.user_id])
    contender, pid = start_service { assignment(other.user_id, 0, thread: private_thread, box: private_box) }
    wait_for_lock(pid, blocker: @admin.backend_pid)
    @admin.exec("COMMIT")
    error = contender.value
    assert_instance_of Elevateo::CollaborationError, error
    assert_equal [404, "not_available", "This item is unavailable."], [error.status, error.code, error.message]
    rows = owned_rows("thread_assignments", box: private_box, thread: private_thread)
    assert_equal([[@user, "1"]], rows.map { |row| row.values_at("assignee_id", "assignment_version") })
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
    contender&.join
  end

  private

  def private_pair
    other = add_actor
    private_box = mailbox(visibility: "private")
    private_member(private_box, @identity)
    private_member(private_box, other)
    [other, private_box, conversation(box: private_box)]
  end

  def assignment_input(box, target)
    { "mailbox_id" => box, "assignee_id" => target, "expected_assignment_version" => 0 }
  end

  def revoke_private(actor, box, connection)
    member_change(actor.user_id, connection: connection) do |db|
      db.exec_params("DELETE FROM app.mailbox_memberships WHERE mailbox_id = $1 AND user_id = $2", [box, actor.user_id])
    end
  end

  def start_service
    ready = Queue.new
    thread = Thread.new do
      CollaborationApiRecord.connection_pool.with_connection do |connection|
        ready << connection.raw_connection.backend_pid
        yield
      end
    rescue Elevateo::CollaborationError => error
      error
    rescue StandardError, Minitest::Assertion => error
      ready << error
      raise
    end
    thread.report_on_exception = false
    pid = ready.pop
    if pid.is_a?(Exception)
      thread.join
      raise pid
    end
    [thread, pid]
  end
end
