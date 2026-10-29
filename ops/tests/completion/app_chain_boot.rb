# frozen_string_literal: true

# AIDEV-NOTE: Historical pipeline oracle injects transport selection, not production Authentik admission.
required = { "RAILS_ENV" => "test", "ELEVATEO_MODE" => "local", "ELEVATEO_DB_HOST" => "db",
             "ELEVATEO_DB_NAME" => "postgres", "ELEVATEO_DB_ROLE" => "elevateo_api",
             "ELEVATEO_PROCESS" => "api", "ELEVATEO_OUTBOUND_MODE" => "held",
             "ELEVATEO_OUTBOUND_HOLD" => "true", "BE02_ISOLATED_APP_CHAIN" => "1" }
raise "isolated app-chain fixture admission failed" unless required.all? { |key, value| ENV[key] == value }
raise "container fixture required" unless File.file?("/.dockerenv")
require File.expand_path("config/boot", Dir.pwd)
require File.expand_path("lib/elevateo/config", Dir.pwd)
config = Elevateo::Config.load!
# AIDEV-NOTE: Validate held/local first; override only this fixture instance and retain all HTTP/security checks.
def config.outbound_mode = "mox"
Elevateo::Config.instance_variable_set(:@current, config)
ARGV.replace(["server", "-b", "0.0.0.0", "-p", "3000"])
load File.expand_path("bin/rails", Dir.pwd)
