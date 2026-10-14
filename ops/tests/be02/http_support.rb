# frozen_string_literal: true

require "net/http"
require "json"
require "uri"
require "cgi"
require "openssl"
require "base64"
require "securerandom"
require "pg"

# AIDEV-NOTE: Real requests only; cookie handling models an HTTP client, not browser/SameSite enforcement.
class Be02Http
  attr_reader :cookies

  def initialize(origin = "http://api:3000")
    @origin, @cookies = origin, {}
  end

  def request(method, path, body: nil, headers: {})
    uri = URI.join(@origin, path)
    raise "fixture crossed origin" unless "#{uri.scheme}://#{uri.host}:#{uri.port}" == @origin
    request = Net::HTTP.const_get(method.capitalize).new(uri)
    request["Cookie"] = cookies.map { |key, value| "#{key}=#{value}" }.join("; ") unless cookies.empty?
    headers.each { |key, value| request[key] = value }
    if body
      request["Content-Type"] = "application/json"
      request.body = JSON.generate(body)
    end
    result = Net::HTTP.start(uri.host, uri.port, nil, open_timeout: 3, read_timeout: 10) { |http| http.request(request) }
    result.get_fields("set-cookie").to_a.each do |cookie|
      key, value = cookie.split(";", 2).first.split("=", 2)
      value.to_s.empty? ? cookies.delete(key) : cookies[key] = value
    end
    result
  end

  def json(response)
    # AIDEV-NOTE: Callers inspect object fields; reject scalar/array JSON without exposing response secrets.
    parsed = JSON.parse(response.body)
    raise "fixture expected JSON object" unless parsed.is_a?(Hash)
    parsed
  rescue JSON::ParserError
    raise "fixture received invalid JSON" # Do not echo token-bearing response bodies.
  end

  def challenge
    response = request("get", "/v1/auth/login-challenge")
    raise "challenge failed with #{response.code}" unless response.code == "200"
    { "Origin" => @origin, "X-CSRF-Token" => json(response).fetch("csrf_token") }
  end
end

class Be02Fixture
  attr_reader :email, :password, :user, :organization, :other_organization, :mailbox, :hidden_mailbox, :thread

  def initialize
    @email = "be02-http-#{SecureRandom.hex(8)}@example.invalid"
    @password = "Be02!#{SecureRandom.hex(24)}"
    @organization, @other_organization = [SecureRandom.uuid, SecureRandom.uuid].sort
    @mailbox, @hidden_mailbox, @thread = Array.new(3) { SecureRandom.uuid }
  end

  def invite
    auth = Be02Http.new("http://auth:9999")
    encode = ->(value) { Base64.urlsafe_encode64(JSON.generate(value), padding: false) }
    input = [encode.call({ alg: "HS256", typ: "JWT" }), encode.call({ role: "service_role", aud: "authenticated",
      iss: "http://auth:9999", iat: Time.now.to_i, exp: Time.now.to_i + 120 })].join(".")
    signature = OpenSSL::HMAC.digest("SHA256", ENV.fetch("BE02_FIXTURE_SIGNING_SECRET"), input)
    jwt = "#{input}.#{Base64.urlsafe_encode64(signature, padding: false)}"
    response = auth.request("post", "/invite?redirect_to=http%3A%2F%2Fapi%3A3000%2Fauth%2Fcomplete",
                            body: { email: email }, headers: { "Authorization" => "Bearer #{jwt}" })
    raise "real Auth invite failed with #{response.code}" unless response.code == "200"
    @user = auth.json(response).fetch("id")
    raise "Auth invite omitted user identity" unless /\A[0-9a-f-]{36}\z/.match?(@user)
    seed
    mail_link("invite")
  end

  def mail_link(kind)
    client = Be02Http.new("http://mailpit:8025")
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 25
    loop do
      list = client.json(client.request("get", "/api/v1/messages"))
      list.fetch("messages").each do |message|
        next unless message.fetch("To").any? { |recipient| recipient["Address"] == email }
        detail = client.json(client.request("get", "/api/v1/message/#{message.fetch('ID')}"))
        text = CGI.unescapeHTML(detail["HTML"].to_s + detail["Text"].to_s)
        links = text.scan(%r{http://api:3000/auth/accept\?[^\s<>"']+})
        link = links.find { |candidate| URI.decode_www_form(URI(candidate).query).to_h["type"] == kind }
        return URI(link).request_uri if link
      end
      raise "Mailpit did not deliver #{kind}" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
      sleep 0.5
    end
  end

  def seed
    # AIDEV-NOTE: Only app fixtures use admin SQL; Auth identity and sessions are issued through real Auth endpoints.
    PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL")) do |db|
      raise "fixture admin identity mismatch" unless db.exec("SELECT session_user").getvalue(0, 0) == "supabase_admin"
      db.transaction do
        [organization, other_organization].each do |org|
          db.exec_params("INSERT INTO app.organizations(id, name) VALUES ($1, $2)", [org, "BE02 HTTP fixture"])
          db.exec_params("SELECT app_auth.lock_authorization_generations($1, $2)", [org, user])
          db.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES ($1,$2)", [org, user])
        end
        [[mailbox, "shared"], [hidden_mailbox, "private"]].each do |id, visibility|
          db.exec_params("INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES ($1,$2,$3,$4)",
                         [id, organization, "#{id}@example.invalid", visibility])
        end
        db.exec_params("INSERT INTO app.threads(id,organization_id,mailbox_id,subject) VALUES ($1,$2,$3,$4)",
                       [thread, organization, mailbox, "BE02 real HTTP plaintext"])
        db.exec_params("INSERT INTO app.messages(id,organization_id,mailbox_id,thread_id,body_text) VALUES ($1,$2,$3,$4,$5)",
                       [SecureRandom.uuid, organization, mailbox, thread, "<script>fixture remains plaintext</script>"])
      end
    end
  end
end

if $PROGRAM_NAME == __FILE__
  deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 55
  loop do
    begin
      break if Be02Http.new.request("get", "/health").code == "200"
    rescue IOError, SystemCallError, Timeout::Error
      # Startup is the only place where transient connection errors are retried.
    end
    raise "Rails readiness timed out" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
    sleep 1
  end
  puts "Real Rails HTTP readiness passed"
end
