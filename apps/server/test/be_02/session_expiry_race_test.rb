# frozen_string_literal: true

require_relative "database_test_helper"

# AIDEV-NOTE: Observe the actual API backend waiting on our lock before advancing a known database deadline.
class SessionExpiryRaceTest < SessionDatabaseTestCase
  SESSION_LOCK = "SELECT 1 FROM app_auth.sessions WHERE cookie_digest = $1 FOR UPDATE"
  GENERATION_LOCK = "SELECT app_auth.lock_authorization_generations($1, $2)"

  def setup
    super
    # Test-only headroom lets a two-second fixture deadline pass without testing lock_timeout instead of expiry.
    [@admin, @api].each do |connection|
      connection.exec("SET statement_timeout = '8s'")
      connection.exec("SET lock_timeout = '6s'")
    end
  end

  %i[idle absolute auth].each do |policy|
    define_method("test_touch_rejects_#{policy}_expiry_while_waiting_for_the_row") do
      assert_equal "ok", create.fetch("status")
      before = nil
      result = blocked_call(SESSION_LOCK, [@digest], "touch_session", @digest, @user, @auth) do
        deadline = set_policy_deadline(policy)
        before = session_row
        wait_past(deadline)
      end
      assert_equal "unauthorized", result.fetch("status")
      assert_equal before, session_row, "denial must not extend idle time or change session state"
    end
  end

  def test_touch_after_a_row_wait_extends_a_nonexpired_session
    assert_equal "ok", create.fetch("status")
    @admin.exec_params("UPDATE app_auth.sessions SET idle_expires_at = clock_timestamp() + interval '5 minutes' WHERE cookie_digest = $1", [@digest])
    before = session_row
    released_at = nil
    result = blocked_call(SESSION_LOCK, [@digest], "touch_session", @digest, @user, @auth) { released_at = clock_after(0) }
    assert_equal "ok", result.fetch("status")
    after = session_row
    assert_operator Time.parse(after.fetch("idle_expires_at")), :>, Time.parse(before.fetch("idle_expires_at"))
    assert_operator Time.parse(after.fetch("idle_expires_at")), :>=, Time.parse(released_at) + 30 * 60
    assert_operator Time.parse(after.fetch("idle_expires_at")), :<=, Time.parse(after.fetch("absolute_expires_at"))
    assert_equal before.fetch("absolute_expires_at"), after.fetch("absolute_expires_at")
  end

  def test_switch_rejects_expiry_during_row_wait_without_rotating_context
    generation = create.fetch("authorization_generation")
    before = nil
    result = blocked_call(SESSION_LOCK, [@digest], "switch_organization",
      @digest, @user, @auth, @org, SecureRandom.uuid, "next" * 12, @context, generation) do
      deadline = set_policy_deadline(:idle)
      before = session_row
      wait_past(deadline)
    end
    assert_equal "unauthorized", result.fetch("status")
    assert_equal before, session_row
  end

  def test_switch_rechecks_expiry_after_waiting_for_the_generation
    generation = create.fetch("authorization_generation")
    deadline = clock_after(2)
    @admin.exec_params("UPDATE app_auth.sessions SET idle_expires_at = $2 WHERE cookie_digest = $1", [@digest, deadline])
    before = session_row
    result = blocked_call(GENERATION_LOCK, [@org, @user], "switch_organization",
      @digest, @user, @auth, @org, SecureRandom.uuid, "next" * 12, @context, generation) { wait_past(deadline) }
    assert_equal "unauthorized", result.fetch("status")
    assert_equal before, session_row
  end

  def test_switch_after_a_row_wait_rotates_a_nonexpired_context
    generation = create.fetch("authorization_generation")
    context = SecureRandom.uuid
    released_at = nil
    result = blocked_call(SESSION_LOCK, [@digest], "switch_organization",
      @digest, @user, @auth, @org, context, "next" * 12, @context, generation) { released_at = clock_after(0) }
    assert_equal "ok", result.fetch("status")
    after = session_row
    assert_equal [context, "next" * 12], after.values_at("context_id", "csrf_token")
    assert_operator Time.parse(after.fetch("idle_expires_at")), :>=, Time.parse(released_at) + 30 * 60
  end

  def test_refresh_publication_after_generation_wait_disposes_late_credentials
    arguments = refresh_arguments
    deadline = clock_after(2)
    @admin.exec_params("UPDATE app_auth.sessions SET refresh_claim_deadline = $2 WHERE cookie_digest = $1", [@digest, deadline])
    result = blocked_call(GENERATION_LOCK, [@org, @user], "publish_refresh", *arguments) { wait_past(deadline) }
    assert_equal "unauthorized", result.fetch("status")
    assert_equal ["refresh_uncertain", "encrypted-access"], session_row.values_at("state", "access_token_ciphertext")
    assert_pending_revocation("published-access", arguments[2])
    assert_equal "unauthorized", invoke("resolve_session", @digest).fetch("status")
  end

  def test_refresh_publication_after_generation_wait_accepts_a_live_claim
    arguments = refresh_arguments
    result = blocked_call(GENERATION_LOCK, [@org, @user], "publish_refresh", *arguments)
    assert_equal "ok", result.fetch("status")
    assert_equal ["active", @org, "published-access", "published-refresh", nil, nil],
      session_row.values_at("state", "organization_id", "access_token_ciphertext", "refresh_token_ciphertext",
        "refresh_claim_id", "refresh_claim_deadline")
    assert_empty revocations
    assert_equal "ok", authorize.fetch("status")
  end

  %w[claim_deadline expires_at].each do |column|
    define_method("test_entry_publication_rejects_#{column}_crossed_during_generation_wait") do
      digest, claim = verified_entry
      deadline = clock_after(2)
      # The column is selected only from this fixed test matrix; the deadline and identity remain bound values.
      @admin.exec_params("UPDATE app_auth.pending_entries SET #{column} = $2 WHERE digest = $1", [digest, deadline])
      result = blocked_call(GENERATION_LOCK, [@org, @user], "complete_entry",
        digest, claim, @digest, @context, "c" * 48) { wait_past(deadline) }
      assert_equal "unauthorized", result.fetch("status")
      refute result.fetch("session_created", false)
      assert_equal "revoked", session_row.fetch("state")
      assert_equal ["uncertain", nil, nil], pending_row(digest).values_at("state", "access_token_ciphertext", "refresh_token_ciphertext")
      assert_pending_revocation("entry-access", 0)
      assert_equal "unauthorized", invoke("resolve_session", @digest).fetch("status")
    end
  end

  def test_entry_publication_after_generation_wait_accepts_a_live_entry
    digest, claim = verified_entry
    result = blocked_call(GENERATION_LOCK, [@org, @user], "complete_entry", digest, claim, @digest, @context, "c" * 48)
    assert_equal "ok", result.fetch("status")
    assert result.fetch("session_created")
    assert_equal "active", session_row.fetch("state")
    assert_equal ["completed", nil, nil], pending_row(digest).values_at("state", "access_token_ciphertext", "refresh_token_ciphertext")
    assert_empty revocations
    assert_equal "ok", authorize.fetch("status")
  end

  private

  def blocked_call(lock_sql, lock_values, name, *values)
    raise ArgumentError, "unknown test function" unless FUNCTIONS.include?(name)
    @admin.exec("BEGIN")
    @admin.exec_params(lock_sql, lock_values)
    placeholders = values.each_index.map { |index| "$#{index + 1}" }.join(", ")
    @api.send_query_params("SELECT app_auth.#{name}(#{placeholders})", values)
    observe_lock
    yield if block_given?
    @admin.exec("COMMIT")
    result = @api.get_result
    result.check
    JSON.parse(result.getvalue(0, 0))
  ensure
    # Release the blocker even on assertion failure, then drain the bounded query before the base cleanup runs.
    @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
    result&.clear
    while (remaining = @api.get_result)
      remaining.clear
    end
  end

  def observe_lock
    limit = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 1
    loop do
      @admin.exec("SELECT pg_stat_clear_snapshot()")
      activity = @admin.exec_params(<<~SQL, [@api.backend_pid, @admin.backend_pid]).first
        SELECT query_start, wait_event_type, $2::integer = ANY(pg_blocking_pids(pid)) AS our_blocker
        FROM pg_stat_activity WHERE pid = $1
      SQL
      if activity && activity.fetch("wait_event_type") == "Lock" && activity.fetch("our_blocker") == "t"
        @query_started = activity.fetch("query_start")
        return
      end
      flunk "API did not reach our lock within one second: #{activity.inspect}" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= limit
    end
  end

  def wait_past(deadline)
    assert_operator Time.parse(@query_started), :<, Time.parse(deadline), "call must begin before expiry"
    @admin.exec_params("SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - clock_timestamp()))))", [deadline])
    assert_equal "t", @admin.exec_params("SELECT clock_timestamp() >= $1::timestamptz", [deadline]).getvalue(0, 0)
  end

  def clock_after(seconds)
    @admin.exec_params("SELECT clock_timestamp() + $1::double precision * interval '1 second'", [seconds]).getvalue(0, 0)
  end

  def set_policy_deadline(policy)
    deadline = clock_after(0.1)
    case policy
    when :idle
      @admin.exec_params("UPDATE app_auth.sessions SET idle_expires_at = $2 WHERE cookie_digest = $1", [@digest, deadline])
    when :absolute
      @admin.exec_params("UPDATE app_auth.sessions SET absolute_expires_at = $2, idle_expires_at = $2 WHERE cookie_digest = $1", [@digest, deadline])
    when :auth
      @admin.exec_params("UPDATE auth.sessions SET not_after = $2 WHERE id = $1", [@auth, deadline])
    else
      raise ArgumentError, "unknown expiry policy"
    end
    deadline
  end

  def refresh_arguments
    # AIDEV-NOTE: Only null-org refresh bootstrapping acquires a generation guard in the current API.
    membership(present: false)
    assert_equal "not_found", create.fetch("status")
    membership(present: true)
    claim = SecureRandom.uuid
    generation = invoke("claim_refresh", @digest, claim).fetch("refresh_generation")
    [@digest, claim, generation, @user, @auth, "published-access", "published-refresh", (Time.now.utc + 3600).iso8601]
  end

  def verified_entry
    digest, claim = stage, SecureRandom.uuid
    assert_equal "verify", invoke("claim_entry", digest, claim).fetch("step")
    assert_equal "ok", invoke("verify_entry", digest, claim, @user, @auth,
      "entry-access", "entry-refresh", (Time.now.utc + 3600).iso8601).fetch("status")
    [digest, claim]
  end

  def session_row
    @admin.exec_params("SELECT * FROM app_auth.sessions WHERE cookie_digest = $1", [@digest]).first
  end

  def pending_row(digest)
    @admin.exec_params("SELECT * FROM app_auth.pending_entries WHERE digest = $1", [digest]).first
  end

  def revocations
    @admin.exec_params("SELECT scope, access_token_ciphertext, credential_generation, state FROM app_auth.revocation_intents WHERE cookie_digest = $1", [@digest]).values
  end

  def assert_pending_revocation(access, generation)
    assert_equal [["local", access, generation.to_s, "pending"]], revocations
  end
end
