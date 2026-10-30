# frozen_string_literal: true

require_relative "database_test_helper"

# AIDEV-NOTE: Real role connections and committed fixtures exercise the SQL boundary, not a mocked Auth provider.
class SessionDatabaseTest < SessionDatabaseTestCase
  def test_roles_cannot_read_private_or_auth_tables_or_execute_helpers
    [@api, @worker].each do |connection|
      %w[app_auth.sessions app_auth.pending_entries app_auth.revocation_intents
         app_auth.authorization_generations app_auth.rate_limits auth.sessions].each do |table|
        assert_raises(PG::InsufficientPrivilege) { connection.exec("SELECT * FROM #{table}") }
      end
      assert_raises(PG::InsufficientPrivilege) { connection.exec("SET ROLE elevateo_session_owner") }
      assert_raises(PG::InsufficientPrivilege) { connection.exec("SELECT app_auth.check_digest(repeat('a',64))") }
    end
    assert_raises(PG::InsufficientPrivilege) { invoke("resolve_session", @digest, connection: @worker) }
    assert_raises(PG::InsufficientPrivilege) { invoke("claim_revocations", SecureRandom.uuid, 1) }
    attrs = @admin.exec("SELECT rolcanlogin, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'elevateo_session_owner'").first
    assert_equal %w[f f f], attrs.values
    columns = @admin.exec("SELECT attname FROM pg_attribute WHERE attrelid = 'auth.sessions'::regclass AND attnum > 0 AND NOT attisdropped AND has_column_privilege('elevateo_session_owner', 'auth.sessions', attname, 'SELECT') ORDER BY attname").column_values(0)
    assert_equal %w[created_at id not_after user_id], columns
  end

  def test_create_binding_lifetimes_and_existing_rls
    session = create
    assert_equal "ok", session.fetch("status")
    assert_equal @org, session.fetch("organization_id")
    assert_operator Time.parse(session.fetch("idle_expires_at")), :<=, Time.now.utc + 1801
    assert_operator Time.parse(session.fetch("absolute_expires_at")), :<=, Time.now.utc + 43_201
    assert_equal "unauthorized", invoke("authorize_session", @digest, SecureRandom.uuid, @auth, nil, nil).fetch("status")
    @api.exec_params("SELECT set_config('app_auth.verified_user_id', $1, false)", [@user])
    assert_empty @api.exec("SELECT * FROM app.organization_memberships").to_a
    @api.exec_params("SELECT set_config('app.user_id', $1, false), set_config('app.org_id', $2, false)", [@user, @org])
    assert_equal 1, @api.exec("SELECT * FROM app.organization_memberships").ntuples
  end

  def test_no_membership_keeps_cookie_session_and_refresh_bootstraps_later
    membership(present: false)
    result = create
    assert_equal "not_found", result.fetch("status")
    assert result.fetch("session_created")
    membership(present: true)
    claim = SecureRandom.uuid
    generation = invoke("claim_refresh", @digest, claim).fetch("refresh_generation")
    result = invoke("publish_refresh", @digest, claim, generation, @user, @auth, "new-access", "new-refresh", (Time.now.utc + 3600).iso8601)
    assert_equal "ok", result.fetch("status")
    assert_equal @org, result.fetch("organization_id")
    assert_equal @context, result.fetch("context_id")
  end

  def test_idle_and_auth_policy_expiry_precede_context_conflict
    create
    @admin.exec_params("UPDATE app_auth.sessions SET idle_expires_at = clock_timestamp() - interval '1 second' WHERE cookie_digest = $1", [@digest])
    assert_equal "unauthorized", authorize(context: SecureRandom.uuid, generation: -1).fetch("status")
    assert_equal "unauthorized", invoke("touch_session", @digest, @user, @auth).fetch("status")
    assert_equal "unauthorized", invoke("revoke_session", @digest, "global").fetch("status")
    assert_equal "ok", invoke("revoke_session", @digest, "local").fetch("status")
    second = SecureRandom.hex(32)
    create(digest: second)
    @admin.exec_params("UPDATE auth.sessions SET not_after = clock_timestamp() - interval '1 second' WHERE id = $1", [@auth])
    assert_equal "unauthorized", invoke("resolve_session", second).fetch("status")
  end

  def test_parallel_refresh_claim_has_one_owner
    create
    results = parallel_api_calls(2) do |connection, _index|
      invoke("claim_refresh", @digest, SecureRandom.uuid, connection: connection)
    end
    assert_equal %w[ok temporarily_unavailable], results.map { |result| result.fetch("status") }.sort
  end

  def test_expired_refresh_is_uncertain_and_cannot_be_stolen
    create
    claim = SecureRandom.uuid
    generation = invoke("claim_refresh", @digest, claim).fetch("refresh_generation")
    expire_claim
    assert_equal "refresh_uncertain", invoke("claim_refresh", @digest, SecureRandom.uuid).fetch("status")
    assert_equal "unauthorized", invoke("publish_refresh", @digest, claim, generation, @user, @auth, "late-access", "late-refresh", (Time.now.utc + 3600).iso8601).fetch("status")
    assert_equal "unauthorized", authorize.fetch("status")
    assert_equal "late-access", @admin.exec_params("SELECT access_token_ciphertext FROM app_auth.revocation_intents WHERE cookie_digest = $1", [@digest]).getvalue(0, 0)
  end

  def test_logout_wins_against_late_refresh_and_worker_ack_is_fenced
    create
    claim = SecureRandom.uuid
    generation = invoke("claim_refresh", @digest, claim).fetch("refresh_generation")
    create(digest: SecureRandom.hex(32))
    assert invoke("revoke_session", @digest, "global").fetch("upstream_revocation_pending")
    assert_equal "unauthorized", invoke("publish_refresh", @digest, claim, generation, @user, @auth, "late-access", "late-refresh", (Time.now.utc + 3600).iso8601).fetch("status")
    assert_equal %w[revoked revoked], @admin.exec_params("SELECT state FROM app_auth.sessions WHERE user_id = $1", [@user]).column_values(0)
    intent_id = revocation_intent_id(generation: generation, scope: "global")
    worker_claim = SecureRandom.uuid
    intents = invoke("claim_revocations", worker_claim, 20, connection: @worker).fetch("intents")
    own = assert_claimed_intent(intents, id: intent_id, claim: worker_claim)
    assert_equal "late-access", own.fetch("access_token_ciphertext")
    assert_equal "not_found", invoke("finish_revocation", intent_id, SecureRandom.uuid, true, connection: @worker).fetch("status")
    assert_equal({ "status" => "ok", "state" => "completed" }, invoke("finish_revocation", intent_id, worker_claim, true, connection: @worker))
  end

  def test_snapshot_preserves_whole_prior_authority_then_next_snapshot_denies
    create
    @api.exec("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    assert_equal "ok", authorize.fetch("status")
    with_api_connections(1) do |connections|
      invoke("revoke_session", @digest, "local", connection: connections.fetch(0))
    end
    assert_equal "ok", authorize.fetch("status")
    @api.exec("COMMIT")
    assert_equal "unauthorized", authorize(context: SecureRandom.uuid).fetch("status")
  end

  def test_membership_tombstone_bumps_and_capabilities_default_false
    generation = create.fetch("authorization_generation")
    membership(present: false)
    assert_equal "not_found", authorize(generation: generation).fetch("status")
    membership(present: true)
    assert_equal "context_changed", authorize(generation: generation).fetch("status")
    defaults = @admin.exec("SELECT column_default FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'mailbox_memberships' AND column_name IN ('compose','approve_send','manage_members')")
    assert_equal %w[false false false], defaults.column_values(0)
  end

  def test_pending_entry_is_one_shot_and_known_password_failure_can_retry
    digest, claim = stage, SecureRandom.uuid
    assert_equal "verify", invoke("claim_entry", digest, claim).fetch("step")
    assert_equal "temporarily_unavailable", invoke("claim_entry", digest, SecureRandom.uuid).fetch("status")
    assert_equal "ok", invoke("verify_entry", digest, claim, @user, @auth, "access", "refresh", (Time.now.utc + 3600).iso8601).fetch("status")
    invoke("fail_entry", digest, claim, true)
    retry_claim = SecureRandom.uuid
    assert_equal "password", invoke("claim_entry", digest, retry_claim).fetch("step")
    assert_equal "ok", invoke("complete_entry", digest, retry_claim, @digest, @context, "c" * 48).fetch("status")
    assert_equal "unauthorized", invoke("complete_entry", digest, retry_claim, SecureRandom.hex(32), @context, "c" * 48).fetch("status")
    uncertain, uncertain_claim = stage, SecureRandom.uuid
    invoke("claim_entry", uncertain, uncertain_claim)
    invoke("fail_entry", uncertain, uncertain_claim, false)
    assert_equal "unauthorized", invoke("claim_entry", uncertain, SecureRandom.uuid).fetch("status")
  end

  def test_limits_and_invalid_parameters_fail_closed
    email, ip = SecureRandom.hex(32), SecureRandom.hex(32)
    @owned_buckets.concat([email, ip])
    5.times { assert_equal "ok", invoke("consume_entry_limits", email, ip).fetch("status") }
    result = invoke("consume_entry_limits", email, ip)
    assert_equal "rate_limited", result.fetch("status")
    assert_operator result.fetch("retry_after"), :<=, 900
    assert_raises(PG::InvalidParameterValue) { invoke("resolve_session", nil) }
    assert_raises(PG::InvalidParameterValue) { invoke("list_organizations", @digest, @user, @auth, nil, 51) }
    assert_raises(PG::InvalidParameterValue) { invoke("claim_revocations", SecureRandom.uuid, 21, connection: @worker) }
  end

  def test_switch_rejects_old_authorization_after_context_rotation
    generation = create.fetch("authorization_generation")
    args = [@digest, @user, @auth, @org, SecureRandom.uuid, "next" * 12, @context, generation]
    assert_equal "ok", invoke("switch_organization", *args).fetch("status")
    args[4] = SecureRandom.uuid
    assert_equal "context_changed", invoke("switch_organization", *args).fetch("status")
    assert_equal "context_changed", authorize(context: @context, generation: generation).fetch("status")
  end

  def test_revocation_retry_backoff_and_terminal_attempt_limit
    create
    invoke("revoke_session", @digest, "local")
    intent_id = revocation_intent_id
    claim = SecureRandom.uuid
    intents = invoke("claim_revocations", claim, 20, connection: @worker).fetch("intents")
    assert_claimed_intent(intents, id: intent_id, claim: claim)
    assert_equal({ "status" => "ok", "state" => "pending" }, invoke("finish_revocation", intent_id, claim, false, connection: @worker))
    assert_empty invoke("claim_revocations", SecureRandom.uuid, 20, connection: @worker).fetch("intents")
    @admin.exec_params("UPDATE app_auth.revocation_intents SET attempts = 7, next_attempt_at = clock_timestamp() - interval '1 second' WHERE id = $1", [intent_id])
    last_claim = SecureRandom.uuid
    intents = invoke("claim_revocations", last_claim, 20, connection: @worker).fetch("intents")
    last = assert_claimed_intent(intents, id: intent_id, claim: last_claim)
    assert_equal 8, last.fetch("attempts")
    assert_equal({ "status" => "ok", "state" => "failed" }, invoke("finish_revocation", intent_id, last_claim, false, connection: @worker))
    assert_empty invoke("claim_revocations", SecureRandom.uuid, 20, connection: @worker).fetch("intents")
  end
end
