# frozen_string_literal: true

require_relative "database_test_helper"

# AIDEV-NOTE: Publication is one-shot; authenticated disposal must deny local use of the same Auth session.
class RefreshPublicationTest < SessionDatabaseTestCase
  def setup
    super
    assert_equal "ok", create.fetch("status")
    @claim = SecureRandom.uuid
    owned = invoke("claim_refresh", @digest, @claim)
    assert_equal "ok", owned.fetch("status")
    @generation = owned.fetch("refresh_generation")
    @expires = (Time.now.utc + 3600).iso8601
  end

  def test_duplicate_successful_publication_closes_local_session_without_reseating_tokens
    result = publish
    assert_equal "ok", result.fetch("status")
    assert_equal @context, result.fetch("context_id")
    assert_equal "ok", authorize.fetch("status")
    published = session_row
    assert_equal "active", published.fetch("state")
    assert_equal "rotated-access", published.fetch("access_token_ciphertext")
    assert_equal "rotated-refresh", published.fetch("refresh_token_ciphertext")
    assert_nil published.fetch("refresh_claim_id")
    assert_nil published.fetch("refresh_claim_deadline")
    assert_empty intents

    assert_equal "unauthorized", publish.fetch("status")
    denied = session_row
    assert_equal "refresh_uncertain", denied.fetch("state")
    assert_equal "local", denied.fetch("revocation_scope")
    refute_nil denied.fetch("revoked_at")
    assert_equal published.except("state", "revoked_at", "revocation_scope"),
                 denied.except("state", "revoked_at", "revocation_scope")
    assert_local_denial
    assert_intent(generation: @generation, access: "rotated-access")

    assert_equal "unauthorized", publish.fetch("status")
    assert_equal denied, session_row
    assert_intent(generation: @generation, access: "rotated-access")
  end

  def test_wrong_or_missing_identity_cannot_mutate_even_with_a_stale_claim
    before = session_row
    identities = [[SecureRandom.uuid, @auth], [@user, SecureRandom.uuid], [nil, @auth], [@user, nil]]
    identities.each do |user, auth_session|
      [@claim, SecureRandom.uuid].each do |claim|
        result = publish(user: user, auth_session: auth_session, claim: claim, generation: @generation + 1)
        assert_equal "unauthorized", result.fetch("status")
        assert_equal before, session_row
        assert_empty intents
      end
    end
    assert_equal "ok", publish.fetch("status")
  end

  def test_matching_identity_with_wrong_claim_is_terminal
    assert_equal "unauthorized", publish(claim: SecureRandom.uuid).fetch("status")
    assert_unpublished_tokens
    assert_intent(generation: @generation, access: "rotated-access")
    assert_equal "unauthorized", publish.fetch("status")
    assert_unpublished_tokens
  end

  def test_matching_identity_with_wrong_generation_is_terminal
    assert_equal "unauthorized", publish(generation: @generation + 1).fetch("status")
    assert_unpublished_tokens
    assert_intent(generation: @generation + 1, access: "rotated-access")
    assert_equal "unauthorized", publish.fetch("status")
    assert_unpublished_tokens
    assert_equal [@generation, @generation + 1], intents.map { |row| Integer(row.fetch("credential_generation"), 10) }.sort
  end

  def test_old_publication_cannot_leave_a_newer_generation_active
    assert_equal "ok", publish.fetch("status")
    next_claim = SecureRandom.uuid
    next_generation = invoke("claim_refresh", @digest, next_claim).fetch("refresh_generation")
    assert_equal @generation + 1, next_generation
    assert_equal "ok", publish(claim: next_claim, generation: next_generation,
                               access: "newer-access", refresh: "newer-refresh").fetch("status")

    assert_equal "unauthorized", publish.fetch("status")
    row = session_row
    assert_equal "refresh_uncertain", row.fetch("state")
    assert_equal next_generation.to_s, row.fetch("refresh_generation")
    assert_equal "newer-access", row.fetch("access_token_ciphertext")
    assert_equal "newer-refresh", row.fetch("refresh_token_ciphertext")
    assert_intent(generation: @generation, access: "rotated-access")
    assert_local_denial
  end

  def test_rejected_claim_preserves_prior_global_revocation
    assert_equal "ok", invoke("revoke_session", @digest, "global").fetch("status")
    before = session_row
    assert_equal "unauthorized", publish(claim: SecureRandom.uuid).fetch("status")
    assert_equal before, session_row
    assert_equal "revoked", before.fetch("state")
    assert_equal "global", before.fetch("revocation_scope")
    assert_intent(generation: @generation, access: "rotated-access", scope: "global")
    assert_local_denial
  end

  private

  def publish(claim: @claim, generation: @generation, user: @user, auth_session: @auth,
              access: "rotated-access", refresh: "rotated-refresh")
    invoke("publish_refresh", @digest, claim, generation, user, auth_session, access, refresh, @expires)
  end

  def session_row
    @admin.exec_params("SELECT * FROM app_auth.sessions WHERE cookie_digest = $1", [@digest]).to_a.fetch(0)
  end

  def intents
    @admin.exec_params("SELECT * FROM app_auth.revocation_intents WHERE cookie_digest = $1 ORDER BY id", [@digest]).to_a
  end

  def assert_local_denial
    assert_equal "unauthorized", authorize.fetch("status")
    assert_equal "unauthorized", invoke("resolve_session", @digest).fetch("status")
    assert_equal "unauthorized", invoke("claim_refresh", @digest, SecureRandom.uuid).fetch("status")
  end

  def assert_unpublished_tokens
    row = session_row
    assert_equal "refresh_uncertain", row.fetch("state")
    assert_equal @generation.to_s, row.fetch("refresh_generation")
    assert_equal "encrypted-access", row.fetch("access_token_ciphertext")
    assert_equal "encrypted-refresh", row.fetch("refresh_token_ciphertext")
    assert_local_denial
  end

  def assert_intent(generation:, access:, scope: "local")
    rows = intents
    assert_equal 1, rows.length
    row = rows.fetch(0)
    assert_equal generation.to_s, row.fetch("credential_generation")
    assert_equal access, row.fetch("access_token_ciphertext")
    assert_equal scope, row.fetch("scope")
    assert_equal "pending", row.fetch("state")
    assert_equal "0", row.fetch("attempts")
  end
end
