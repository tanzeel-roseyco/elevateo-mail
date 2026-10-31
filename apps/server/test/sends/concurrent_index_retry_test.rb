# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../db/schema_integrity/concurrent_indexes"

# AIDEV-NOTE: Simulate catalog outcomes of interrupted concurrent DDL without mutating the shared database catalog.
class ConcurrentIndexRetryTest < Minitest::Test
  class Migration
    include SchemaIntegrityConcurrentIndexes
    attr_reader :statements

    def initialize(existing)
      @existing = existing
      @statements = []
    end

    def select_one(_sql)
      @existing
    end

    def connection
      self
    end

    def quote(value)
      "'#{value.gsub("'", "''")}'"
    end

    def execute(sql)
      @statements << sql
    end
  end

  def existing(ready:, definition: "CREATE INDEX retry_fixture ON app.fixture USING btree (organization_id, id DESC)")
    { "definition" => definition, "ready" => ready }
  end

  def test_valid_matching_index_is_not_rebuilt
    migration = Migration.new(existing(ready: true))
    migration.ensure_index("app.fixture", "retry_fixture", "organization_id,id DESC")
    assert_empty migration.statements
  end

  def test_invalid_matching_index_is_dropped_then_rebuilt_concurrently
    migration = Migration.new(existing(ready: false))
    migration.ensure_index("app.fixture", "retry_fixture", "organization_id,id DESC")
    assert_equal ["DROP INDEX CONCURRENTLY IF EXISTS app.retry_fixture",
      "CREATE INDEX CONCURRENTLY retry_fixture ON app.fixture(organization_id,id DESC)"], migration.statements
  end

  def test_mismatched_index_fails_without_dropping_existing_data_structure
    [true, false].each do |ready|
      migration = Migration.new(existing(ready: ready, definition: "CREATE INDEX retry_fixture ON app.fixture USING btree (id)"))
      error = assert_raises(RuntimeError) { migration.ensure_index("app.fixture", "retry_fixture", "organization_id,id DESC") }
      assert_includes error.message, "unexpected index definition"
      assert_empty migration.statements
    end
  end

  def test_missing_index_is_created_concurrently
    migration = Migration.new(nil)
    migration.ensure_index("app.fixture", "retry_fixture", "organization_id,id DESC")
    assert_equal ["CREATE INDEX CONCURRENTLY retry_fixture ON app.fixture(organization_id,id DESC)"], migration.statements
  end
end
