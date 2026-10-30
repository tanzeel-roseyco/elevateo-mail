# frozen_string_literal: true

require_relative "auth_test_helper"

class SessionSecurityTest < Minitest::Test
  include AuthFixtures

  def test_ciphertext_authentication_and_purpose_separation
    crypto = Elevateo::SessionCrypto.new(config: config)
    encrypted = crypto.encrypt("secret", purpose: "access")
    refute_includes encrypted, "secret"
    assert_equal "secret", crypto.decrypt(encrypted, purpose: "access")
    assert_auth(503) { crypto.decrypt(encrypted, purpose: "refresh") }
    bytes = Base64.strict_decode64(encrypted)
    bytes.setbyte(-1, bytes.getbyte(-1) ^ 1)
    assert_auth(503) { crypto.decrypt(Base64.strict_encode64(bytes), purpose: "access") }
    assert_match(/\A[0-9a-f]{64}\z/, crypto.digest(crypto.cookie))
  end

  def test_challenge_binds_origin_caller_and_pending_invitation
    crypto = Elevateo::SessionCrypto.new(config: config)
    challenge = Elevateo::SessionChallenges.new(config: config, crypto: crypto)
    caller, pending = crypto.cookie, crypto.cookie
    issued = challenge.issue(session_cookie: caller, pending_cookie: pending)
    args = { cookie: issued[:cookie], proof: issued[:body]["csrf_token"], origin: config.browser_origin,
      session_cookie: caller, pending_cookie: pending }
    assert challenge.verify!(**args)
    [{ origin: "https://evil.test" }, { session_cookie: crypto.cookie }, { pending_cookie: crypto.cookie },
      { proof: "wrong" }].each { |mutation| assert_auth(400) { challenge.verify!(**args.merge(mutation)) } }
  end

  def test_challenge_expires_without_io
    now, crypto = Time.now, Elevateo::SessionCrypto.new(config: config)
    challenge = Elevateo::SessionChallenges.new(config: config, crypto: crypto, clock: -> { now })
    issued = challenge.issue(session_cookie: nil, pending_cookie: nil)
    now += 301
    assert_auth(400) { challenge.verify!(cookie: issued[:cookie], proof: issued[:body]["csrf_token"],
      origin: config.browser_origin, session_cookie: nil, pending_cookie: nil) }
  end

  def test_missing_invalid_or_wrong_sid_and_identity_are_rejected
    tokens, client = Elevateo::AuthTokens.new(config: config), Client.new(jwt, USER)
    [nil, "invalid", ""].each { |sid| assert_auth(401) { tokens.claims(jwt("session_id" => sid)) } }
    assert_auth(401) { tokens.verified(client.response, client: client, deadline: deadline, expected_session: ORG) }
    assert_auth(401) { tokens.identity(jwt, { "id" => ORG }) }
    assert_auth(401) { tokens.claims(jwt("exp" => Time.now.to_i - 1)) }
    assert_auth(503) { tokens.claims("malformed") }
  end

  def test_boundaries_reject_duplicate_unknown_null_and_oversize_values
    ['{"email":null,"email":"x"}', '{"email":"x","extra":1}', "null", "[]", "x" * 8193].each do |body|
      assert_auth(400) { Elevateo::AuthInput.body(body, required: ["email"]) }
    end
    assert_auth(400) { Elevateo::AuthInput.email(nil) }
    assert_auth(400) { Elevateo::AuthInput.password("x" * 1025) }
    assert_auth(400) { Elevateo::AuthInput.query("token=a&token=b", allowed: ["token"]) }
  end

  def test_token_envelope_is_bounded_before_trusted_user_io
    tokens, client = Elevateo::AuthTokens.new(config: config), Client.new(jwt, USER)
    [{ "expires_in" => nil }, { "expires_in" => 3601 }, { "token_type" => "other" }, { "user" => nil }].each do |mutation|
      assert_auth(503) { tokens.verified(client.response.merge(mutation), client: client, deadline: deadline) }
    end
    assert_auth(401) do
      tokens.verified(client.response.merge("user" => { "id" => ORG }), client: client, deadline: deadline)
    end
    assert_empty client.calls
  end

  def test_monotonic_total_deadline_clips_upstream_budget
    now = 10.0
    budget = Elevateo::RequestDeadline.new(clock: -> { now })
    assert_equal 2.0, budget.timeout
    now = 19.5
    assert_equal 0.5, budget.timeout
    now = 20.0
    assert_auth(503) { budget.check! }
  end
end
