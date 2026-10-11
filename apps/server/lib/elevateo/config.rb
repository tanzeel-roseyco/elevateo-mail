# frozen_string_literal: true

require "uri"

module Elevateo
  class ConfigError < StandardError; end

  # Boundary validation for runtime configuration. Fails closed; messages never include values.
  class Config
    ALLOWED_SMTP = { host: "mailpit", port: 1025 }.freeze
    ALLOWED_HOSTS = { "ELEVATEO_AUTH_URL" => "auth", "ELEVATEO_STORAGE_URL" => "storage",
                      "ELEVATEO_MAILPIT_URL" => "mailpit" }.freeze
    ROLE_PASSWORDS = { "elevateo_api" => "API_DB_PASSWORD", "elevateo_worker" => "WORKER_DB_PASSWORD",
                       "elevateo_migrator" => "MIGRATOR_DB_PASSWORD" }.freeze
    PROVIDER_PREFIXES = %w[INSTANTLY_ POSTMARK_ SENDGRID_ MAILGUN_ SES_ RESEND_ SMTP_RELAY_].freeze

    attr_reader :db_host, :db_name, :db_role, :db_password, :auth_url, :storage_url, :mailpit_url,
                :outbound_hold, :process

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
      @auth_url, @storage_url, @mailpit_url = ALLOWED_HOSTS.map { |key, host| internal_url(key, fetch.(key), host) }
      reject_provider_settings(env)
      fetch.("SECRET_KEY_BASE")
    end

    private

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
      raise ConfigError, "#{key} must target internal service #{host}" unless uri.scheme == "http" && uri.host == host
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
