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
      "ELEVATEO_AUTH_PASSWORD_MINIMUM" => "12",
      "ELEVATEO_AUTHENTIK_ISSUER" => "https://identity.test/application/o/elevateo-mail/",
      "ELEVATEO_AUTHENTIK_GROUP" => "11111111-1111-4111-8111-111111111111", "ELEVATEO_AUTHENTIK_API_TOKEN" => "x" * 32 }
  end

  def test_user_daily_budget_defaults_and_rejects_invalid_or_excessive_limits
    assert_equal 300, Elevateo::Config.load!(environment).user_daily_send_limit
    ["1", "299", "300"].each do |limit|
      assert_equal limit.to_i, Elevateo::Config.load!(environment.merge(
        "ELEVATEO_USER_DAILY_SEND_LIMIT" => limit)).user_daily_send_limit
    end
    [nil, "", "0", "301", "-1", "1.5", "0300", "300\n"].each do |limit|
      assert_raises(Elevateo::ConfigError) do
        Elevateo::Config.load!(environment.merge("ELEVATEO_USER_DAILY_SEND_LIMIT" => limit))
      end
    end
  end

  def test_production_resend_allows_explicit_mode_but_denies_stub_endpoint
    values = environment.merge("ELEVATEO_MODE" => "production", "RAILS_ENV" => "production",
      "ELEVATEO_SSO_ENABLED" => "true", "ELEVATEO_SSO_ONLY" => "true",
      "ELEVATEO_AUTH_PUBLIC_URL" => "https://mail.elevateoco.com/auth/v1",
      "SECRET_KEY_BASE" => "s" * 64, "ELEVATEO_BROWSER_ORIGIN" => "https://mail.elevateoco.com",
      "ELEVATEO_OUTBOUND_MODE" => "resend", "ELEVATEO_RESEND_FROM_DOMAIN" => "example.test",
      "RESEND_WEBHOOK_SECRET" => "whsec_" + Base64.strict_encode64("w" * 32))
    assert_equal "resend", Elevateo::Config.load!(values).outbound_mode
    assert Elevateo::Config.load!(values).outbound_hold
    assert_raises(Elevateo::ConfigError) do
      Elevateo::Config.load!(values.merge("ELEVATEO_RESEND_BASE_URL" => "http://resend-stub:8788"))
    end
    assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(values.except("RESEND_WEBHOOK_SECRET")) }
  end

  def test_dedicated_key_and_cursor_derivative
    config = Elevateo::Config.load!(environment)
    assert_equal "k" * 32, config.session_key
    assert_equal 32, config.cursor_signing_key.bytesize
    refute_equal config.session_key, config.cursor_signing_key
    assert_equal true, config.cookie_secure
    assert config.session_key.frozen?
  end

  def test_company_signup_requires_explicit_sso_only_and_daily_limit_is_globally_capped
    refute Elevateo::Config.load!(environment).company_signup_enabled
    values = environment.merge("ELEVATEO_COMPANY_SIGNUP_ENABLED" => "true", "ELEVATEO_SSO_ENABLED" => "true",
      "ELEVATEO_SSO_ONLY" => "true", "ELEVATEO_AUTH_PUBLIC_URL" => "https://auth.test")
    assert Elevateo::Config.load!(values).company_signup_enabled
    [nil, "yes", true].each do |flag|
      assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(values.merge("ELEVATEO_COMPANY_SIGNUP_ENABLED" => flag)) }
    end
    ["false", "invalid"].each do |flag|
      assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(values.merge("ELEVATEO_SSO_ONLY" => flag)) }
    end
    [nil, "0", "31", "9999", "-1", "30.0", "true"].each do |limit|
      assert_raises(Elevateo::ConfigError) do
        Elevateo::Config.load!(environment.merge("ELEVATEO_MAILBOX_DAILY_SEND_LIMIT" => limit))
      end
    end
    ["1", "30"].each do |limit|
      assert_equal limit.to_i, Elevateo::Config.load!(environment.merge("ELEVATEO_MAILBOX_DAILY_SEND_LIMIT" => limit)).mailbox_daily_send_limit
    end
  end

  # AIDEV-NOTE: Held deployment cannot bypass private endpoints; provider mode requires separate explicit credentials.
  def test_production_profile_accepts_only_secure_held_private_runtime
    values = environment.merge("ELEVATEO_MODE" => "production", "RAILS_ENV" => "production",
      "ELEVATEO_SSO_ENABLED" => "true", "ELEVATEO_SSO_ONLY" => "true",
      "ELEVATEO_AUTH_PUBLIC_URL" => "https://mail.elevateoco.com/auth/v1",
      "SECRET_KEY_BASE" => "s" * 64, "ELEVATEO_BROWSER_ORIGIN" => "https://mail.elevateoco.com")
    assert_equal "production", Elevateo::Config.load!(values).mode
    { "RAILS_ENV" => "development", "ELEVATEO_DB_HOST" => "public.example.test",
      "ELEVATEO_OUTBOUND_HOLD" => "false", "ELEVATEO_OUTBOUND_MODE" => "mailpit",
      "ELEVATEO_LOCAL_HTTP" => "true", "SECRET_KEY_BASE" => "short",
      "ELEVATEO_MODE" => "local", "ELEVATEO_PROCESS" => "worker", "ELEVATEO_COOKIE_SECURE" => "false",
      "ELEVATEO_BROWSER_ORIGIN" => "https://other.example.test",
      "ELEVATEO_AUTH_URL" => "https://public.example.test" }.each do |name, value|
      assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(values.merge(name => value)) }
    end
    worker = values.merge("ELEVATEO_PROCESS" => "worker", "ELEVATEO_DB_ROLE" => "elevateo_worker",
      "WORKER_DB_PASSWORD" => "disposable")
    assert_equal "worker", Elevateo::Config.load!(worker).process
    migrator = values.merge("ELEVATEO_PROCESS" => "migrate", "ELEVATEO_DB_ROLE" => "elevateo_migrator",
      "MIGRATOR_DB_PASSWORD" => "disposable")
    assert_equal "migrate", Elevateo::Config.load!(migrator).process
  end

  def test_rejects_missing_short_or_non_base64_key_without_echoing_value
    [nil, Base64.strict_encode64("too-short"), "not*base64"].each do |key|
      error = assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(environment.merge("ELEVATEO_SESSION_KEY_BASE64" => key)) }
      refute_includes error.message, "too-short"
      refute_includes error.message, "not*base64"
    end
  end

  def test_authentik_requires_pinned_https_issuer_group_and_private_token
    values = environment.merge("ELEVATEO_SSO_PROVIDER" => "custom:authentik", "ELEVATEO_SSO_ENABLED" => "true",
      "ELEVATEO_AUTH_PUBLIC_URL" => "https://auth.test", "ELEVATEO_AUTHENTIK_ISSUER" => "https://identity.test/application/o/elevateo-mail/",
      "ELEVATEO_AUTHENTIK_GROUP" => "11111111-1111-4111-8111-111111111111", "ELEVATEO_AUTHENTIK_API_TOKEN" => "x" * 32)
    assert_equal values.fetch("ELEVATEO_AUTHENTIK_ISSUER"), Elevateo::Config.load!(values).authentik_issuer
    %w[ELEVATEO_AUTHENTIK_ISSUER ELEVATEO_AUTHENTIK_GROUP ELEVATEO_AUTHENTIK_API_TOKEN].each do |key|
      [nil, ""].each { |value| assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(values.merge(key => value)) } }
    end
    ["http://identity.test/application/o/mail/", "https://identity.test/application/o/mail/?x=1",
      "https://identity.test:8443/application/o/mail/", "https://user@identity.test/application/o/mail/"].each do |issuer|
      assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(values.merge("ELEVATEO_AUTHENTIK_ISSUER" => issuer)) }
    end
  end

  def test_sso_provider_is_explicitly_allowlisted
    assert_equal "custom:authentik", Elevateo::Config.load!(environment).sso_provider
    assert_equal "custom:authentik", Elevateo::Config.load!(environment.merge(
      "ELEVATEO_SSO_PROVIDER" => "custom:authentik")).sso_provider
    [nil, "", "google", "authentik", "custom:other", "https://issuer.test", "Google"].each do |provider|
      assert_raises(Elevateo::ConfigError) do
        Elevateo::Config.load!(environment.merge("ELEVATEO_SSO_PROVIDER" => provider))
      end
    end
  end

  def test_sso_switches_and_public_origin_do_not_change_private_auth_endpoint
    config = Elevateo::Config.load!(environment)
    refute config.sso_enabled
    refute config.sso_only
    assert_nil config.auth_public_url
    enabled = environment.merge("ELEVATEO_SSO_ENABLED" => "true", "ELEVATEO_SSO_ONLY" => "true",
      "ELEVATEO_AUTH_PUBLIC_URL" => "https://auth.example.test")
    config = Elevateo::Config.load!(enabled)
    assert config.sso_enabled
    assert config.sso_only
    assert_equal "http://auth:9999", config.auth_url
    assert_equal "https://auth.example.test", config.auth_public_url
    assert_equal "https://auth.example.test/auth/v1", Elevateo::Config.load!(enabled.merge(
      "ELEVATEO_AUTH_PUBLIC_URL" => "https://auth.example.test/auth/v1")).auth_public_url
    [nil, "http://auth.example.test", "https://auth.example.test/path", "https://user@auth.example.test",
      "https://auth.example.test/", "https://auth.example.test/auth/v1/", "https://auth.example.test:8443",
      "https://auth.example.test?x=1"].each do |url|
      assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(enabled.merge("ELEVATEO_AUTH_PUBLIC_URL" => url)) }
    end
    assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(enabled.merge("ELEVATEO_SSO_ENABLED" => "false")) }
    %w[ELEVATEO_SSO_ENABLED ELEVATEO_SSO_ONLY].each do |name|
      assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(enabled.merge(name => "yes")) }
    end
  end

  def test_production_sso_requires_password_lock_and_exact_gateway
    values = environment.merge("ELEVATEO_MODE" => "production", "RAILS_ENV" => "production",
      "ELEVATEO_SSO_ENABLED" => "true", "ELEVATEO_SSO_ONLY" => "true",
      "ELEVATEO_AUTH_PUBLIC_URL" => "https://mail.elevateoco.com/auth/v1",
      "SECRET_KEY_BASE" => "s" * 64, "ELEVATEO_BROWSER_ORIGIN" => "https://mail.elevateoco.com")
    assert Elevateo::Config.load!(values).sso_only
    assert_raises(Elevateo::ConfigError) do
      Elevateo::Config.load!(values.merge("ELEVATEO_SSO_ENABLED" => "false", "ELEVATEO_SSO_ONLY" => "false"))
    end
    assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(values.merge("ELEVATEO_SSO_ONLY" => "false")) }
    assert_raises(Elevateo::ConfigError) do
      Elevateo::Config.load!(values.merge("ELEVATEO_AUTH_PUBLIC_URL" => "https://auth.example.test/auth/v1"))
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

  def test_attachment_gateway_url_is_exact_internal_service_and_requires_key
    valid = environment.merge("ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64" => Base64.strict_encode64("g" * 32))
    assert_equal "http://attachment-gateway:4708", Elevateo::Config.load!(valid.merge(
      "ELEVATEO_ATTACHMENT_GATEWAY_URL" => "http://attachment-gateway:4708")).attachment_gateway_url
    ["https://attachment-gateway:4708", "http://attachment-gateway:4708/other", "http://evil.test:4708"].each do |url|
      assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(valid.merge("ELEVATEO_ATTACHMENT_GATEWAY_URL" => url)) }
    end
    assert_raises(Elevateo::ConfigError) do
      Elevateo::Config.load!(environment.merge("ELEVATEO_ATTACHMENT_GATEWAY_URL" => "http://attachment-gateway:4708"))
    end
  end

  def test_exact_jwt_policy_and_password_minimum
    { "ELEVATEO_AUTH_JWT_ALGORITHM" => "none", "ELEVATEO_AUTH_JWT_AUDIENCE" => "anon",
      "ELEVATEO_AUTH_PASSWORD_MINIMUM" => "6" }.each do |key, value|
      assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(environment.merge(key => value)) }
    end
  end

  def test_resend_boundary_defaults_and_redacts_secrets
    assert_equal "held", Elevateo::Config.load!(environment).outbound_mode
    secret = "whsec_#{Base64.strict_encode64("w" * 32)}"
    values = environment.merge("ELEVATEO_PROCESS" => "worker", "ELEVATEO_OUTBOUND_MODE" => "resend", "ELEVATEO_OUTBOUND_HOLD" => "false",
      "RESEND_API_KEY" => "re_abcdefghijklmnop", "ELEVATEO_RESEND_FROM_DOMAIN" => "Example.Test",
      "RESEND_WEBHOOK_SECRET" => secret)
    config = Elevateo::Config.load!(values)
    assert_equal "https://api.resend.com", config.resend_base_url
    assert_equal "example.test", config.resend_from_domain
    assert Elevateo::Config.load!(values.merge("ELEVATEO_OUTBOUND_HOLD" => "true")).outbound_hold
    refute_includes config.inspect, values.fetch("RESEND_API_KEY")
    refute_includes config.inspect, secret
    api_values = values.reject { |name, _| name == "RESEND_API_KEY" }.merge("ELEVATEO_PROCESS" => "api")
    assert_nil Elevateo::Config.load!(api_values).resend_api_key
    assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(api_values.merge("RESEND_API_KEY" => "re_abcdefghijklmnop")) }
  end

  def test_resend_boundary_rejects_missing_invalid_and_out_of_mode_values_without_echoing_them
    assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(environment.merge("RESEND_API_KEY" => "secret")) }
    base = environment.merge("ELEVATEO_PROCESS" => "worker", "ELEVATEO_OUTBOUND_MODE" => "resend", "ELEVATEO_OUTBOUND_HOLD" => "false",
      "RESEND_API_KEY" => "re_abcdefghijklmnop", "ELEVATEO_RESEND_FROM_DOMAIN" => "example.test",
      "RESEND_WEBHOOK_SECRET" => "whsec_#{Base64.strict_encode64("w" * 32)}")
    %w[RESEND_API_KEY ELEVATEO_RESEND_FROM_DOMAIN].each do |name|
      error = assert_raises(Elevateo::ConfigError) { Elevateo::Config.load!(base.merge(name => "")) }
      assert_includes error.message, name
    end
    error = assert_raises(Elevateo::ConfigError) do
      Elevateo::Config.load!(base.merge("RESEND_API_KEY" => "re_do_not_echo"))
    end
    refute_includes error.message, "re_do_not_echo"
  end
end
