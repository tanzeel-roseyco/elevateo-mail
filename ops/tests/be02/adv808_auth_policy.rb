# frozen_string_literal: true

require_relative "http_support"

# AIDEV-NOTE: Real Auth issues every session; SQL changes only this probe's isolated actor policy metadata.
class Adv808AuthPolicy
  def check(condition, code)
    raise code unless condition
  end

  def json(client, response, status)
    check(response.code == status.to_s, "adv808_status")
    check(response.body.bytesize <= 65_536, "adv808_response_bound")
    check(response["content-type"].to_s.split(";").first == "application/json", "adv808_media")
    client.json(response)
  end

  def grant(fixture)
    value = json(@auth, @auth.request("post", "/token?grant_type=password",
      body: { email: fixture.email, password: fixture.password }), 200)
    credentials(value, fixture.user)
  end

  def credentials(value, user, sid = nil)
    access, refresh = value.values_at("access_token", "refresh_token")
    check(access.is_a?(String) && access.bytesize.between?(1, 8192), "adv808_access")
    check(refresh.is_a?(String) && refresh.bytesize.between?(12, 4096), "adv808_refresh")
    check(value["token_type"] == "bearer" && value["expires_in"].is_a?(Integer) &&
      value["expires_in"].between?(1, 3600), "adv808_remaining_lifetime")
    claims = JSON.parse(Base64.urlsafe_decode64(access.split(".").fetch(1)))
    check(claims["sub"] == user && claims["aal"] == "aal1" && claims.fetch("exp") - claims.fetch("iat") == 3600,
      "adv808_claim_identity_and_jwt_lifetime")
    check(/\A[0-9a-f-]{36}\z/.match?(claims.fetch("session_id")), "adv808_sid")
    check(sid.nil? || claims["session_id"] == sid, "adv808_refresh_binding")
    online = json(@auth, @auth.request("get", "/user", headers: { "Authorization" => "Bearer #{access}" }), 200)
    check(online["id"] == user && value.fetch("user")["id"] == user, "adv808_online_identity")
    [access, refresh, claims.fetch("session_id")]
  end

  def refresh(tokens, user)
    value = json(@auth, @auth.request("post", "/token?grant_type=refresh_token",
      body: { refresh_token: tokens.fetch(1) }), 200)
    credentials(value, user, tokens.fetch(2))
  end

  def actor
    fixture = Be02Fixture.new
    # AIDEV-NOTE: Keep these actors outside the historical be02-http worker-drain dataset.
    fixture.instance_variable_set(:@email, "adv808-policy-#{SecureRandom.hex(12)}@example.invalid")
    client = Be02Http.new
    check(client.request("get", fixture.invite).code == "303", "adv808_stage")
    accepted = json(client, client.request("post", "/v1/auth/accept",
      body: { password: fixture.password }, headers: client.challenge), 200)
    check(accepted.fetch("session").fetch("actor")["id"] == fixture.user, "adv808_accept_identity")
    check(!accepted.key?("access_token") && !accepted.key?("refresh_token"), "adv808_server_tokens")
    tokens = grant(fixture)
    current = read(client, fixture.user)
    page = json(client, client.request("get", "/v1/mailboxes", headers: hints(current)), 200)
    check(page.fetch("items").map { |item| item.fetch("id") } == [fixture.mailbox], "adv808_real_mailbox")
    rows = @db.exec_params("SELECT id FROM auth.sessions WHERE user_id = $1", [fixture.user])
    check(rows.ntuples == 2 && rows.column_values(0).include?(tokens.fetch(2)), "adv808_real_sessions")
    [fixture, client, tokens]
  end

  def read(client, user)
    value = json(client, client.request("get", "/v1/session"), 200)
    check(value.fetch("actor")["id"] == user && value["simulation_mode"] == true, "adv808_read_identity")
    value
  end

  def hints(current)
    { "X-Session-Context" => current.fetch("context_id"),
      "X-Authorization-Version" => current.fetch("authorization_version") }
  end

  def denied(client, response)
    value = json(client, response, 401)
    check(value.keys.sort == %w[code message request_id] && value["code"] == "unauthenticated",
      "adv808_generic_error")
    check(value["message"].is_a?(String) && value["message"].length <= 256 &&
      value["request_id"].is_a?(String) && value["request_id"].length.between?(1, 128), "adv808_error_bounds")
    value.fetch("message")
  end

  def auth_denied(tokens, code)
    value = json(@auth, @auth.request("post", "/token?grant_type=refresh_token",
      body: { refresh_token: tokens.fetch(1) }), 400)
    check(value["error_code"] == code && !value.key?("access_token") && !value.key?("refresh_token"),
      "adv808_policy_reason")
  end

  def run
    check(ENV.fetch("ADV808_DISPOSABLE") == "1", "adv808_disposable_required")
    @auth = Be02Http.new("http://auth:9999")
    health = json(@auth, @auth.request("get", "/health"), 200)
    check(health["name"] == "GoTrue" && health["version"] == "v2.196.0", "adv808_version")
    uri = URI.parse(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
    check(uri.scheme == "postgres" && uri.host == "db" && uri.port == 5432 &&
      uri.path == "/postgres" && uri.user == "supabase_admin" && uri.query.nil?, "adv808_isolated_database")
    @db = PG.connect(uri.to_s)
    check(@db.exec("SELECT session_user").getvalue(0, 0) == "supabase_admin", "adv808_admin_identity")
    control, control_client, control_tokens = actor
    unknown = Be02Http.new
    generic = denied(unknown, unknown.request("post", "/v1/auth/login",
      body: { email: "adv808-unknown-#{SecureRandom.hex(12)}@example.invalid", password: "invalid-password" },
      headers: unknown.challenge))
    %w[ban not_after timebox local_idle].each do |policy|
      fixture, client, tokens = actor
      tokens = refresh(tokens, fixture.user)
      current = read(client, fixture.user)
      case policy
      when "ban"
        changed = @db.exec_params("UPDATE auth.users SET banned_until = clock_timestamp() + interval '1 hour' WHERE id = $1",
          [fixture.user])
      when "not_after"
        changed = @db.exec_params("UPDATE auth.sessions SET not_after = clock_timestamp() - interval '1 minute' WHERE user_id = $1",
          [fixture.user])
      when "timebox"
        changed = @db.exec_params("UPDATE auth.sessions SET created_at = clock_timestamp() - interval '13 hours' WHERE user_id = $1",
          [fixture.user])
      when "local_idle"
        changed = @db.exec_params("UPDATE app_auth.sessions SET idle_expires_at = clock_timestamp() - interval '1 minute' WHERE user_id = $1",
          [fixture.user])
      end
      check(changed.cmd_tuples == (policy == "ban" || policy == "local_idle" ? 1 : 2), "adv808_mutation_scope")
      online = @auth.request("get", "/user", headers: { "Authorization" => "Bearer #{tokens.fetch(0)}" })
      value = json(@auth, online, policy == "ban" ? 403 : 200)
      check(policy == "ban" ? value["error_code"] == "user_banned" : value["id"] == fixture.user,
        "adv808_online_policy")
      cookie = client.cookies.fetch("elevateo_session")
      check(denied(client, client.request("get", "/v1/session")) == generic, "adv808_no_policy_leak")
      check(client.cookies["elevateo_session"] == cookie, "adv808_cookie_retained")
      check(denied(client, client.request("get", "/v1/mailboxes", headers: hints(current))) == generic,
        "adv808_protected_mail_denied")
      check(denied(client, client.request("post", "/v1/auth/refresh", body: {}, headers: client.challenge)) == generic,
        "adv808_refresh_denied")
      if policy == "local_idle"
        refresh(tokens, fixture.user) # Auth inactivity disabled; local idle is a separate authority.
      else
        auth_denied(tokens, policy == "ban" ? "user_banned" : "session_expired")
      end
      read(control_client, control.user)
      control_tokens = refresh(control_tokens, control.user)
      puts "ADV808 #{policy} real-policy proof completed"
    end
    fixture, client, tokens = actor
    changed = @db.exec_params(<<~SQL, [tokens.fetch(2), fixture.user])
      UPDATE auth.sessions SET created_at = clock_timestamp() - interval '2 hours',
        refreshed_at = clock_timestamp() - interval '2 hours' WHERE id = $1 AND user_id = $2
    SQL
    check(changed.cmd_tuples == 1, "adv808_inactivity_scope")
    tokens = refresh(tokens, fixture.user)
    newer = grant(fixture)
    check(newer.fetch(2) != tokens.fetch(2), "adv808_distinct_sessions")
    tokens = refresh(tokens, fixture.user)
    refresh(newer, fixture.user)
    refresh(tokens, fixture.user)
    read(client, fixture.user)
    value = json(client, client.request("post", "/v1/auth/refresh", body: {}, headers: client.challenge), 200)
    check(value.fetch("session").fetch("actor")["id"] == fixture.user, "adv808_local_refresh_identity")
    read(control_client, control.user)
    puts "ADV808 disabled-inactivity/multiple-AAL1-sessions eligible refresh completed"
  ensure
    @db&.close
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    Adv808AuthPolicy.new.run
  rescue StandardError
    warn "ADV808 policy proof FAILED (details withheld to protect credentials)"
    exit 1
  end
end
