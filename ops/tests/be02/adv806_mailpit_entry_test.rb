# frozen_string_literal: true

require "minitest/autorun"
require "digest"
require_relative "http_support"

# AIDEV-NOTE: Real HTTP-only proof; each case owns its Auth user, app rows and opaque client cookie jars.
class Adv806MailpitEntryTest < Minitest::Test
  def setup
    @fixture = Be02Fixture.new
    @client = Be02Http.new
  end

  def status(response, expected)
    assert response.code == expected.to_s, "unexpected HTTP status; response omitted"
    response
  end

  def stage(client, link)
    response = status(client.request("get", link), 303)
    assert response["location"] == "/auth/complete", "callback must be the fixed local path"
    assert response["referrer-policy"] == "no-referrer", "callback must suppress referrers"
    assert response.body.to_s.empty?, "callback must not expose link material"
    assert client.cookies.key?("elevateo_pending"), "callback must stage an opaque cookie"
  end

  def accept(client, password, expected = 200)
    status(client.request("post", "/v1/auth/accept", body: { password: password },
                          headers: client.challenge), expected)
  end

  def identity(client)
    current = client.json(status(client.request("get", "/v1/session"), 200))
    assert current.dig("actor", "id") == @fixture.user, "real Auth actor must match fixture"
    assert current.dig("organization", "id") == @fixture.organization, "tenant must match fixture"
    assert current["simulation_mode"] == true, "outbound hold must remain enabled"
  end

  def denied(client)
    response = status(client.request("get", "/v1/session"), 401)
    assert client.json(response)["code"] == "unauthenticated", "expected authentication denial"
    refute client.cookies.key?("elevateo_session"), "failed entry must not publish local access"
  end

  def reject_replay(link, password)
    replay = Be02Http.new
    stage(replay, link)
    response = accept(replay, password, 401)
    assert replay.json(response)["code"] == "unauthenticated", "replay must fail as authentication denial"
    denied(replay)
  end

  def entry_state(client, state)
    pending = client.cookies.fetch("elevateo_pending")
    assert /\A[A-Za-z0-9_-]{43}\z/.match?(pending), "pending cookie must be opaque"
    PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL")) do |db|
      assert db.exec("SELECT session_user").getvalue(0, 0) == "supabase_admin", "wrong fixture authority"
      rows = db.exec_params(<<~SQL, [Digest::SHA256.hexdigest(pending)])
        SELECT state, user_id, claim_id IS NULL AS released, auth_session_id IS NOT NULL AS verified
        FROM app_auth.pending_entries WHERE digest=$1
      SQL
      assert rows.ntuples == 1, "expected exactly the owned pending entry"
      row = rows.first
      assert row["state"] == state && row["user_id"] == @fixture.user, "unexpected entry state/actor"
      assert row["released"] == "t" && row["verified"] == "t", "verified password retry must release claim"
    end
  end

  def recover(client, email)
    response = status(client.request("post", "/v1/auth/recovery", body: { email: email },
                                     headers: client.challenge), 202)
    body = client.json(response)
    assert body == { "accepted" => true }, "recovery must return only the generic outcome"
    refute client.cookies.key?("elevateo_session"), "recovery request must not log in"
    assert response["content-type"].to_s.start_with?("application/json"), "recovery must return JSON"
    response
  end

  def test_real_invite_replay_cannot_replace_password_or_publish_access
    # Reuse established real invite/seed authority; do not duplicate the existing read/rotation suite.
    link = @fixture.invite
    stage(@client, link)
    accept(@client, @fixture.password)
    identity(@client)
    reject_replay(link, "Be02!#{SecureRandom.hex(24)}")
    login = Be02Http.new
    status(login.request("post", "/v1/auth/login", body: { email: @fixture.email, password: @fixture.password },
                         headers: login.challenge), 200)
    identity(login)
  end

  def test_real_recovery_is_generic_scanner_safe_and_resumes_verified_password_step
    stage(@client, @fixture.invite)
    accept(@client, @fixture.password)
    identity(@client)
    known, unknown = Be02Http.new, Be02Http.new
    known_response = recover(known, @fixture.email)
    unknown_response = recover(unknown, "adv806-unknown-#{SecureRandom.hex(16)}@example.invalid")
    assert known_response.body == unknown_response.body, "known/unknown recovery outcomes must match"
    link = @fixture.mail_link("recovery")
    scanner = Be02Http.new
    stage(scanner, link)
    denied(scanner)
    stage(known, link)
    # AIDEV-NOTE: Pinned Auth rejects the current password after real verification; no fabricated Auth response.
    response = accept(known, @fixture.password, 400)
    assert known.json(response)["code"] == "request_invalid", "expected known password rejection"
    denied(known)
    entry_state(known, "password_pending")
    reject_replay(link, "Be02!#{SecureRandom.hex(24)}")
    # Model closing the password client and resuming with only its owned pending cookie, no session/CSRF reuse.
    resumed = Be02Http.new
    resumed.cookies["elevateo_pending"] = known.cookies.fetch("elevateo_pending")
    replacement = "Be02!#{SecureRandom.hex(24)}"
    accept(resumed, replacement)
    identity(resumed)
    refute resumed.cookies.key?("elevateo_pending"), "completion must clear staging"
    accept(known, replacement, 401)
    denied(known)
    reject_replay(link, replacement)
    login = Be02Http.new
    old = status(login.request("post", "/v1/auth/login", body: { email: @fixture.email, password: @fixture.password },
                               headers: login.challenge), 401)
    assert login.json(old)["code"] == "unauthenticated", "old password must no longer authenticate"
    denied(login)
    status(login.request("post", "/v1/auth/login", body: { email: @fixture.email, password: replacement },
                         headers: login.challenge), 200)
    identity(login)
  end
end
