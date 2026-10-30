# frozen_string_literal: true

require_relative "database_test_helper"

# AIDEV-NOTE: Real worker claims are bound to fixture intent IDs; ciphertext replacement invalidates old ownership.
class RevocationWorkerTest < SessionDatabaseTestCase
  def setup
    super
    assert_equal "ok", create.fetch("status")
    @refresh_claim = SecureRandom.uuid
    owned = invoke("claim_refresh", @digest, @refresh_claim)
    assert_equal "ok", owned.fetch("status")
    @generation = owned.fetch("refresh_generation")
    @expires = (Time.now.utc + 3600).iso8601
    assert_equal "ok", invoke("revoke_session", @digest, "local").fetch("status")
    @intent_id = revocation_intent_id(generation: @generation)
  end

  def test_changed_ciphertext_resets_intent_and_rejects_old_worker_acknowledgements
    old_claim = SecureRandom.uuid
    old_job = claim_intent(old_claim)
    assert_equal "encrypted-access", old_job.fetch("access_token_ciphertext")
    assert_equal 1, old_job.fetch("attempts")

    dispose("replacement-access")
    replacement = intent_row
    assert_equal @intent_id, revocation_intent_id(generation: @generation)
    assert_pending_replacement(replacement, "replacement-access")
    [true, false].each do |succeeded|
      assert_equal "not_found", finish(old_claim, succeeded).fetch("status")
      assert_equal replacement, intent_row
    end

    new_claim = SecureRandom.uuid
    new_job = claim_intent(new_claim)
    assert_equal "replacement-access", new_job.fetch("access_token_ciphertext")
    assert_equal 1, new_job.fetch("attempts")
    claimed = intent_row
    assert_equal "not_found", finish(old_claim, true).fetch("status")
    assert_equal claimed, intent_row
    assert_equal "completed", finish(new_claim, true).fetch("state")
    assert_equal "unauthorized", authorize.fetch("status")
  end

  def test_equal_ciphertext_preserves_live_claim_and_completed_intent
    claim = SecureRandom.uuid
    claim_intent(claim)
    before = intent_row
    dispose("encrypted-access")
    assert_equal before, intent_row
    assert_equal "completed", finish(claim, true).fetch("state")
    completed = intent_row
    dispose("encrypted-access")
    assert_equal completed, intent_row
    assert_empty claim_jobs(SecureRandom.uuid)
  end

  def test_changed_ciphertext_rearms_a_completed_intent
    old_claim = SecureRandom.uuid
    claim_intent(old_claim)
    assert_equal "completed", finish(old_claim, true).fetch("state")
    dispose("later-access")
    assert_pending_replacement(intent_row, "later-access")
    assert_equal "not_found", finish(old_claim, true).fetch("status")
    new_claim = SecureRandom.uuid
    assert_equal "later-access", claim_intent(new_claim).fetch("access_token_ciphertext")
    assert_equal "completed", finish(new_claim, true).fetch("state")
  end

  def test_expired_eighth_lease_fails_without_a_ninth_claim
    last_claim = nil
    1.upto(8) do |attempt|
      last_claim = SecureRandom.uuid
      assert_equal attempt, claim_intent(last_claim).fetch("attempts")
      expire_worker_lease
    end
    expired = intent_row
    assert_equal "claimed", expired.fetch("state")
    assert_equal "8", expired.fetch("attempts")
    [true, false].each do |succeeded|
      assert_equal "not_found", finish(last_claim, succeeded).fetch("status")
      assert_equal expired, intent_row
    end

    assert_empty claim_jobs(SecureRandom.uuid)
    failed = intent_row
    assert_equal "failed", failed.fetch("state")
    assert_equal "8", failed.fetch("attempts")
    assert_nil failed.fetch("claim_id")
    assert_nil failed.fetch("claim_deadline")
    assert_empty claim_jobs(SecureRandom.uuid)
    assert_equal "not_found", finish(last_claim, true).fetch("status")
    assert_equal failed, intent_row

    # AIDEV-NOTE: Repeating the same disposal cannot reset the retry budget after all eight leases are spent.
    dispose("encrypted-access")
    assert_equal failed, intent_row
    assert_empty claim_jobs(SecureRandom.uuid)
  end

  private

  def dispose(access)
    result = invoke("publish_refresh", @digest, @refresh_claim, @generation, @user, @auth,
                    access, "discarded-refresh", @expires)
    assert_equal "unauthorized", result.fetch("status")
  end

  def claim_jobs(claim)
    result = invoke("claim_revocations", claim, 20, connection: @worker)
    assert_equal "ok", result.fetch("status")
    result.fetch("intents")
  end

  def claim_intent(claim)
    jobs = claim_jobs(claim)
    assert_equal 1, jobs.length
    intent = assert_claimed_intent(jobs, id: @intent_id, claim: claim)
    assert_equal "local", intent.fetch("scope")
    intent
  end

  def finish(claim, succeeded)
    invoke("finish_revocation", @intent_id, claim, succeeded, connection: @worker)
  end

  def intent_row
    @admin.exec_params("SELECT * FROM app_auth.revocation_intents WHERE id = $1", [@intent_id]).to_a.fetch(0)
  end

  def assert_pending_replacement(row, access)
    assert_equal "pending", row.fetch("state")
    assert_equal access, row.fetch("access_token_ciphertext")
    assert_equal "0", row.fetch("attempts")
    assert_nil row.fetch("claim_id")
    assert_nil row.fetch("claim_deadline")
  end

  def expire_worker_lease
    # AIDEV-NOTE: Expire only this fixture lease in SQL, avoiding wall-clock sleeps and shared queue edits.
    @admin.exec_params(<<~SQL, [@intent_id])
      UPDATE app_auth.revocation_intents SET claim_deadline = clock_timestamp() - interval '1 second'
        WHERE id = $1
    SQL
  end
end
