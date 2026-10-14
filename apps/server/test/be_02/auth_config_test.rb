# frozen_string_literal: true

require_relative "auth_test_helper"

class AuthConfigTest < Minitest::Test
  def environment
    { "ELEVATEO_MODE" => "local", "ELEVATEO_OUTBOUND_HOLD" => "true", "ELEVATEO_PROCESS" => "api",
      "ELEVATEO_DB_HOST" => "db", "ELEVATEO_DB_NAME" => "test", "ELEVATEO_DB_ROLE" => "elevateo_api",
      "API_DB_PASSWORD" => "disposable", "ELEVATEO_SMTP_HOST" => "mailpit", "ELEVATEO_SMTP_PORT" => "1025",
      "ELEVATEO_AUTH_URL" => "http://auth:9999", "ELEVATEO_STORAGE_URL" => "http://storage:5000",
      "ELEVATEO_MAILPIT_URL" => "http://mailpit:8025", "SECRET_KEY_BASE" => "disposable-test-secret",
      "ELEVATEO_SESSION_KEY_BASE64" => Base64.strict_encode64("k" * 32), "ELEVATEO_BROWSER_ORIGIN" => "https://app.test",
      "ELEVATEO_COOKIE_SECURE" => "true", "ELEVATEO_AUTH_JWT_ISSUER" => "http://auth:9999",
      "ELEVATEO_AUTH_JWT_AUDIENCE" => "authenticated", "ELEVATEO_AUTH_JWT_ALGORITHM" => "HS256",
      "ELEVATEO_AUTH_PASSWORD_MINIMUM" => "12" }
  end

  def test_dedicated_key_and_cursor_derivative
    config = Elevateo::Config.load!(environment)
    assert_equal "k" * 32, config.session_key
    assert_equal 32, config.cursor_signing_key.bytesize
    refute_equal config.session_key, config.cursor_signing_key
    assert_equal true, config.cookie_secure
    assert config.session_key.frozen?
  end

  def test_rejects_missing_short_or_non_base64_key_without_echoing_value
    [nil, Base64.strict_encode64("too-short"), "not*base64"].each do |key|
      error = assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(environment.merge("ELEVATEO_SESSION_KEY_BASE64" => key)) }
      refute_includes error.message, "too-short"
      refute_includes error.message, "not*base64"
    end
  end

  def test_http_cookie_requires_explicit_isolated_local_profile
    values = environment.merge("ELEVATEO_BROWSER_ORIGIN" => "http://app.test", "ELEVATEO_COOKIE_SECURE" => "false")
    assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(values) }
    refute Elevateo::Config.load!(values.merge("ELEVATEO_LOCAL_HTTP" => "true")).cookie_secure
    assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(environment.merge("ELEVATEO_BROWSER_ORIGIN" => "https://app.test/path")) }
  end

  def test_forbids_signing_admin_keys_and_internal_url_redirect_surface
    %w[JWT_SECRET GOTRUE_JWT_SECRET SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE_KEY AUTH_ADMIN_PASSWORD
      ELEVATEO_ATTACHMENT_STORAGE_SERVICE_TOKEN].each do |name|
      assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(environment.merge(name => "secret")) }
    end
    ["https://auth:9999", "http://user:password@auth:9999", "http://auth:9999/path"].each do |url|
      assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(environment.merge("ELEVATEO_AUTH_URL" => url)) }
    end
  end

  def test_attachment_gateway_key_is_optional_and_exactly_32_bytes
    assert_nil Elevateo::Config.load!(environment).attachment_gateway_hmac_key
    valid = Base64.strict_encode64("g" * 32)
    assert_equal "g" * 32, Elevateo::Config.load!(environment.merge("ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64" => valid)).attachment_gateway_hmac_key
    assert_raises(Elevateo::ConfigError) do
      Elevateo::Config.load!(environment.merge("ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64" => Base64.strict_encode64("short")))
    end
    assert_raises(Elevateo::ConfigError) do
      Elevateo::Config.load!(environment.merge("ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64" => "not-base64"))
    end
    assert_raises(Elevateo::ConfigError) do
      Elevateo::Config.load!(environment.merge("ELEVATEO_DB_ROLE" => "elevateo_migrator",
        "MIGRATOR_DB_PASSWORD" => "disposable", "ELEVATEO_ATTACHMENT_STORAGE_SERVICE_TOKEN" => "secret"))
    end
  end

  def test_exact_jwt_policy_and_password_minimum
    { "ELEVATEO_AUTH_JWT_ALGORITHM" => "none", "ELEVATEO_AUTH_JWT_AUDIENCE" => "anon",
      "ELEVATEO_AUTH_PASSWORD_MINIMUM" => "6" }.each do |key, value|
      assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(environment.merge(key => value)) }
    end
  end
end
