# frozen_string_literal: true

require "base64"

# AIDEV-NOTE: Shared synthetic settings exercise the real boundary in unit and isolated process fixtures.
module InboundWorkerEnvironment
  def worker_environment
    { "ELEVATEO_MODE" => "local", "ELEVATEO_OUTBOUND_HOLD" => "true", "ELEVATEO_PROCESS" => "worker",
      "ELEVATEO_DB_HOST" => "db", "ELEVATEO_DB_NAME" => "test", "ELEVATEO_DB_ROLE" => "elevateo_worker",
      "WORKER_DB_PASSWORD" => "disposable", "ELEVATEO_SMTP_HOST" => "mailpit", "ELEVATEO_SMTP_PORT" => "1025",
      "ELEVATEO_AUTH_URL" => "http://auth:9999", "ELEVATEO_STORAGE_URL" => "http://storage:5000",
      "ELEVATEO_MAILPIT_URL" => "http://mailpit:8025", "SECRET_KEY_BASE" => "disposable-test-secret",
      "ELEVATEO_SESSION_KEY_BASE64" => Base64.strict_encode64("k" * 32), "ELEVATEO_BROWSER_ORIGIN" => "https://app.test",
      "ELEVATEO_COOKIE_SECURE" => "true", "ELEVATEO_AUTH_JWT_ISSUER" => "http://auth:9999",
      "ELEVATEO_AUTH_JWT_AUDIENCE" => "authenticated", "ELEVATEO_AUTH_JWT_ALGORITHM" => "HS256",
      "ELEVATEO_AUTH_PASSWORD_MINIMUM" => "12", "ELEVATEO_IMAP_PROFILE" => "mox-imap-test-v1",
      "ELEVATEO_IMAP_CREDENTIALS_PATH" => "/private/credentials.json", "ELEVATEO_IMAP_CA_PATH" => "/private/ca.pem" }
      .transform_values(&:dup)
  end
end
