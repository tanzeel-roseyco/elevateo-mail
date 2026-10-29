# frozen_string_literal: true

require_relative "auth_test_helper"
require_relative "../../lib/elevateo/authentik_identity"
require_relative "../../lib/elevateo/authentik_discovery"

# AIDEV-NOTE: These tests isolate revocation policy; actual Authentik/GoTrue verification needs the fleet gate.
class AuthentikIdentityTest < Minitest::Test
  SUBJECT = "11111111-1111-4111-8111-111111111111"
  GROUP = "22222222-2222-4222-8222-222222222222"
  EMAIL = "tanzeel@elevateoco.com"

  def setup
    @config = OpenStruct.new(sso_enabled: true, sso_provider: "custom:authentik",
      authentik_issuer: "https://identity.example.test/application/o/elevateo-mail/", authentik_group: GROUP)
    @user = { "email" => EMAIL, "identities" => [{ "provider" => "custom:authentik",
      "identity_data" => { "sub" => SUBJECT, "email" => EMAIL, "email_verified" => true } }] }
    @current = { "uuid" => SUBJECT, "email" => EMAIL, "is_active" => true,
      "attributes" => { "email_verified_address" => EMAIL }, "groups" => [GROUP] }
  end

  def check(current = @current, status: 200, type: "application/json", body: nil)
    transport = lambda do |subject, timeout|
      assert_equal SUBJECT, subject
      assert_operator timeout, :>, 0
      [status, type, body || JSON.generate({ "pagination" => { "count" => 1 }, "results" => [current] })]
    end
    Elevateo::AuthentikIdentity.new(config: @config, transport: transport).check!(@user,
      deadline: Elevateo::RequestDeadline.new)
  end

  def test_active_verified_member_is_allowed
    assert check
  end

  def test_upstream_revocation_is_observed_on_every_request
    lookups = 0
    # AIDEV-NOTE: Reuse the verifier so an accidental instance cache cannot conceal later revocation.
    transport = lambda do |*|
      lookups += 1
      [200, "application/json", JSON.generate({ "pagination" => { "count" => 1 }, "results" => [@current] })]
    end
    verifier = Elevateo::AuthentikIdentity.new(config: @config, transport: transport)
    assert verifier.check!(@user, deadline: Elevateo::RequestDeadline.new)
    assert_equal 1, lookups
    @current["groups"] = []
    assert_raises(Elevateo::AuthError) { verifier.check!(@user, deadline: Elevateo::RequestDeadline.new) }
    assert_equal 2, lookups
    @current["groups"] = [GROUP]
    @current["is_active"] = false
    assert_raises(Elevateo::AuthError) { verifier.check!(@user, deadline: Elevateo::RequestDeadline.new) }
    assert_equal 3, lookups
  end

  def test_upstream_identity_and_verified_address_must_match
    [{ "uuid" => GROUP }, { "email" => "other@elevateoco.com" },
      { "attributes" => {} }, { "attributes" => { "email_verified_address" => "old@elevateoco.com" } }].each do |change|
      assert_raises(Elevateo::AuthError) { check(@current.merge(change)) }
    end
  end

  def test_unverified_wrong_provider_and_ambiguous_identities_are_rejected
    data = @user.fetch("identities").first.fetch("identity_data")
    data["email_verified"] = "true"
    assert_raises(Elevateo::AuthError) { check }
    data["email_verified"] = true
    @user["identities"] *= 2
    assert_raises(Elevateo::AuthError) { check }
    @user["identities"] = [{ "provider" => "google", "identity_data" => data }]
    assert_raises(Elevateo::AuthError) { check }
  end

  def test_outages_malformed_and_unbounded_responses_fail_closed
    [401, 403, 404, 429, 500].each { |status| assert_raises(Elevateo::AuthError) { check(status: status) } }
    ["{}", "[]", "invalid", " " * 65_537].each do |body|
      assert_raises(Elevateo::AuthError) { check(body: body) }
    end
    assert_raises(Elevateo::AuthError) { check(type: "text/html") }
  end

  def test_discovery_requires_signed_id_token_without_userinfo_fallback
    document = Elevateo::AuthentikDiscovery.document(@config)
    assert_equal @config.authentik_issuer, document.fetch("issuer")
    assert_equal ["RS256"], document.fetch("id_token_signing_alg_values_supported")
    assert_equal ["S256"], document.fetch("code_challenge_methods_supported")
    refute document.key?("userinfo_endpoint")
    @config.sso_enabled = false
    assert_raises(Elevateo::AuthError) { Elevateo::AuthentikDiscovery.document(@config) }
  end

  def test_tls_failure_is_a_deliberate_unavailable_error
    transport = ->(*) { raise OpenSSL::SSL::SSLError, "certificate rejected" }
    error = assert_raises(Elevateo::AuthError) do
      Elevateo::AuthentikIdentity.new(config: @config, transport: transport).check!(@user,
        deadline: Elevateo::RequestDeadline.new)
    end
    assert_equal 503, error.status
    refute_includes error.message, "certificate rejected"
  end
end
