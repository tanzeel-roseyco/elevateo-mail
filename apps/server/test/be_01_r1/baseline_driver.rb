# frozen_string_literal: true

require File.expand_path("config/environment", Dir.pwd)
require "json"
require_relative "authority_guards"
require_relative "baseline_scenarios"

# AIDEV-NOTE: Mount this driver beside immutable baseline/repair exports; never patch the loaded tenancy code.
class R1BaselineDriver
  include R1AuthorityGuards
  include R1BaselineScenarios
  class RepairFailure < StandardError; end
  A = Elevateo::Tenancy::Principal.new(user_id: "20000000-0000-0000-0000-000000000001",
                                     org_id: "10000000-0000-0000-0000-000000000001")
  B = Elevateo::Tenancy::Principal.new(user_id: "20000000-0000-0000-0000-000000000003",
                                     org_id: "10000000-0000-0000-0000-000000000002")
  IDS_A = %w[30000000-0000-0000-0000-000000000001 30000000-0000-0000-0000-000000000002].freeze
  IDS_B = %w[30000000-0000-0000-0000-000000000003].freeze

  def initialize(mode)
    guard!(%w[baseline repair].include?(mode), "mode must be baseline or repair")
    @mode = mode
  end

  def rows(connection)
    connection.select_values("SELECT id FROM app.mailboxes ORDER BY id")
  end

  def context(principal, connection, &block)
    Elevateo::Tenancy.with_context(principal, connection: connection, &block)
  end

  def claims(connection)
    # Corroboration must not invalidate or populate the ActiveRecord cache under observation in T3.
    connection.raw_connection.exec_params(
      "SELECT current_setting('app.user_id', true), current_setting('app.org_id', true)", []
    ).values.fetch(0)
  end

  def empty_claims?(values)
    values.all? { |value| value.nil? || value.empty? }
  end

  def repair!(condition, message)
    raise RepairFailure, message unless condition
  end

  def positive_fixtures(connection)
    [[A, IDS_A], [B, IDS_B]].each do |principal, expected|
      context(principal, connection) do
        guard!(claims(connection) == [principal.user_id, principal.org_id], "fixture claim setup failed")
        connection.uncached { guard!(rows(connection) == expected, "authorized synthetic fixtures missing") }
      end
    end
  end

  def run
    results = %w[T1 T2 T3].map do |scenario|
      begin
        ActiveRecord::Base.connection_pool.release_connection
        result = Rails.application.executor.wrap do
          ActiveRecord::Base.connection_pool.with_connection do |connection|
            identity = guard_authority(connection, @mode)
            positive_fixtures(connection)
            evidence, reproduced = public_send(scenario.downcase, connection)
            guard!(!connection.transaction_open? && empty_claims?(claims(connection)), "scenario left tenant context")
            { scenario: scenario, mode: @mode, identity: identity, evidence: evidence,
              result: @mode == "baseline" ? (reproduced ? "REPRODUCED" : "NOT_REPRODUCED") : "REPAIR_PASS" }
          ensure
            connection.clear_query_cache
          end
        end
      rescue RepairFailure => error
        result = { scenario: scenario, result: "REPAIR_FAIL", reason: error.message }
      rescue StandardError => error
        # Exception classes identify setup failure without leaking connection/environment details.
        result = { scenario: scenario, result: "SETUP_ERROR", error: error.class.name }
      ensure
        ActiveRecord::Base.connection_pool.release_connection
      end
      puts JSON.generate(result)
      result
    end
    # Expected baseline reproduction is still a failing security check, never a passing isolation result.
    @mode == "repair" && results.all? { |result| result[:result] == "REPAIR_PASS" }
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    exit(R1BaselineDriver.new(ARGV.fetch(0)).run ? 0 : 1)
  rescue StandardError => error
    puts JSON.generate(result: "SETUP_ERROR", error: error.class.name)
    exit 1
  end
end
