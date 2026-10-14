# frozen_string_literal: true

# AIDEV-NOTE: run inside the isolated app container with private env; print no values.
require_relative "../../apps/server/lib/elevateo/config"

begin
  config = Elevateo::Config.load!
  raise Elevateo::ConfigError, "send API must remain disabled" if config.send_api_enabled
  raise Elevateo::ConfigError, "outbound hold must remain active" unless config.outbound_hold
  raise Elevateo::ConfigError, "wrong process" unless %w[api worker].include?(config.process)
  puts "PASS local application configuration boundary"
rescue Elevateo::ConfigError => error
  warn "FAIL local application configuration boundary: #{error.message}"
  exit 1
end
