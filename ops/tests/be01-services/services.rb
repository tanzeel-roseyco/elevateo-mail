# frozen_string_literal: true

require "timeout"
require_relative "state"
require_relative "auth"
require_relative "storage"

# AIDEV-NOTE: Repeated seed becomes check; partial seeds fail, and checks never recreate missing service data.
begin
  Timeout.timeout(150) do
    mode = ARGV.fetch(0)
    Be01Services.expect(%w[seed check].include?(mode), "service phase")
    mode = "check" if mode == "seed" && File.exist?(Be01Services::State::PATH)
    data = mode == "seed" ? Be01Services::State.init : Be01Services::State.load
    auth = Be01Services::Auth.new(ENV.fetch("SERVICE_ROLE_KEY"))
    storage = Be01Services::Storage.new(ENV.fetch("SERVICE_ROLE_KEY"), "be01-#{data.fetch('nonce')}", data.fetch("mailbox"))
    if mode == "seed"
      ids = %w[owner outsider].map do |role|
        auth.provision(Be01Services::State.email(data, role), data.fetch("password"))
      end
      Be01Services::State.write_once("/acceptance/identities.json", ids)
      auth.signup_denied(Be01Services::State.email(data, "signup"), data.fetch("password"))
      auth.capture("invite", Be01Services::State.email(data, "invite"))
      auth.capture("recovery", Be01Services::State.email(data, "owner"))
      storage.seed(Be01Services::State.bytes(data))
    else
      Be01Services.expect(Be01Services::State.read("/acceptance/services-ready.json") == { "ready" => true },
                          "completed seed required")
    end
    ids = Be01Services::State.identities
    %w[owner outsider].zip(ids).each do |role, id|
      auth.identity(id, Be01Services::State.email(data, role))
    end
    token = auth.token(Be01Services::State.email(data, "owner"), data.fetch("password"), ids.first)
    storage.check(Be01Services::State.bytes(data), ENV.fetch("ANON_KEY"), token)
    Be01Services::State.write_once("/acceptance/services-ready.json", { "ready" => true }) if mode == "seed"
    puts "PASS Auth identity/token; private Storage bytes; anonymous/user/public denial"
    puts "PASS signup_disabled; invite/recovery local capture" if mode == "seed"
  end
rescue StandardError => error
  # Do not print upstream exceptions, URLs, request payloads, tokens or database connection strings.
  warn "FAIL service fixture (#{error.class.name})"
  exit 1
end
