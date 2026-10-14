# frozen_string_literal: true

require "json"
require "pg"
require "timeout"
require_relative "../../lib/elevateo/session_store"

# AIDEV-NOTE: Exec children own fresh API logins; output contains only status, generation and OS/backend IDs.
connection = nil
begin
  Timeout.timeout(8) do
    input = JSON.parse(STDIN.readline)
    connection = PG.connect(ENV.fetch("BE02_API_DATABASE_URL"))
    identity = connection.exec("SELECT session_user, current_database(), pg_backend_pid() AS pid").first
    raise "identity mismatch" unless identity.fetch("session_user") == "elevateo_api" &&
      identity.fetch("current_database") == ENV.fetch("BE02_TASK_DATABASE_NAME")
    connection.exec("SET statement_timeout = '3s'")
    connection.exec("SET lock_timeout = '1s'")
    STDOUT.sync = true
    loop do
      name, values = input.fetch("name"), input.fetch("values")
      allowed = %w[claim_refresh publish_refresh revoke_session resolve_session]
      raise "operation rejected" unless allowed.include?(name)
      types = Elevateo::SessionStore::FUNCTIONS.fetch(name)
      raise "arity mismatch" unless types.length == values.length
      parameters = types.each_with_index.map { |type, index| "$#{index + 1}::#{type}" }.join(", ")
      # AIDEV-NOTE: Autocommit completes before ACK; no inherited connection or transaction survives process death.
      result = JSON.parse(connection.exec_params("SELECT app_auth.#{name}(#{parameters})", values).getvalue(0, 0))
      boundary = begin
        Elevateo::SessionStore.check!(result)
        "accepted"
      rescue Elevateo::AuthError => error
        error.code
      end
      puts JSON.generate({ "status" => result.fetch("status"), "boundary" => boundary,
        "generation" => result["refresh_generation"], "pid" => Process.pid,
        "backend_pid" => Integer(identity.fetch("pid")) })
      break unless input.fetch("hold", false)
      input = JSON.parse(STDIN.readline)
    end
  end
rescue StandardError
  # Deliberately fail closed without printing PG details, arguments, credentials or provider data.
  STDERR.write("ADV807 child failed\n")
  exit 1
ensure
  connection&.close
end
