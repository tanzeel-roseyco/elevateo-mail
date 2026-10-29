# frozen_string_literal: true

require "base64"
require "digest"
require "json"
require "net/http"
require "openssl"
require "pg"
require "securerandom"
require "time"
require "uri"
require_relative "../../../apps/server/lib/elevateo/session_crypto"
require_relative "../../../apps/server/lib/elevateo/session_presentation"

module Be02Acceptance
  class Failure < StandardError; end
  ACTORS = %w[manager_primary manager_backup reader composer approver disabled revoked no_membership other_org].freeze
  UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/
  CONTRACT_SHA256 = "221d49259f52f2dcc9944a3af7744327cc2cbc1a3030fa4d13ae85b292e6a952"

  def self.check(condition, code)
    raise Failure, code unless condition
  end

  # AIDEV-NOTE: This privileged fixture only accepts the isolated fleet service names and a fresh private output mount.
  class Runtime
    attr_reader :seed, :passwords, :presentation

    def initialize
      Be02Acceptance.check(ENV.fetch("ELEVATEO_BROWSER_ORIGIN") == "http://app.test" &&
        ENV.fetch("ELEVATEO_AUTH_URL") == "http://auth:9999" && ENV.fetch("ELEVATEO_MODE") == "local" &&
        ENV.fetch("ELEVATEO_OUTBOUND_HOLD") == "true", "isolated_environment_required")
      @signing_key = ENV.fetch("BE02_FIXTURE_SIGNING_SECRET")
      Be02Acceptance.check(@signing_key.bytesize >= 32, "fixture_signing_key_invalid")
      key = Base64.strict_decode64(ENV.fetch("ELEVATEO_SESSION_KEY_BASE64"))
      Be02Acceptance.check(key.bytesize == 32, "session_key_invalid")
      crypto = Elevateo::SessionCrypto.new(config: Struct.new(:session_key).new(key))
      @presentation = Elevateo::SessionPresentation.new(crypto: crypto)
      @database = URI.parse(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
      Be02Acceptance.check(%w[postgres postgresql].include?(@database.scheme) && @database.host == "db" &&
        @database.port == 5432 && @database.user == "supabase_admin" && @database.path == "/postgres" &&
        !@database.password.to_s.empty? && @database.query.nil? && @database.fragment.nil?, "database_endpoint_invalid")
      directory = File.lstat("/acceptance")
      Be02Acceptance.check(directory.directory? && File.realpath("/acceptance") == "/acceptance" &&
        directory.uid == Process.euid && (directory.mode & 0o777) == 0o700 && Dir.empty?("/acceptance"),
        "fresh_private_output_required")
      File.open("/acceptance-contract/seed-contract.json", File::RDONLY | File::NOFOLLOW) do |file|
        Be02Acceptance.check(file.stat.file? && file.stat.size <= 65_536, "contract_file_invalid")
        bytes = file.read(65_537)
        Be02Acceptance.check(Digest::SHA256.hexdigest(bytes) == CONTRACT_SHA256, "contract_hash_mismatch")
        @seed = JSON.parse(bytes)
      end
      @seed["kind"] = "runtime"
      @passwords = ACTORS.to_h { |name| [name, "Be02!#{SecureRandom.hex(24)}"] }
    end

    def database
      db = PG.connect(host: "db", port: 5432, dbname: "postgres", user: "supabase_admin",
        password: URI::DEFAULT_PARSER.unescape(@database.password), connect_timeout: 3,
        options: "-c statement_timeout=10000 -c lock_timeout=5000 -c application_name=be02_acceptance_seed")
      db.set_notice_processor { |_notice| nil }
      Be02Acceptance.check(db.exec("SELECT session_user").getvalue(0, 0) == "supabase_admin", "admin_role_required")
      db
    end

    def create_users
      ACTORS.each do |name|
        actor = @seed.fetch("actors").fetch(name)
        payload = { email: actor.fetch("email"), password: @passwords.fetch(name), email_confirm: true }
        payload[:ban_duration] = "876000h" if name == "disabled"
        user = admin_request("/admin/users", payload)
        id = user.fetch("id")
        Be02Acceptance.check(id.is_a?(String) && UUID.match?(id) && user["email"] == actor.fetch("email") &&
          !user["email_confirmed_at"].to_s.empty?, "auth_user_invalid")
        actor["user_id"] = id
      end
      ids = @seed.fetch("actors").values.map { |actor| actor.fetch("user_id") }
      Be02Acceptance.check(ids.uniq.length == ACTORS.length, "auth_user_ids_not_unique")
    end

    def publish
      ids = @seed.fetch("actors").values.map { |actor| actor.fetch("user_id") } +
        @seed.fetch("organizations").values + @seed.fetch("mailboxes").values +
        @seed.fetch("data").values_at("thread_primary", "thread_other", "draft_primary", "draft_other")
      Be02Acceptance.check(ids.uniq.length == ids.length, "seed_ids_not_unique")
      # AIDEV-NOTE: Root starts consumers only after exit 0; the public manifest is published last as the ready marker.
      write_private("acceptance-credentials.json", { schema_version: 1, passwords: @passwords })
      write_private("seed.json", @seed)
      File.open("/acceptance", File::RDONLY) { |directory| directory.fsync }
    end

    private

    # AIDEV-NOTE: v2.196.0 adminUserCreate confirms synthetic users without a login, invite capture, or issued session.
    def admin_request(path, payload)
      now = Time.now.to_i
      header = Base64.urlsafe_encode64(JSON.generate(alg: "HS256", typ: "JWT"), padding: false)
      claims = Base64.urlsafe_encode64(JSON.generate(role: "service_role", aud: "authenticated",
        iss: "http://auth:9999", iat: now, exp: now + 120), padding: false)
      unsigned = "#{header}.#{claims}"
      signature = Base64.urlsafe_encode64(OpenSSL::HMAC.digest("SHA256", @signing_key, unsigned), padding: false)
      request = Net::HTTP::Post.new(path)
      request["Authorization"] = "Bearer #{unsigned}.#{signature}"
      request["Content-Type"] = "application/json"
      request.body = JSON.generate(payload)
      body = +""
      # AIDEV-NOTE: Disable environment proxies, redirects and retries so privileged requests stay on isolated Auth.
      Net::HTTP.start("auth", 9999, nil, open_timeout: 3, read_timeout: 10, write_timeout: 10, max_retries: 0) do |http|
        http.request(request) do |response|
          Be02Acceptance.check(response.code == "200" && response.content_type == "application/json", "auth_create_failed")
          response.read_body do |chunk|
            Be02Acceptance.check(body.bytesize + chunk.bytesize <= 65_536, "auth_response_too_large")
            body << chunk
          end
        end
      end
      parsed = JSON.parse(body)
      Be02Acceptance.check(parsed.is_a?(Hash), "auth_response_invalid")
      parsed
    end

    def write_private(name, value)
      File.open("/acceptance/#{name}", File::WRONLY | File::CREAT | File::EXCL | File::NOFOLLOW, 0o600) do |file|
        Be02Acceptance.check((file.stat.mode & 0o777) == 0o600 && file.stat.uid == Process.euid, "output_mode_invalid")
        file.write(JSON.generate(value) + "\n")
        file.flush
        file.fsync
      end
    end
  end
end
