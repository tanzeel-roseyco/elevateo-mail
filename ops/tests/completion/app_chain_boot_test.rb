# frozen_string_literal: true

require "minitest/autorun"
require "open3"
require "rbconfig"

class AppChainBootAdmissionTest < Minitest::Test
  # AIDEV-NOTE: Rejection occurs before Rails or credentials load; the isolated real chain covers accepted boot.
  def denied(overrides)
    env = { "RAILS_ENV" => "test", "ELEVATEO_MODE" => "local", "ELEVATEO_DB_HOST" => "db",
            "ELEVATEO_DB_NAME" => "postgres", "ELEVATEO_DB_ROLE" => "elevateo_api",
            "ELEVATEO_PROCESS" => "api", "ELEVATEO_OUTBOUND_MODE" => "held",
            "ELEVATEO_OUTBOUND_HOLD" => "true", "BE02_ISOLATED_APP_CHAIN" => "1" }.merge(overrides)
    _out, error, status = Open3.capture3(env, RbConfig.ruby, File.expand_path("app_chain_boot.rb", __dir__),
                                        unsetenv_others: true)
    refute status.success?
    assert_includes error, "isolated app-chain fixture admission failed"
  end

  def test_production_cannot_use_adapter
    denied("RAILS_ENV" => "production")
  end

  def test_nonfixture_database_and_role_cannot_use_adapter
    denied("ELEVATEO_DB_NAME" => "live")
    denied("ELEVATEO_DB_ROLE" => "elevateo_worker")
    denied("BE02_ISOLATED_APP_CHAIN" => "0")
  end
end
