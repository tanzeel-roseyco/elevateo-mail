# frozen_string_literal: true

require "digest"
require_relative "state"
require_relative "../../bin/generate-secrets"

# AIDEV-NOTE: Read-only credential comparison; the private digest is retained in task state, never console output.
begin
  mode = ARGV.fetch(0)
  Be01Services.expect(%w[baseline compare].include?(mode), "credential phase")
  values = LocalSecrets.validate("/credentials/local.env")
  digest = Digest::SHA256.hexdigest(JSON.generate(values.sort.to_h))
  if mode == "baseline"
    Be01Services::State.write_once("/acceptance/credentials-baseline.json", { "sha256" => digest })
  else
    Be01Services.expect(Be01Services::State.read("/acceptance/credentials-baseline.json") == { "sha256" => digest },
                        "credentials unchanged")
  end
  puts "PASS credentials #{mode}"
rescue StandardError => error
  warn "FAIL credential fixture (#{error.class.name})"
  exit 1
end
