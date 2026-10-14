# frozen_string_literal: true

require "uri"
require "base64"
require "openssl"

module Elevateo
  class ConfigError < StandardError; end

  # Boundary validation for runtime configuration. Fails closed; messages never include values.
  class Config
    # @type const ALLOWED_SMTP: { host: String, port: Integer }
    ALLOWED_SMTP = { host: "mailpit", port: 1025 }.freeze
    ALLOWED_HOSTS = { "ELEVATEO_AUTH_URL" => "auth", "ELEVATEO_STORAGE_URL" => "storage",
                      "ELEVATEO_MAILPIT_URL" => "mailpit" }.freeze
    ROLE_PASSWORDS = { "elevateo_api" => "API_DB_PASSWORD", "elevateo_worker" => "WORKER_DB_PASSWORD",
                       "elevateo_migrator" => "MIGRATOR_DB_PASSWORD" }.freeze
    PROVIDER_PREFIXES = %w[INSTANTLY_ POSTMARK_ SENDGRID_ MAILGUN_ SES_ RESEND_ SMTP_RELAY_].freeze

    attr_reader :db_host, :db_name, :db_role, :db_password, :auth_url, :storage_url, :mailpit_url,
                :outbound_hold, :process, :session_key, :browser_origin, :auth_jwt_issuer,
                :auth_jwt_audience, :auth_jwt_algorithm, :cookie_secure, :auth_password_minimum, :cursor_signing_key

    def self.current = (@current ||= load!)

    def self.load!(env = ENV) = new(env)

    def initialize(env)
      fetch = ->(key) { value = env[key].to_s; raise ConfigError, "missing required setting #{key}" if value.empty?; value }
      raise ConfigError, "ELEVATEO_MODE must be local" unless fetch.("ELEVATEO_MODE") == "local"
      @outbound_hold = parse_hold(fetch.("ELEVATEO_OUTBOUND_HOLD"))
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

    # AIDEV-NOTE: The runtime gets an encryption key, never Auth's signing/admin key; issuer is an identifier only.
    def configure_auth(env, fetch)
      forbidden = %w[JWT_SECRET GOTRUE_JWT_SECRET SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE_KEY AUTH_ADMIN_PASSWORD]
      raise ConfigError, "privileged Auth settings are forbidden" if forbidden.any? { |name| env.key?(name) }
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
      raise ConfigError, "ELEVATEO_OUTBOUND_HOLD must be true; no release path exists" unless value == "true"
      true
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
