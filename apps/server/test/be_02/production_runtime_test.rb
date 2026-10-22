# frozen_string_literal: true

require "minitest/autorun"
require "open3"
require "rbconfig"
require "base64"

# AIDEV-NOTE: A fresh Rails process proves production boot/host/SSL policy without touching any database or provider.
class ProductionRuntimeTest < Minitest::Test
  def environment
    { "PATH" => ENV.fetch("PATH"), "HOME" => "/tmp", "RAILS_ENV" => "production",
      "ELEVATEO_MODE" => "production", "ELEVATEO_PROCESS" => "api", "ELEVATEO_DB_HOST" => "db",
      "ELEVATEO_DB_NAME" => "test", "ELEVATEO_DB_ROLE" => "elevateo_api", "API_DB_PASSWORD" => "disposable",
      "ELEVATEO_SMTP_HOST" => "mailpit", "ELEVATEO_SMTP_PORT" => "1025",
      "ELEVATEO_AUTH_URL" => "http://auth:9999", "ELEVATEO_STORAGE_URL" => "http://storage:5000",
      "ELEVATEO_MAILPIT_URL" => "http://mailpit:8025", "SECRET_KEY_BASE" => "s" * 64,
      "ELEVATEO_SESSION_KEY_BASE64" => Base64.strict_encode64("k" * 32),
      "ELEVATEO_BROWSER_ORIGIN" => "https://mail.elevateoco.com", "ELEVATEO_COOKIE_SECURE" => "true",
      "ELEVATEO_AUTH_JWT_ISSUER" => "http://auth:9999", "ELEVATEO_AUTH_JWT_AUDIENCE" => "authenticated",
      "ELEVATEO_AUTH_JWT_ALGORITHM" => "HS256", "ELEVATEO_AUTH_PASSWORD_MINIMUM" => "12" }
  end

  def boot(overrides = {}, script = "")
    bundle = ENV.to_h.slice("GEM_HOME", "GEM_PATH", "BUNDLE_GEMFILE", "BUNDLE_APP_CONFIG", "BUNDLE_PATH", "RUBYOPT", "RUBYLIB")
    Open3.capture3(bundle.merge(environment).merge(overrides), RbConfig.ruby, "-e",
      "require_relative 'config/environment'; #{script}", unsetenv_others: true)
  end

  def test_production_health_accepts_exact_hosts_and_rejects_unknown_hosts
    script = <<~RUBY
      require 'rack/mock'
      client = Rack::MockRequest.new(Rails.application)
      %w[mail.elevateoco.com api].each do |host|
        response = client.get('/health', 'HTTP_HOST' => host)
        abort 'health rejected' unless response.status == 200
        abort 'SSL policy absent' unless response['strict-transport-security']
      end
      abort 'unknown host accepted' unless client.get('/health', 'HTTP_HOST' => 'evil.test').status == 403
    RUBY
    output, error, status = boot({}, script)
    assert status.success?, "production runtime failed: #{output} #{error}"
  end

  def test_production_boot_rejects_wrong_origin_and_released_hold
    [{ "ELEVATEO_BROWSER_ORIGIN" => "https://other.test" }, { "ELEVATEO_OUTBOUND_HOLD" => "false" }].each do |values|
      _output, error, status = boot(values)
      refute status.success?
      assert_includes error, "Elevateo::ConfigError"
    end
  end
end
