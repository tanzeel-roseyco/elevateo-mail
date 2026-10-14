# frozen_string_literal: true

require_relative "mailbox_membership_database_helper"

class MailboxMembershipDatabaseTest < MailboxMembershipDatabaseCase
  # AIDEV-NOTE: Startup and missing-lock failures must unwind the holder before the race harness joins workers.
  def test_membership_worker_failure_before_pid_preserves_original_exception
    original = RuntimeError.new("injected failure before PID publication")
    task = nil
    raised = assert_raises(RuntimeError) do
      membership_race(seconds: 0.75) do |workers, deadline|
        member_change(@user) do
          task, ready = membership_worker(workers, before_pid: -> { raise original }) { flunk "unreachable operation" }
          membership_pid(task, ready, deadline)
        end
      end
    end
    assert_same original, raised
    refute task.alive?
    assert_equal PG::PQTRANS_IDLE, @admin.transaction_status
  end

  def test_membership_worker_that_never_waits_fails_within_shared_deadline
    task = nil
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    raised = assert_raises(RuntimeError) do
      membership_race(seconds: 0.75) do |workers, deadline|
        member_change(@user) do |connection|
          task, ready = membership_worker(workers) { :finished_without_lock }
          pid = membership_pid(task, ready, deadline)
          membership_lock_wait(task, pid, connection.backend_pid, "begin_protected_write", deadline)
        end
      end
    end
    assert_match(/never reached begin_protected_write lock/, raised.message)
    assert_operator Process.clock_gettime(Process::CLOCK_MONOTONIC) - started, :<, 1.5
    refute task.alive?
    assert_equal PG::PQTRANS_IDLE, @admin.transaction_status
  end

  def test_upsert_and_noops_preserve_exact_revision_and_generation_semantics
    other = add_actor
    before, target_before, actor_before = revision, generation(other.user_id), generation
    changed = raw_change(other.user_id, before)
    assert_equal "ok", changed.fetch("status")
    assert_equal before + 1, changed.fetch("membership_version")
    assert_equal target_before + 1, generation(other.user_id)
    assert_equal actor_before, generation
    assert_equal "membership_conflict", raw_change(other.user_id, before).fetch("status")
    assert_equal "ok", raw_change(other.user_id, before + 1).fetch("status")
    assert_equal [before + 1, target_before + 1], [revision, generation(other.user_id)]
    assert_equal "ok", raw_change(other.user_id, before + 1, flags: nil).fetch("status")
    gone = [revision, generation(other.user_id)]
    assert_equal "ok", raw_change(other.user_id, gone.first, flags: nil).fetch("status")
    assert_equal gone, [revision, generation(other.user_id)]
    scope(identity: other, write: false) do |connection|
      assert_equal @box, connection.select_value("SELECT id FROM app.mailboxes")
    end
  end

  def test_last_manager_cannot_delete_or_demote_and_self_demotion_returns_current_authority
    initial = revision
    assert_equal "membership_conflict", raw_change(@user, initial, flags: nil).fetch("status")
    assert_equal "membership_conflict", raw_change(@user, initial).fetch("status")
    assert_equal initial, revision
    other = add_actor
    explicit_member(other, manager: true)
    prior, expected = generation, revision
    scope(targets: [@user]) do |connection|
      response = reader(Elevateo::MailboxMemberships, connection).put(mailbox_id: @box, user_id: @user,
        input: { "expected_membership_version" => expected, "capabilities" => FLAGS },
        digest: @digest, presentation: @presentation)
      body = JSON.parse(response.json)
      metadata = { "user_id" => @user, "organization_id" => @org, "authorization_generation" => prior + 1 }
      assert_equal @presentation.version(metadata), body.fetch("authorization_version")
      assert_equal expected + 1, body.fetch("membership_version")
    end
    assert_equal prior + 1, generation
    assert_equal "not_available", assert_raises(Elevateo::CollaborationError) { roster }.code
    assert_equal "not_found", raw_change(other.user_id, revision).fetch("status")
  end

  def test_current_org_target_is_required_even_for_absent_delete_and_stale_revision
    foreign = SecureRandom.uuid
    expected = revision
    assert_equal "not_found", raw_change(foreign, expected - 1, flags: nil).fetch("status")
    other = add_actor
    member_change(other.user_id) { |c| c.exec_params("DELETE FROM app.organization_memberships WHERE organization_id = $1 AND user_id = $2", [@org, other.user_id]) }
    assert_equal "not_found", raw_change(other.user_id, expected, flags: nil).fetch("status")
    assert_equal expected, revision
  end

  def test_roster_is_explicit_only_manager_only_and_revision_bound
    explicit = add_actor
    directory_only = add_actor
    explicit_member(explicit)
    first = roster(query: { "limit" => "1" })
    second = roster(query: { "limit" => "1", "cursor" => first.fetch("next_cursor") })
    ids = [first, second].flat_map { |page| page.fetch("items").map { |row| row.fetch("user_id") } }
    assert_equal [@user, explicit.user_id].sort, ids
    refute_includes ids, directory_only.user_id
    [explicit, directory_only].each do |identity|
      assert_equal "not_available", assert_raises(Elevateo::CollaborationError) { roster(identity: identity) }.code
    end
    assert_equal "ok", raw_change(explicit.user_id, revision, flags: FLAGS.merge("approve_send" => true)).fetch("status")
    error = assert_raises(Elevateo::CollaborationError) do
      roster(query: { "limit" => "1", "cursor" => first.fetch("next_cursor") })
    end
    assert_equal "cursor_invalid", error.code
  end

  def test_revision_ceiling_allows_noops_and_rejects_changes_without_partial_generation_bump
    other = add_actor
    @admin.exec_params("UPDATE app.mailbox_membership_revisions SET membership_version = 2147483647 WHERE mailbox_id = $1", [@box])
    before = generation(other.user_id)
    assert_equal "ok", raw_change(other.user_id, 2_147_483_647, flags: nil).fetch("status")
    assert_equal "ok", raw_change(@user, 2_147_483_647, flags: FLAGS.merge("manage_members" => true)).fetch("status")
    assert_equal "temporarily_unavailable", raw_change(other.user_id, 2_147_483_647).fetch("status")
    assert_equal [2_147_483_647, before], [revision, generation(other.user_id)]
    assert_equal [@user], roster.fetch("items").map { |row| row.fetch("user_id") }
  end

  def test_runtime_cannot_write_membership_tables_or_bypass_cookie_bound_guards
    %w[mailbox_memberships mailbox_membership_revisions].each do |table|
      flags = @admin.exec_params("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass", ["app.#{table}"]).first
      assert_equal({ "relrowsecurity" => "t", "relforcerowsecurity" => "t" }, flags)
      assert_raises(PG::InsufficientPrivilege) { @api.exec("DELETE FROM app.#{table}") }
    end
    @api.exec("BEGIN")
    @api.exec_params("SELECT set_config('app.org_id',$1,true),set_config('app.user_id',$2,true)", [@org, @user])
    assert_raises(PG::InsufficientPrivilege) do
      @api.exec_params("SELECT app.change_mailbox_membership($1,$2,$3,$4,false,true,false,false)", [@digest, @box, @user, revision])
    end
    @api.exec("ROLLBACK")
    scope do |connection|
      assert_raises(ActiveRecord::StatementInvalid) do
        connection.execute("SELECT app.change_mailbox_membership('#{@digest}','#{@box}','#{SecureRandom.uuid}',0,true,NULL,NULL,NULL)")
      end
      raise ActiveRecord::Rollback
    end
  end
end
