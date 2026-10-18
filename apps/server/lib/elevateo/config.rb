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
    OUTBOUND_MODES = %w[held mailpit resend].freeze

    attr_reader :mode, :db_host, :db_name, :db_role, :db_password, :auth_url, :storage_url, :mailpit_url,
                :send_api_enabled, :send_control_path, :outbound_hold, :process, :session_key, :browser_origin, :auth_jwt_issuer,
                :auth_jwt_audience, :auth_jwt_algorithm, :cookie_secure, :auth_password_minimum, :cursor_signing_key,
                :attachment_gateway_hmac_key, :attachment_gateway_url, :outbound_mode, :resend_api_key,
                :resend_from_domain, :resend_webhook_secret, :mailbox_daily_send_limit

    def self.current = (@current ||= load!)

    def self.load!(env = ENV) = new(env)

    def initialize(env)
      # AIDEV-NOTE: Even migration/worker Rails processes must never inherit the gateway's Storage authority.
      raise ConfigError, "attachment storage token is gateway-only" if env.key?("ELEVATEO_ATTACHMENT_STORAGE_SERVICE_TOKEN")
      fetch = ->(key) { value = env[key].to_s; raise ConfigError, "missing required setting #{key}" if value.empty?; value }
      @mode = fetch.("ELEVATEO_MODE")
      raise ConfigError, "ELEVATEO_MODE must be local" unless @mode == "local"
      # AIDEV-NOTE: BE03 API is opt-in; enabling it never releases outbound hold or supplies a default epoch.
      send_enabled = env["ELEVATEO_SEND_API_ENABLED"] || "false"
      raise ConfigError, "invalid send API switch" unless %w[true false].include?(send_enabled)
      @send_api_enabled = send_enabled == "true"
      @send_control_path = env["ELEVATEO_SEND_CONTROL_PATH"] || ""
      unless @send_control_path.empty? || (@send_control_path.start_with?("/") && !@send_control_path.include?("\u0000"))
        raise ConfigError, "invalid send control path"
      end
      configure_outbound(env)
      @process = fetch.("ELEVATEO_PROCESS")
      @db_host = fetch.("ELEVATEO_DB_HOST")
      @db_name = fetch.("ELEVATEO_DB_NAME")
      @db_role = fetch.("ELEVATEO_DB_ROLE")
      password_key = ROLE_PASSWORDS[@db_role] or raise ConfigError, "ELEVATEO_DB_ROLE is not an allowlisted runtime role"
      @db_password = fetch.(password_key)
      validate_smtp(fetch.("ELEVATEO_SMTP_HOST"), fetch.("ELEVATEO_SMTP_PORT"))
      @auth_url = internal_url("ELEVATEO_AUTH_URL", fetch.("ELEVATEO_AUTH_URL"), ALLOWED_HOSTS.fetch("ELEVATEO_AUTH_URL"))
      @storage_url = internal_url("ELEVATEO_STORAGE_URL", fetch.("ELEVATEO_STORAGE_URL"), ALLOWED_HOSTS.fetch("ELEVATEO_STORAGE_URL"))
      @mailpit_url = internal_url("ELEVATEO_MAILPIT_URL", fetch.("ELEVATEO_MAILPIT_URL"), ALLOWED_HOSTS.fetch("ELEVATEO_MAILPIT_URL"))
      reject_provider_settings(env)
      fetch.("SECRET_KEY_BASE")
      configure_auth(env, fetch) unless @db_role == "elevateo_migrator"
    end

    private

    # AIDEV-NOTE: Provider secrets are retained only in frozen private fields and never interpolated into errors.
    def configure_outbound(env)
      @outbound_mode = env.fetch("ELEVATEO_OUTBOUND_MODE", "held")
      raise ConfigError, "invalid ELEVATEO_OUTBOUND_MODE" unless OUTBOUND_MODES.include?(@outbound_mode)
      @outbound_hold = parse_hold(env.fetch("ELEVATEO_OUTBOUND_HOLD", "true"))
      raw_limit = env.fetch("ELEVATEO_MAILBOX_DAILY_SEND_LIMIT", "30")
      raise ConfigError, "invalid ELEVATEO_MAILBOX_DAILY_SEND_LIMIT" unless /\A[1-9][0-9]{0,3}\z/.match?(raw_limit)
      @mailbox_daily_send_limit = raw_limit.to_i

      names = %w[RESEND_API_KEY ELEVATEO_RESEND_FROM_DOMAIN RESEND_WEBHOOK_SECRET]
      if @outbound_mode != "resend"
        found = names.find { |name| env.key?(name) }
        raise ConfigError, "#{found} requires ELEVATEO_OUTBOUND_MODE=resend" if found
        return
      end
      raise ConfigError, "ELEVATEO_OUTBOUND_HOLD must be false for resend mode" if @outbound_hold
      names.each { |name| raise ConfigError, "missing required setting #{name}" if env[name].to_s.empty? }
      key = env.fetch("RESEND_API_KEY")
      raise ConfigError, "invalid RESEND_API_KEY" unless /\Are_[A-Za-z0-9_-]{16,}\z/.match?(key)
      domain = env.fetch("ELEVATEO_RESEND_FROM_DOMAIN")
      labels = domain.split(".", -1)
      unless labels.length >= 2 && labels.all? { |label| /\A[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\z/.match?(label) }
        raise ConfigError, "invalid ELEVATEO_RESEND_FROM_DOMAIN"
      end
      secret = env.fetch("RESEND_WEBHOOK_SECRET")
      encoded = secret.delete_prefix("whsec_")
      decoded = Base64.strict_decode64(encoded)
      raise ConfigError, "invalid RESEND_WEBHOOK_SECRET" unless secret.start_with?("whsec_") && decoded.bytesize >= 16
      @resend_api_key = key.dup.freeze
      @resend_from_domain = domain.downcase.freeze
      @resend_webhook_secret = secret.dup.freeze
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
    rescue ArgumentError, URI::InvalidURIError
      raise ConfigError, "invalid authentication configuration"
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
