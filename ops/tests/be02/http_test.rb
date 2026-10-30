# frozen_string_literal: true

require "minitest/autorun"
require_relative "http_support"

class Be02HttpAcceptanceTest < Minitest::Test
  def setup
    @fixture = Be02Fixture.new
    @client = Be02Http.new
  end

  def expect(response, code)
    assert_equal code.to_s, response.code, "HTTP status differs (body deliberately omitted)"
    response
  end

  def session
    @client.json(expect(@client.request("get", "/v1/session"), 200))
  end

  def hints(current)
    { "X-Session-Context" => current.fetch("context_id"),
      "X-Authorization-Version" => current.fetch("authorization_version") }
  end

  def test_real_invite_session_reads_rotation_and_revocation
    auth = Be02Http.new("http://auth:9999")
    signup = auth.request("post", "/signup", body: { email: @fixture.email, password: @fixture.password })
    assert signup.code.to_i.between?(400, 499), "public signup must remain disabled"
    expect(@client.request("get", "/v1/session"), 401)
    link = @fixture.invite
    # AIDEV-NOTE: Scanner GETs may stage state but must leave the one-time Auth token usable by the browser flow.
    scanner = Be02Http.new
    expect(scanner.request("get", link), 303)
    staged = expect(@client.request("get", link), 303)
    assert_equal "/auth/complete", URI(staged["location"]).path
    assert_equal "no-referrer", staged["referrer-policy"]
    response = expect(@client.request("post", "/v1/auth/accept", body: { password: @fixture.password },
                                      headers: @client.challenge), 200)
    cookie = response.get_fields("set-cookie").to_a.find { |value| value.start_with?("elevateo_session=") }
    assert cookie && cookie.downcase.include?("httponly") && cookie.downcase.include?("samesite=strict"),
           "session cookie must be HttpOnly/SameSite Strict"
    refute @client.json(response).key?("access_token"), "Auth tokens must stay server-side"
    current = session
    assert_equal @fixture.user, current.fetch("actor").fetch("id")
    assert_equal @fixture.organization, current.fetch("organization").fetch("id")
    assert_equal true, current.fetch("simulation_mode")
    mailboxes = @client.json(expect(@client.request("get", "/v1/mailboxes", headers: hints(current)), 200))
    assert_equal [@fixture.mailbox], mailboxes.fetch("items").map { |item| item.fetch("id") }
    assert_equal({ "read" => true, "compose" => false, "approve_send" => false, "manage_members" => false },
                 mailboxes.fetch("items").first.fetch("capabilities"))
    expect(@client.request("get", "/v1/mailboxes/#{@fixture.hidden_mailbox}/threads", headers: hints(current)), 404)
    page = @client.json(expect(@client.request("get", "/v1/mailboxes/#{@fixture.mailbox}/threads", headers: hints(current)), 200))
    assert_equal [@fixture.thread], page.fetch("items").map { |item| item.fetch("id") }
    detail = @client.json(expect(@client.request("get", "/v1/threads/#{@fixture.thread}?mailbox_id=#{@fixture.mailbox}",
                                               headers: hints(current)), 200))
    assert_equal "<script>fixture remains plaintext</script>", detail.fetch("messages").first.fetch("body_text")
    # Origin/CSRF failures must not switch the active tenant or revoke the session.
    bad = @client.request("post", "/v1/session/organization", body: { organization_id: @fixture.other_organization },
                          headers: hints(current).merge("Origin" => "http://invalid.example", "X-CSRF-Token" => "invalid"))
    assert bad.code.to_i.between?(400, 499)
    assert_equal @fixture.organization, session.fetch("organization").fetch("id")
    switched = expect(@client.request("post", "/v1/session/organization", body: { organization_id: @fixture.other_organization },
                       headers: hints(current).merge("Origin" => "http://api:3000", "X-CSRF-Token" => current.fetch("csrf_token"))), 200)
    assert_equal @fixture.other_organization, @client.json(switched).fetch("session").fetch("organization").fetch("id")
    expect(@client.request("get", "/v1/mailboxes", headers: hints(current)), 409)
    expect(@client.request("post", "/v1/auth/refresh", body: {}, headers: @client.challenge), 200)
    expect(@client.request("post", "/v1/auth/logout", body: { scope: "local" }, headers: @client.challenge), 200)
    expect(@client.request("get", "/v1/session"), 401)
    expect(@client.request("post", "/v1/auth/login", body: { email: @fixture.email, password: @fixture.password },
                           headers: @client.challenge), 200)
    expect(@client.request("post", "/v1/auth/logout", body: { scope: "global" }, headers: @client.challenge), 200)
    expect(@client.request("get", "/v1/session"), 401)
  end
end
