# frozen_string_literal: true

require "minitest/autorun"
require "minitest/mock"
require "erb"
require "yaml"
require_relative "../../lib/elevateo/config"

# AIDEV-NOTE: Exercise the real ERB/YAML boundary without connecting to a database or exposing credentials.
class DatabaseYamlTest < Minitest::Test
  def test_password_scalars_round_trip_in_every_environment
    passwords = ["\u0085", "\u2028", "\u2029", "\ufffe", "\uffff", "ordinary-password", "#leading-comment", "contains: space", "true", "null", "123",
                 "quote\"slash\\", "line\nbreak\tand space ", "\u96ea\u{1f510}", "x" * 4096]
    passwords.each_with_index do |password, index|
      config = Struct.new(:db_host, :db_name, :db_role, :db_password, :db_pool).new("db", "test", "elevateo_api", password, 5)
      Elevateo::Config.stub(:load!, config) do
        rendered = ERB.new(File.read(File.expand_path("../../config/database.yml", __dir__))).result
        parsed = YAML.safe_load(rendered, aliases: true)
        %w[development test production].each do |environment|
          assert parsed.fetch(environment).fetch("password") == password, "scalar case #{index} in #{environment}"
        end
      end
    end
  end

  def test_pool_default_and_inclusive_bounds_are_integers
    [nil, "1", "100"].each do |pool|
      config = pool_config(pool)
      assert_equal pool ? pool.to_i : 5, config.db_pool
      Elevateo::Config.stub(:load!, config) do
        rendered = ERB.new(File.read(File.expand_path("../../config/database.yml", __dir__))).result
        assert_equal config.db_pool, YAML.safe_load(rendered, aliases: true).fetch("production").fetch("pool")
      end
    end
  end

  def test_pool_rejects_empty_noninteger_unbounded_and_yaml_injection_values
    ["", "0", "101", "-1", "+5", "01", "1.0", "five", " 5", "5\n  injected: true", "9" * 4096].each do |pool|
      assert_raises(Elevateo::ConfigError) { pool_config(pool) }
    end
  end

  private

  def pool_config(pool)
    values = { "ELEVATEO_MODE" => "local", "ELEVATEO_OUTBOUND_HOLD" => "true", "ELEVATEO_PROCESS" => "migrator",
      "ELEVATEO_DB_HOST" => "db", "ELEVATEO_DB_NAME" => "test", "ELEVATEO_DB_ROLE" => "elevateo_migrator",
      "MIGRATOR_DB_PASSWORD" => "disposable", "ELEVATEO_SMTP_HOST" => "mailpit", "ELEVATEO_SMTP_PORT" => "1025",
      "ELEVATEO_AUTH_URL" => "http://auth:9999", "ELEVATEO_STORAGE_URL" => "http://storage:5000",
      "ELEVATEO_MAILPIT_URL" => "http://mailpit:8025", "SECRET_KEY_BASE" => "disposable-test-secret" }
    values["ELEVATEO_DB_POOL"] = pool unless pool.nil?
    Elevateo::Config.load!(values)
  end
end
