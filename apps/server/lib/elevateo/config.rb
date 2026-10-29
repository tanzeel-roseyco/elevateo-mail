# frozen_string_literal: true

require "uri"
require "base64"
require "openssl"

module Elevateo
  class ConfigError < StandardError; end

  # Boundary validation for runtime configuration. Fails closed; messages never include values.
  class Config
    ALLOWED_SMTP = begin
      # @type var smtp: { host: String, port: Integer }
      smtp = { host: "mailpit", port: 1025 }
      smtp.freeze
    end
    ALLOWED_HOSTS = { "ELEVATEO_AUTH_URL" => "auth", "ELEVATEO_STORAGE_URL" => "storage",
                      "ELEVATEO_MAILPIT_URL" => "mailpit" }.freeze
    ROLE_PASSWORDS = { "elevateo_api" => "API_DB_PASSWORD", "elevateo_worker" => "WORKER_DB_PASSWORD",
                       "elevateo_migrator" => "MIGRATOR_DB_PASSWORD" }.freeze
    PROVIDER_PREFIXES = %w[INSTANTLY_ POSTMARK_ SENDGRID_ MAILGUN_ SES_ SMTP_RELAY_].freeze
    OUTBOUND_MODES = %w[held mailpit resend mox].freeze

    attr_reader :authentik_issuer, :authentik_group, :authentik_api_token,
                :mode, :db_host, :db_name, :db_role, :db_password, :db_pool, :auth_url, :storage_url, :mailpit_url,
                :send_api_enabled, :send_control_path, :outbound_hold, :process, :session_key, :browser_origin, :auth_jwt_issuer,
                :auth_jwt_audience, :auth_jwt_algorithm, :cookie_secure, :auth_password_minimum, :cursor_signing_key,
                :attachment_gateway_hmac_key, :attachment_gateway_url, :outbound_mode, :resend_api_key,
                :resend_from_domain, :resend_webhook_secret, :resend_base_url, :mailbox_daily_send_limit,
                :sso_enabled, :sso_provider, :sso_only, :auth_public_url, :company_signup_enabled

    # Credentials live on this boundary object, so the default instance-variable dump is unsafe.
    def inspect = "#<Elevateo::Config redacted>"

    def self.current = (@current ||= load!)

    def self.load!(env = ENV) = new(env)

    def initialize(env)
      # AIDEV-NOTE: Even migration/worker Rails processes must never inherit the gateway's Storage authority.
      raise ConfigError, "attachment storage token is gateway-only" if env.key?("ELEVATEO_ATTACHMENT_STORAGE_SERVICE_TOKEN")
      fetch = ->(key) { value = env[key].to_s; raise ConfigError, "missing required setting #{key}" if value.empty?; value }
      @mode = fetch.("ELEVATEO_MODE")
      raise ConfigError, "invalid ELEVATEO_MODE" unless %w[local production].include?(@mode)
      if env["RAILS_ENV"] == "production" && @mode != "production"
        raise ConfigError, "Rails production requires production mode"
      end
      # AIDEV-NOTE: BE03 API is opt-in; enabling it never releases outbound hold or supplies a default epoch.
      send_enabled = env["ELEVATEO_SEND_API_ENABLED"] || "false"
      raise ConfigError, "invalid send API switch" unless %w[true false].include?(send_enabled)
      @send_api_enabled = send_enabled == "true"
      @send_control_path = env["ELEVATEO_SEND_CONTROL_PATH"] || ""
      unless @send_control_path.empty? || (@send_control_path.start_with?("/") && !@send_control_path.include?("\u0000"))
        raise ConfigError, "invalid send control path"
      end
      @process = fetch.("ELEVATEO_PROCESS")
      configure_outbound(env)
      @db_host = fetch.("ELEVATEO_DB_HOST")
      @db_name = fetch.("ELEVATEO_DB_NAME")
      @db_role = fetch.("ELEVATEO_DB_ROLE")
      password_key = ROLE_PASSWORDS[@db_role] or raise ConfigError, "ELEVATEO_DB_ROLE is not an allowlisted runtime role"
      @db_password = fetch.(password_key)
      # AIDEV-NOTE: Bound connection demand and emit only integers into the Rails YAML pool setting.
      pool = env.fetch("ELEVATEO_DB_POOL", "5")
      raise ConfigError, "ELEVATEO_DB_POOL must be an integer from 1 to 100" unless /\A(?:[1-9][0-9]?|100)\z/.match?(pool)
      @db_pool = pool.to_i
      validate_smtp(fetch.("ELEVATEO_SMTP_HOST"), fetch.("ELEVATEO_SMTP_PORT"))
      @auth_url = internal_url("ELEVATEO_AUTH_URL", fetch.("ELEVATEO_AUTH_URL"), ALLOWED_HOSTS.fetch("ELEVATEO_AUTH_URL"))
      @storage_url = internal_url("ELEVATEO_STORAGE_URL", fetch.("ELEVATEO_STORAGE_URL"), ALLOWED_HOSTS.fetch("ELEVATEO_STORAGE_URL"))
      @mailpit_url = internal_url("ELEVATEO_MAILPIT_URL", fetch.("ELEVATEO_MAILPIT_URL"), ALLOWED_HOSTS.fetch("ELEVATEO_MAILPIT_URL"))
      reject_provider_settings(env)
      fetch.("SECRET_KEY_BASE")
      configure_auth(env, fetch) unless @db_role == "elevateo_migrator"
      validate_production(env) if @mode == "production"
    end

    private

    # AIDEV-NOTE: Production Mox needs separate operator activation as well as the independent runtime hold.
    def validate_production(env)
      raise ConfigError, "production requires Rails production" unless env["RAILS_ENV"] == "production"
      raise ConfigError, "production requires private database" unless @db_host == "db"
      activation = env.fetch("ELEVATEO_MOX_PRODUCTION_ENABLED", "false")
      raise ConfigError, "invalid Mox production activation" unless %w[true false].include?(activation)
      allowed = (@outbound_hold && %w[held mox].include?(@outbound_mode)) ||
        (@outbound_mode == "mox" && activation == "true")
      raise ConfigError, "production transport is held" unless allowed
      raise ConfigError, "production local HTTP is forbidden" if env.key?("ELEVATEO_LOCAL_HTTP")
      raise ConfigError, "production secret key is too short" unless env["SECRET_KEY_BASE"].to_s.bytesize >= 64
      expected = { "elevateo_api" => "api", "elevateo_worker" => "worker", "elevateo_migrator" => "migrate" }
      raise ConfigError, "production process and database role mismatch" unless expected[@db_role] == @process
      return if @db_role == "elevateo_migrator"
      unless @cookie_secure && @browser_origin == "https://mail.elevateoco.com"
        raise ConfigError, "production requires the secure launch origin"
      end
      # AIDEV-NOTE: Enabling production SSO must not leave password/recovery entry as an alternate login path.
      if @sso_enabled && (!@sso_only || @auth_public_url != "https://mail.elevateoco.com/auth/v1")
        raise ConfigError, "production SSO requires SSO-only and the exact public Auth endpoint"
      end
    end

    # AIDEV-NOTE: Provider secrets are retained only in frozen private fields and never interpolated into errors.
    def configure_outbound(env)
      @outbound_mode = env.fetch("ELEVATEO_OUTBOUND_MODE", "held")
      raise ConfigError, "invalid ELEVATEO_OUTBOUND_MODE" unless OUTBOUND_MODES.include?(@outbound_mode)
      @outbound_hold = parse_hold(env.fetch("ELEVATEO_OUTBOUND_HOLD", "true"))
      if @outbound_mode == "mox" && @mode != "production"
        raise ConfigError, "production Mox requires production mode"
      end
      raw_limit = env.fetch("ELEVATEO_MAILBOX_DAILY_SEND_LIMIT", "30")
      # AIDEV-NOTE: This is a configuration ceiling; transport must atomically reserve each actual delivery.
      unless raw_limit.is_a?(String) && /\A[1-9][0-9]?\z/.match?(raw_limit) && raw_limit.to_i <= 30
        raise ConfigError, "invalid ELEVATEO_MAILBOX_DAILY_SEND_LIMIT"
      end
      @mailbox_daily_send_limit = raw_limit.to_i

      required_names = ["ELEVATEO_RESEND_FROM_DOMAIN", @process == "worker" ? "RESEND_API_KEY" : "RESEND_WEBHOOK_SECRET"]
      names = %w[RESEND_API_KEY ELEVATEO_RESEND_FROM_DOMAIN RESEND_WEBHOOK_SECRET ELEVATEO_RESEND_BASE_URL]
      if @outbound_mode != "resend"
        found = names.find { |name| env.key?(name) }
        raise ConfigError, "#{found} requires ELEVATEO_OUTBOUND_MODE=resend" if found
        return
      end
      # AIDEV-NOTE: Held Resend processes still receive events; the send worker enforces submission controls.
      required_names.each { |name| raise ConfigError, "missing required setting #{name}" if env[name].to_s.empty? }
      # AIDEV-NOTE: Public API verification never needs the credential that authorizes provider submissions.
      raise ConfigError, "RESEND_API_KEY is worker-only" if @process != "worker" && env.key?("RESEND_API_KEY")
      key = env["RESEND_API_KEY"]
      raise ConfigError, "invalid RESEND_API_KEY" if key && !/\Are_[A-Za-z0-9_-]{16,}\z/.match?(key)
      domain = env.fetch("ELEVATEO_RESEND_FROM_DOMAIN")
      labels = domain.split(".", -1)
      unless labels.length >= 2 && labels.all? { |label| /\A[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\z/.match?(label) }
        raise ConfigError, "invalid ELEVATEO_RESEND_FROM_DOMAIN"
      end
      secret = env["RESEND_WEBHOOK_SECRET"]
      if secret
        decoded = Base64.strict_decode64(secret.delete_prefix("whsec_"))
        raise ConfigError, "invalid RESEND_WEBHOOK_SECRET" unless secret.start_with?("whsec_") && decoded.bytesize >= 16
      end
      @resend_api_key = key&.dup&.freeze
      @resend_from_domain = domain.downcase.freeze
      @resend_webhook_secret = secret&.dup&.freeze
      @resend_base_url = env.fetch("ELEVATEO_RESEND_BASE_URL", "https://api.resend.com")
      unless ["https://api.resend.com", "http://resend-stub:8788"].include?(@resend_base_url)
        raise ConfigError, "invalid ELEVATEO_RESEND_BASE_URL"
      end
      @resend_base_url = @resend_base_url.dup.freeze
    rescue ArgumentError
      raise ConfigError, "invalid RESEND_WEBHOOK_SECRET"
    end

    # AIDEV-NOTE: The runtime gets an encryption key, never Auth's signing/admin key; issuer is an identifier only.
    def configure_auth(env, fetch)
      forbidden = %w[JWT_SECRET GOTRUE_JWT_SECRET SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE_KEY AUTH_ADMIN_PASSWORD]
      raise ConfigError, "privileged service settings are forbidden" if forbidden.any? { |name| env.key?(name) }
      @attachment_gateway_hmac_key = if env.key?("ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64")
        key = Base64.strict_decode64(fetch.("ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64"))
        raise ConfigError, "attachment gateway key must contain 32 bytes" unless key.bytesize == 32
        key.freeze
      end
      @attachment_gateway_url = env["ELEVATEO_ATTACHMENT_GATEWAY_URL"]
      if @attachment_gateway_url && @attachment_gateway_url != "http://attachment-gateway:4708"
        raise ConfigError, "attachment gateway URL must target the internal service"
      end
      if @attachment_gateway_url && !@attachment_gateway_hmac_key
        raise ConfigError, "attachment gateway URL requires its dedicated signing key"
      end
      @session_key = Base64.strict_decode64(fetch.("ELEVATEO_SESSION_KEY_BASE64"))
      raise ConfigError, "session key must contain 32 bytes" unless @session_key.bytesize == 32
      @session_key.freeze
      @cursor_signing_key = OpenSSL::HMAC.digest("SHA256", @session_key, "elevateo:v1:cursor-key").freeze
      @browser_origin = fetch.("ELEVATEO_BROWSER_ORIGIN")
      origin = URI.parse(@browser_origin)
      raise ConfigError, "browser origin must be an exact origin" unless
        %w[http https].include?(origin.scheme) && origin.host && origin.path == "" &&
        origin.query.nil? && origin.fragment.nil? && origin.userinfo.nil?
      secure = fetch.("ELEVATEO_COOKIE_SECURE")
      raise ConfigError, "cookie security must be explicit" unless %w[true false].include?(secure)
      @cookie_secure = secure == "true"
      unless @cookie_secure ? origin.scheme == "https" : origin.scheme == "http" && env["ELEVATEO_LOCAL_HTTP"] == "true"
        raise ConfigError, "insecure cookies require the isolated local HTTP profile"
      end
      @auth_jwt_issuer = fetch.("ELEVATEO_AUTH_JWT_ISSUER")
      issuer = URI.parse(@auth_jwt_issuer)
      raise ConfigError, "invalid Auth issuer" unless %w[http https].include?(issuer.scheme) && issuer.host &&
        issuer.userinfo.nil? && issuer.query.nil? && issuer.fragment.nil?
      @auth_jwt_audience = fetch.("ELEVATEO_AUTH_JWT_AUDIENCE")
      @auth_jwt_algorithm = fetch.("ELEVATEO_AUTH_JWT_ALGORITHM")
      raise ConfigError, "unsupported Auth JWT policy" unless @auth_jwt_audience == "authenticated" && @auth_jwt_algorithm == "HS256"
      raise ConfigError, "local Auth password minimum must be 12" unless fetch.("ELEVATEO_AUTH_PASSWORD_MINIMUM") == "12"
      @auth_password_minimum = 12
      configure_sso(env)
    rescue ArgumentError, URI::InvalidURIError
      raise ConfigError, "invalid authentication configuration"
    end

    # AIDEV-NOTE: Public Auth supports the explicit gateway prefix; server requests retain the private auth_url.
    def configure_sso(env)
      configure_authentik(env)
      enabled = env.fetch("ELEVATEO_SSO_ENABLED", "false")
      only = env.fetch("ELEVATEO_SSO_ONLY", "false")
      unless [enabled, only].all? { |value| %w[true false].include?(value) }
        raise ConfigError, "invalid SSO switch"
      end
      @sso_provider = env.fetch("ELEVATEO_SSO_PROVIDER", "google")
      unless %w[google custom:authentik].include?(@sso_provider)
        raise ConfigError, "unsupported SSO provider"
      end
      @sso_enabled = enabled == "true"
      if @sso_enabled && @sso_provider == "custom:authentik" &&
          [@authentik_issuer, @authentik_group, @authentik_api_token].any?(&:empty?)
        raise ConfigError, "Authentik requires pinned issuer, tenant group and private revalidation token"
      end
      @sso_only = only == "true"
      raise ConfigError, "SSO-only requires SSO enabled" if @sso_only && !@sso_enabled
      signup = env.fetch("ELEVATEO_COMPANY_SIGNUP_ENABLED", "false")
      raise ConfigError, "invalid company signup switch" unless %w[true false].include?(signup)
      @company_signup_enabled = signup == "true"
      # AIDEV-NOTE: Enrollment also needs an enabled, pinned database policy; this flag cannot grant roles.
      if @company_signup_enabled && (!@sso_enabled || !@sso_only)
        raise ConfigError, "company signup requires SSO-only"
      end

      @auth_public_url = env["ELEVATEO_AUTH_PUBLIC_URL"]
      return unless @sso_enabled || @auth_public_url
      uri = URI.parse(@auth_public_url.to_s)
      unless uri.scheme == "https" && uri.host && ["", "/auth/v1"].include?(uri.path) && uri.userinfo.nil? &&
          uri.query.nil? && uri.fragment.nil? && uri.port == 443
        raise ConfigError, "SSO requires an exact HTTPS public Auth endpoint"
      end
    rescue URI::InvalidURIError
      raise ConfigError, "invalid public Auth endpoint"
    end

    # AIDEV-NOTE: No discovery or API URL comes from a browser; one pinned HTTPS origin owns both trust channels.
    def configure_authentik(env)
      @authentik_issuer = env.fetch("ELEVATEO_AUTHENTIK_ISSUER", "")
      @authentik_group = env.fetch("ELEVATEO_AUTHENTIK_GROUP", "")
      @authentik_api_token = env.fetch("ELEVATEO_AUTHENTIK_API_TOKEN", "")
      unless [@authentik_issuer, @authentik_group, @authentik_api_token].all? { |value| value.is_a?(String) }
        raise ConfigError, "Authentik settings must be strings"
      end
      unless @authentik_issuer.empty?
        uri = URI.parse(@authentik_issuer)
        unless uri.scheme == "https" && uri.host && uri.port == 443 && uri.userinfo.nil? &&
            uri.query.nil? && uri.fragment.nil? && %r{\A/application/o/[a-z0-9-]+/\z}.match?(uri.path.to_s)
          raise ConfigError, "invalid pinned Authentik issuer"
        end
      end
      unless @authentik_group.empty? || /\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/.match?(@authentik_group)
        raise ConfigError, "invalid Authentik tenant group"
      end
      unless @authentik_api_token.empty? || /\A[A-Za-z0-9_-]{32,4096}\z/.match?(@authentik_api_token)
        raise ConfigError, "invalid private Authentik token"
      end
    end

    def parse_hold(value)
      raise ConfigError, "ELEVATEO_OUTBOUND_HOLD must be true or false" unless %w[true false].include?(value)
      value == "true"
    end

    def validate_smtp(host, port)
      return if host == ALLOWED_SMTP[:host] && port == ALLOWED_SMTP[:port].to_s
      raise ConfigError, "SMTP endpoint is not the allowlisted local catcher"
    end

    def internal_url(key, value, host)
      uri = URI.parse(value)
      raise ConfigError, "#{key} must target internal service #{host}" unless uri.scheme == "http" && uri.host == host &&
        uri.userinfo.nil? && uri.query.nil? && uri.fragment.nil? && ["", "/"].include?(uri.path)
      value
    rescue URI::InvalidURIError
      raise ConfigError, "#{key} is not a valid URL"
    end

    def reject_provider_settings(env)
      found = env.keys.select { |k| PROVIDER_PREFIXES.any? { |p| k.start_with?(p) } }
      raise ConfigError, "provider settings are forbidden in local mode: #{found.sort.join(',')}" unless found.empty?
    end
  end
end
