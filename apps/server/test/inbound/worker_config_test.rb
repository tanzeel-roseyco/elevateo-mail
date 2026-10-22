# frozen_string_literal: true

require "minitest/autorun"
require_relative "worker_environment"
require_relative "../../lib/elevateo/inbound/worker_config"

class InboundWorkerConfigTest < Minitest::Test
  include InboundWorkerEnvironment

  def test_loads_held_worker_and_copies_paths_without_disclosing_them
    env = worker_environment
    config = Elevateo::Inbound::WorkerConfig.load!(env)
    assert config.frozen?
    assert config.credentials_path.frozen?
    assert config.ca_path.frozen?
    assert_equal "elevateo_worker", config.runtime.db_role
    env.fetch("ELEVATEO_IMAP_CREDENTIALS_PATH").replace("/changed")
    env.fetch("ELEVATEO_IMAP_CA_PATH").replace("/changed")
    assert_equal "/private/credentials.json", config.credentials_path
    assert_equal "/private/ca.pem", config.ca_path
    [config.inspect, config.to_s].each do |text|
      refute_includes text, "/private"
      refute_includes text, "disposable"
    end
  end

  def test_rejects_absent_or_other_profile_and_non_worker_identity
    [nil, "", "mox-smtp-test-v1", "production"].each do |profile|
      assert_raises(Elevateo::ConfigError) { load_changes("ELEVATEO_IMAP_PROFILE" => profile) }
    end
    assert_raises(Elevateo::ConfigError) { load_changes("ELEVATEO_PROCESS" => "api") }
    assert_raises(Elevateo::ConfigError) do
      load_changes("ELEVATEO_DB_ROLE" => "elevateo_api", "API_DB_PASSWORD" => "disposable")
    end
    assert_raises(Elevateo::ConfigError) do
      load_changes("ELEVATEO_DB_ROLE" => "elevateo_migrator", "MIGRATOR_DB_PASSWORD" => "disposable")
    end
  end

  def test_paths_are_required_absolute_bounded_and_nul_free
    %w[ELEVATEO_IMAP_CREDENTIALS_PATH ELEVATEO_IMAP_CA_PATH].each do |key|
      [nil, "", "/", "relative/secret", "/secret\0tail", "/" + "s" * 4096].each do |value|
        error = assert_raises(Elevateo::ConfigError) { load_changes(key => value) }
        refute_includes error.message, "secret"
      end
      assert_equal "/" + "s" * 4095,
        Elevateo::Inbound::WorkerConfig.load!(worker_environment.merge(key => "/" + "s" * 4095)).public_send(
          key.end_with?("CA_PATH") ? :ca_path : :credentials_path)
    end
  end

  def test_shared_runtime_boundary_still_rejects_release_and_privileged_settings
    [{ "ELEVATEO_OUTBOUND_HOLD" => "false" }, { "ELEVATEO_MODE" => "production" },
      { "ELEVATEO_SMTP_HOST" => "smtp.live.test" }, { "SUPABASE_SERVICE_ROLE_KEY" => "secret" },
      { "ELEVATEO_ATTACHMENT_STORAGE_SERVICE_TOKEN" => "secret" }, { "RESEND_API_KEY" => "secret" },
      { "ELEVATEO_SESSION_KEY_BASE64" => "broken" }].each do |change|
      assert_raises(Elevateo::ConfigError) { load_changes(change) }
    end
  end

  def test_production_imap_uses_verified_system_roots_and_separate_port
    config = Elevateo::Inbound::WorkerConfig.load!(production_environment)
    assert_equal "mail.dispatch.company.com", config.host
    assert_equal 993, config.port
    refute config.simulated
    assert_nil config.ca_path
    assert config.runtime.outbound_hold
  end

  def test_production_dispatch_requires_explicit_activation_and_independent_hold
    env = production_environment.merge("ELEVATEO_OUTBOUND_HOLD" => "false")
    assert_raises(Elevateo::ConfigError) { Elevateo::Inbound::WorkerConfig.load!(env) }
    config = Elevateo::Inbound::WorkerConfig.load!(env.merge("ELEVATEO_MOX_PRODUCTION_ENABLED" => "true"))
    refute config.runtime.outbound_hold
    assert_raises(Elevateo::ConfigError) do
      Elevateo::Inbound::WorkerConfig.load!(production_environment.merge("ELEVATEO_MOX_HOST" => "localhost"))
    end
  end

  private

  def production_environment
    worker_environment.merge("ELEVATEO_MODE" => "production", "RAILS_ENV" => "production",
      "SECRET_KEY_BASE" => "s" * 64, "ELEVATEO_BROWSER_ORIGIN" => "https://mail.elevateoco.com",
      "ELEVATEO_OUTBOUND_MODE" => "mox", "ELEVATEO_IMAP_PROFILE" => "mox-imap-v1",
      "ELEVATEO_MOX_HOST" => "mail.dispatch.company.com", "ELEVATEO_MOX_VERIFIED_DOMAINS" => '["dispatch.company.com"]' ,
      "ELEVATEO_MOX_CREDENTIALS_PATH" => "/private/smtp.json")
  end

  def load_changes(change) = Elevateo::Inbound::WorkerConfig.load!(worker_environment.merge(change))
end
