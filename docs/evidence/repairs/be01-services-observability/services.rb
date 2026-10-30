# frozen_string_literal: true

require "timeout"
require_relative "state"
require_relative "auth"
require_relative "storage"
require_relative "diagnostic"

# AIDEV-NOTE: Repeated seed becomes check; partial seeds fail, and checks never recreate missing service data.
stage = "setup"
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
        stage = "provision_#{role}"
        auth.provision(Be01Services::State.email(data, role), data.fetch("password"))
      end
      stage = "persist_identities"
      Be01Services::State.write_once("/acceptance/identities.json", ids)
      stage = "signup_denial"
      auth.signup_denied(Be01Services::State.email(data, "signup"), data.fetch("password"))
      stage = "invite_capture"
      auth.capture("invite", Be01Services::State.email(data, "invite"))
      stage = "recovery_capture"
      auth.capture("recovery", Be01Services::State.email(data, "owner"))
      stage = "storage_seed"
      storage.seed(Be01Services::State.bytes(data))
    else
      stage = "completed_seed"
      Be01Services.expect(Be01Services::State.read("/acceptance/services-ready.json") == { "ready" => true },
                          "completed seed required")
    end
    stage = "identities"
    ids = Be01Services::State.identities
    %w[owner outsider].zip(ids).each do |role, id|
      stage = "identity_#{role}"
      auth.identity(id, Be01Services::State.email(data, role))
    end
    stage = "password_token"
    token = auth.token(Be01Services::State.email(data, "owner"), data.fetch("password"), ids.first)
    stage = "storage_check"
    storage.check(Be01Services::State.bytes(data), ENV.fetch("ANON_KEY"), token)
    stage = "mark_ready"
    Be01Services::State.write_once("/acceptance/services-ready.json", { "ready" => true }) if mode == "seed"
    puts "PASS Auth identity/token; private Storage bytes; anonymous/user/public denial"
    puts "PASS signup_disabled; invite/recovery local capture" if mode == "seed"
  end
rescue StandardError => error
  # AIDEV-NOTE: Emit only allowlisted stages/assertions, never upstream messages or private data.
  warn Be01Services::Diagnostic.report(stage, error)
  exit 1
end
