# frozen_string_literal: true

require "/source/ops/tests/be02/http_support"
require_relative "http_approval"

# AIDEV-NOTE: Model the private TLS-terminated proxy hop; this client does not establish browser TLS acceptance.
class LaunchMailflowHttpClient < Be02Http
  def request(method, path, body: nil, headers: {})
    super(method, path, body: body, headers: headers.merge("X-Forwarded-Proto" => "https"))
  end

  def challenge
    super.merge("Origin" => "https://mail.elevateoco.com")
  end
end

# AIDEV-NOTE: Frozen Auth fixture requests its local redirect; staging must use the API's configured browser origin.
class LaunchMailflowHttpFixture < Be02Fixture
  def mail_link(kind)
    uri = URI(super)
    query = URI.decode_www_form(uri.query).to_h
    raise "unexpected fixture redirect" unless query.fetch("redirect_to") == "http://api:3000/auth/complete"
    query["redirect_to"] = "https://mail.elevateoco.com/auth/complete"
    uri.query = URI.encode_www_form(query)
    uri.to_s
  end
end

# AIDEV-NOTE: Auth issues real cookies; only synthetic organization grants are seeded with administrative SQL.
module LaunchMailflowHttpChain
  include LaunchMailflowHttpApproval
  def http_expect(response, status)
    assert_equal status.to_s, response.code, "isolated HTTP status differs; response body withheld"
    response
  end

  def http_session(client)
    client.json(http_expect(client.request("get", "/v1/session"), 200))
  end

  def http_hints(session)
    { "X-Session-Context" => session.fetch("context_id"),
      "X-Authorization-Version" => session.fetch("authorization_version"),
      "Origin" => "https://mail.elevateoco.com", "X-CSRF-Token" => session.fetch("csrf_token") }
  end

  def save_reply_over_http
    fixture = LaunchMailflowHttpFixture.new
    client = LaunchMailflowHttpClient.new
    # AIDEV-NOTE: Valid-shaped context reaches authentication; missing context is rejected earlier with 400.
    http_expect(client.request("get", "/v1/threads", headers: {
      "X-Session-Context" => "a" * 32, "X-Authorization-Version" => "b" * 32 }), 401)
    http_expect(client.request("get", fixture.invite), 303)
    http_expect(client.request("post", "/v1/auth/accept", body: { password: fixture.password },
      headers: client.challenge), 200)
    grant_http_user(fixture.user)
    current = http_session(client)
    switched = http_expect(client.request("post", "/v1/session/organization",
      body: { organization_id: @org }, headers: http_hints(current)), 200)
    current = client.json(switched).fetch("session")
    check_ungranted_mailbox(client, current)
    grant_http_mailbox(fixture.user)
    current = http_session(client)
    page = client.json(http_expect(client.request("get", "/v1/threads", headers: http_hints(current)), 200))
    imported = page.fetch("items").find { |item| item.fetch("id") == @received.fetch("thread_id") }
    refute_nil imported, "real HTTP inbox omitted the imported thread"
    assert_equal @box, imported.fetch("mailbox_id")
    # AIDEV-NOTE: Drafts are actor-private; the authenticated user creates its own reply instead of editing a peer's.
    @draft = SecureRandom.uuid
    wire = { mailbox_id: @box, operation_id: SecureRandom.uuid, expected_version: 0,
      reply_to_thread_id: @received.fetch("thread_id"), subject: "Reply #{@nonce}", body_text: "Response #{@nonce}",
      to: [{ display_name: nil, address: @identities[0] }] }
    denied = client.request("put", "/v1/drafts/#{@draft}", body: wire,
      headers: http_hints(current).merge("X-CSRF-Token" => "invalid" * 8))
    http_expect(denied, 400)
    assert_equal "request_invalid", client.json(denied).fetch("code")
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app.drafts WHERE id=$1", [@draft]).getvalue(0, 0)
    http_expect(client.request("put", "/v1/drafts/#{@draft}", body: wire, headers: http_hints(current)), 200)
    stale_review = review_reply_over_http(client, current)
    wire.merge!(operation_id: SecureRandom.uuid, expected_version: 1)
    http_expect(client.request("put", "/v1/drafts/#{@draft}", body: wire, headers: http_hints(current)), 200)
    assert_equal "2", @admin.exec_params("SELECT version FROM app.drafts WHERE id=$1", [@draft]).getvalue(0, 0)
    send_id = approve_reply_over_http(client, current, fixture.user, stale_review)
    yield send_id
    http_expect(client.request("post", "/v1/auth/logout", body: { scope: "local" }, headers: client.challenge), 200)
    http_expect(client.request("get", "/v1/session"), 401)
  end

  def check_ungranted_mailbox(client, session)
    # AIDEV-NOTE: A valid organization session without this private mailbox grant must neither read nor create replies.
    page = client.json(http_expect(client.request("get", "/v1/threads", headers: http_hints(session)), 200))
    refute_includes page.fetch("items").map { |item| item.fetch("id") }, @received.fetch("thread_id")
    draft = SecureRandom.uuid
    wire = { mailbox_id: @box, operation_id: SecureRandom.uuid, expected_version: 0,
      reply_to_thread_id: @received.fetch("thread_id"), subject: "Denied", body_text: "Denied",
      to: [{ display_name: nil, address: @identities[0] }] }
    response = http_expect(client.request("put", "/v1/drafts/#{draft}", body: wire, headers: http_hints(session)), 404)
    assert_equal "not_available", client.json(response).fetch("code")
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app.drafts WHERE id=$1", [draft]).getvalue(0, 0)
  end

  def grant_http_user(user)
    fixture_change do
      @admin.exec_params("SELECT app_auth.lock_authorization_generations($1,$2)", [@org, user])
      @admin.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES($1,$2)", [@org, user])
      # AIDEV-NOTE: Keep the single owner; this actor receives explicit compose/approval grants on only this mailbox.
      @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES($1,$2,'operator')", [@org, user])
    end
  end

  def grant_http_mailbox(user)
    fixture_change do
      @admin.exec_params("SELECT app_auth.lock_authorization_generations($1,$2)", [@org, user])
      @admin.exec_params("INSERT INTO app.mailbox_memberships(organization_id,mailbox_id,user_id,compose,approve_send) VALUES($1,$2,$3,true,true)",
        [@org, @box, user])
      @admin.exec_params(<<~SQL, [@org, @box, user])
        INSERT INTO app.mailbox_grant_ceilings(organization_id,mailbox_id,user_id,compose,manage_members)
          VALUES($1,$2,$3,true,false)
      SQL
    end
  end
end
