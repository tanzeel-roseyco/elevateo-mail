# frozen_string_literal: true

require "minitest/autorun"
require_relative "adv815_expiry_fixture"

# AIDEV-NOTE: No Auth stubs; independent users isolate direct upstream denial from Rails staging denial.
class Adv815ExpiryTest < Minitest::Test
  def setup
    @clients = []
    @aging = Adv815ExpiryFixture.new
  end

  def teardown
    # No timestamp/credential restore. Soren's outer finally must destroy this entire disposable dataset.
    @clients.each { |client| client.cookies.clear }
  end

  def client(origin = "http://api:3000")
    current = Be02Http.new(origin)
    @clients << current
    current
  end

  def status(response, expected)
    assert response.code == expected.to_s, "unexpected HTTP status; response omitted"
    response
  end

  def stage(current, link)
    response = status(current.request("get", link), 303)
    assert response["location"] == "/auth/complete" && response.body.to_s.empty?, "fixed opaque staging required"
    assert response["referrer-policy"] == "no-referrer", "link referrer suppression required"
    @aging.digest(current)
  end

  def accept(current, password, expected = 200)
    status(current.request("post", "/v1/auth/accept", body: { password: password }, headers: current.challenge), expected)
  end

  def identity(current, fixture)
    body = current.json(status(current.request("get", "/v1/session"), 200))
    assert body.dig("actor", "id") == fixture.user && body.dig("organization", "id") == fixture.organization &&
      body["simulation_mode"] == true, "real actor/tenant/outbound hold required"
  end

  def denied(current, response)
    assert current.json(response)["code"] == "unauthenticated", "expected authentication denial"
    assert !current.cookies.key?("elevateo_session"), "denial must not publish session cookie"
    access = status(current.request("get", "/v1/session"), 401)
    assert current.json(access)["code"] == "unauthenticated", "local access must remain denied"
    assert !current.cookies.key?("elevateo_session"), "session read must not publish access"
  end

  def issued(kind)
    fixture = Be02Fixture.new
    link = fixture.invite
    if kind == "recovery"
      initial = client
      stage(initial, link)
      accept(initial, fixture.password)
      identity(initial, fixture)
      requester = client
      response = status(requester.request("post", "/v1/auth/recovery", body: { email: fixture.email },
                                         headers: requester.challenge), 202)
      assert requester.json(response) == { "accepted" => true }, "real recovery issuance required"
      link = fixture.mail_link("recovery")
    end
    [fixture, link]
  end

  def healthy(kind)
    fixture, link = issued(kind)
    current = client
    stage(current, link)
    replacement = "Be02!#{SecureRandom.hex(24)}"
    accept(current, replacement)
    identity(current, fixture)
    assert !current.cookies.key?("elevateo_pending"), "healthy completion must clear pending cookie"
    login = client
    status(login.request("post", "/v1/auth/login", body: { email: fixture.email, password: replacement },
                         headers: login.challenge), 200)
    identity(login, fixture)
  end

  def upstream_negative(kind)
    fixture, link = issued(kind)
    @aging.age_auth(fixture, kind, link)
    query = URI.decode_www_form(URI(link).query).to_h
    assert query["type"] == kind && query["token"].is_a?(String) && !query["token"].empty?, "real link identity required"
    upstream = client("http://auth:9999")
    response = status(upstream.request("post", "/verify", body: { token_hash: query.fetch("token"), type: kind }), 403)
    assert upstream.json(response)["error_code"] == "otp_expired", "must be genuine upstream OTP expiry denial"
  end

  def expired_entry(kind)
    fixture, link = issued(kind)
    @aging.age_auth(fixture, kind, link)
    current = client
    owned = stage(current, link)
    @aging.pending_state(owned, "staged")
    before = @aging.session_count(fixture)
    denied(current, accept(current, "Be02!#{SecureRandom.hex(24)}", 401))
    # Claim succeeded before Auth rejected; local pending expiry would instead retain staged state.
    @aging.pending_state(owned, "uncertain")
    assert @aging.session_count(fixture) == before, "expired OTP must not create local session"
    upstream_negative(kind)
    healthy(kind)
  end

  def test_real_expired_invite
    expired_entry("invite")
  end

  def test_real_expired_recovery
    expired_entry("recovery")
  end

  def test_real_expired_pending_cookie_stops_before_upstream_verification
    fixture, link = issued("invite")
    current = client
    owned = stage(current, link)
    @aging.age_pending(current)
    denied(current, accept(current, fixture.password, 401))
    @aging.pending_state(owned, "staged")
    assert @aging.session_count(fixture).zero?, "expired local staging must not create session"
    # Same genuine link remains usable: local staging denied before consuming the upstream OTP.
    fresh = client
    stage(fresh, link)
    accept(fresh, fixture.password)
    identity(fresh, fixture)
    healthy("invite")
  end
end
