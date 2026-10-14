# frozen_string_literal: true

require "minitest/autorun"
require "active_record"
require "active_support/core_ext/string/filters"
require_relative "../../db/migrate/20261013000009_create_campaign_foundation"

class CampaignMigrationPolicyTest < Minitest::Test
  class Capture < CreateCampaignFoundation
    attr_reader :statements

    def execute(statement)
      @statements ||= []
      @statements << statement
    end
  end

  def test_generated_role_and_integrity_predicates_keep_sql_token_boundaries
    migration = Capture.new
    migration.up
    policies = migration.statements.select { |sql| sql.include?("CREATE POLICY campaign_") }
    assert_equal 15, policies.length
    policies.each { |sql| refute_match(/ENDAND\b/, sql) }
    integrity = policies.select { |sql| sql.include?("campaign_leads.consent_operation_id") ||
      sql.include?("campaign_consent_events.actor_id") || sql.include?("resource_kind='campaign'") }
    assert_equal 4, integrity.length
    integrity.each { |sql| assert_match(/END\s+AND\b/, sql) }
    reads = policies.select { |sql| sql.include?("FOR SELECT") }
    writes = policies - reads
    assert_equal 6, reads.length
    assert_equal 9, writes.length
    reads.each do |sql|
      assert_includes sql, "authorize_outreach_content_read"
      refute_includes sql, "authorize_outreach_draft_write"
    end
    writes.each do |sql|
      assert_includes sql, "authorize_outreach_draft_write"
      refute_includes sql, "authorize_outreach_content_read"
    end
  end
end
