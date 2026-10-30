# frozen_string_literal: true

require_relative "mailbox_membership_database_helper"

class MailboxMembershipConcurrencyTest < MailboxMembershipDatabaseCase
  def test_next_revision_departure_rechecks_last_manager_after_business_lock
    other = add_actor
    explicit_member(other, manager: true)
    first, second = [@identity, other].sort_by(&:user_id)
    expected = revision
    membership_race do |workers, deadline|
      waiter = nil
      hold_revision = lambda do |connection|
        # AIDEV-NOTE: An authorized no-op holds the revision without deleting either manager or bypassing API grants.
        no_op = membership_query(connection, first, @box, first.user_id, expected, FLAGS.merge("manage_members" => true))
        assert_equal "ok", no_op.fetch("status")
        blocker = connection.select_value("SELECT pg_backend_pid()")
        waiter, ready = membership_worker(workers) { raw_change(second.user_id, expected + 1, flags: nil, identity: second) }
        pid = membership_pid(waiter, ready, deadline)
        # AIDEV-NOTE: Both managers still exist here; disjoint self guards force the observed wait onto the revision.
        membership_lock_wait(waiter, pid, blocker, "change_mailbox_membership", deadline)
      end
      assert_equal "ok", raw_change(first.user_id, expected, flags: nil, identity: first, before_change: hold_revision).fetch("status")
      assert_equal "membership_conflict", membership_result(waiter, deadline).fetch("status")
    end
    assert_equal expected + 1, revision
    assert_equal [second.user_id], @admin.exec_params(<<~SQL, [@box]).map { |row| row.fetch("user_id") }
      SELECT m.user_id FROM app.mailbox_memberships m JOIN app.organization_memberships o
        USING (organization_id, user_id) WHERE m.mailbox_id = $1 AND m.manage_members
    SQL
  end

  def test_reversed_actor_target_waits_create_guards_in_uuid_order
    # Fixed UUIDs order both the existing-row and missing-row schedules independently of fixture randomness.
    low = membership_fixed_actor("10000000-0000-4000-8000-000000000001")
    high = membership_fixed_actor("f0000000-0000-4000-8000-000000000002")
    [low, high].each { |actor| explicit_member(actor, manager: true) }
    [false, true].each do |missing|
      if missing
        [low, high].each do |actor|
          member_change(actor.user_id) do |connection|
            connection.exec_params("DELETE FROM app_auth.authorization_generations WHERE organization_id = $1 AND user_id = $2", [@org, actor.user_id])
          end
        end
      end
      expected = revision
      before = missing ? [1, 1] : [generation(low.user_id), generation(high.user_id)]
      membership_race do |workers, deadline|
        tasks = []
        blockers = [@admin.backend_pid]
        begin
          @admin.exec("BEGIN")
          @admin.exec_params("INSERT INTO app_auth.authorization_generations(organization_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [@org, low.user_id])
          @admin.exec_params("SELECT 1 FROM app_auth.authorization_generations WHERE organization_id = $1 AND user_id = $2 FOR UPDATE", [@org, low.user_id])
          [[high, low], [low, high]].each do |actor, target|
            task, ready = membership_worker(workers) do
              raw_change(target.user_id, expected, identity: actor, flags: FLAGS.merge("manage_members" => true, "approve_send" => missing))
            end
            tasks << task
            pid = membership_pid(task, ready, deadline)
            # PostgreSQL may queue the second waiter behind the first tuple waiter rather than the holder directly.
            membership_lock_wait(task, pid, blockers, "begin_protected_write", deadline)
            blockers << pid
          end
          # AIDEV-NOTE: Actor-first/batched insertion holds high while waiting on low; this independent probe must succeed.
          @admin.exec("SAVEPOINT high_guard_probe")
          @admin.exec("SET LOCAL lock_timeout = '100ms'")
          @admin.exec_params("INSERT INTO app_auth.authorization_generations(organization_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [@org, high.user_id])
          @admin.exec_params("SELECT 1 FROM app_auth.authorization_generations WHERE organization_id = $1 AND user_id = $2 FOR UPDATE NOWAIT", [@org, high.user_id])
          @admin.exec("ROLLBACK TO SAVEPOINT high_guard_probe")
          @admin.exec("COMMIT")
        ensure
          @admin.exec("ROLLBACK") unless @admin.transaction_status == PG::PQTRANS_IDLE
        end
        statuses = tasks.map { |task| membership_result(task, deadline).fetch("status") }.sort
        assert_equal(missing ? %w[membership_conflict ok] : %w[ok ok], statuses)
      end
      assert_equal expected + (missing ? 1 : 0), revision
      after = [generation(low.user_id), generation(high.user_id)]
      assert_equal(missing ? [0, 1] : [0, 0], after.zip(before).map { |a, b| a - b }.sort)
    end
  end

  def test_simultaneous_manager_departures_have_one_cas_winner_and_leave_one_manager
    other = add_actor
    explicit_member(other, manager: true)
    actors, expected = [@identity, other], revision
    results = parallel_services(2) do |index|
      actor = actors.fetch(index)
      raw_change(actor.user_id, expected, flags: nil, identity: actor)
    end
    assert_equal %w[membership_conflict ok], results.map { |row| row.fetch("status") }.sort
    assert_equal expected + 1, revision
    assert_equal "1", @admin.exec_params("SELECT count(*) FROM app.mailbox_memberships WHERE mailbox_id = $1 AND manage_members", [@box]).getvalue(0, 0)
  end

  def test_concurrent_creation_of_missing_target_guard_does_not_deadlock_or_double_increment
    other, target = add_actor, add_actor
    explicit_member(other, manager: true)
    member_change(target.user_id) do |connection|
      connection.exec_params("DELETE FROM app_auth.authorization_generations WHERE organization_id = $1 AND user_id = $2", [@org, target.user_id])
    end
    actors, expected = [@identity, other], revision
    results = parallel_services(2) do |index|
      raw_change(target.user_id, expected, identity: actors.fetch(index), flags: FLAGS.merge("approve_send" => index.zero?))
    end
    assert_equal %w[membership_conflict ok], results.map { |row| row.fetch("status") }.sort
    assert_equal [expected + 1, 2], [revision, generation(target.user_id)]
  end

  def test_target_delete_and_readd_invalidate_previous_revision_and_keep_generation_tombstone
    other = add_actor
    explicit_member(other)
    previous, generation_before = revision, generation(other.user_id)
    member_change(other.user_id) do |connection|
      connection.exec_params("DELETE FROM app.organization_memberships WHERE organization_id = $1 AND user_id = $2", [@org, other.user_id])
    end
    assert_operator generation(other.user_id), :>, generation_before
    removed_generation = generation(other.user_id)
    member_change(other.user_id) do |connection|
      connection.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES ($1,$2)", [@org, other.user_id])
    end
    assert_operator generation(other.user_id), :>, removed_generation
    assert_equal previous + 1, revision
    assert_equal "membership_conflict", raw_change(other.user_id, previous).fetch("status")
    assert_equal "ok", raw_change(other.user_id, revision).fetch("status")
  end

  def test_target_delete_readd_serializes_before_waiting_mutation_checks_revision
    other = add_actor
    explicit_member(other)
    previous = revision
    membership_race do |workers, deadline|
      task = nil
      member_change(other.user_id) do |connection|
        connection.exec_params("DELETE FROM app.organization_memberships WHERE organization_id = $1 AND user_id = $2", [@org, other.user_id])
        connection.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES ($1,$2)", [@org, other.user_id])
        # AIDEV-NOTE: Observe the guard wait; holder commit/rollback precedes bounded worker cleanup on every path.
        task, ready = membership_worker(workers) { raw_change(other.user_id, previous) }
        pid = membership_pid(task, ready, deadline)
        membership_lock_wait(task, pid, connection.backend_pid, "begin_protected_write", deadline)
      end
      assert_equal "membership_conflict", membership_result(task, deadline).fetch("status")
      assert_equal previous + 1, revision
      refute_includes roster.fetch("items").map { |item| item.fetch("user_id") }, other.user_id
    end
  end
end
