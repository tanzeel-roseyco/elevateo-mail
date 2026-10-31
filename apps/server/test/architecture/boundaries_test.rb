# frozen_string_literal: true

# AIDEV-NOTE: Interpolation is fixture source text; it must reach the parser without executing here.
# rubocop:disable Lint/InterpolationCheck

require "minitest/autorun"
require_relative "scanner"

class ArchitectureTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)

  def policy
    { "files" => { "a.rb" => "a", "b.rb" => "b" }, "public" => [],
      "tables" => { "app.secrets" => "b", "app.organizations" => "shared_kernel" },
      "functions" => [], "exceptions" => {} }
  end

  def scan(code, rules = policy)
    ArchitectureScanner.new({ "a.rb" => code,
      "b.rb" => "module Elevateo; module B; class Private; end; class API; end; end; end" }).violations(rules)
  end

  def test_insert_column_list_does_not_hide_foreign_table
    assert(scan('sql = "INSERT INTO secrets(id) VALUES (1)"').any? { |error| error.include?("Unqualified SQL relation") })
  end

  def test_repository_boundaries
    scanner = ArchitectureScanner.new(ArchitectureScanner.sources(ROOT))
    assert_empty scanner.violations(JSON.parse(File.read(File.join(ROOT, "architecture.json"))))
  end

  def test_private_qualified_constant_is_rejected
    assert(scan("Elevateo::B::Private.new").any? { |error| error.include?("constant|a.rb|Elevateo::B::Private") })
  end

  def test_private_lexical_constant_is_rejected
    assert(scan("module Elevateo; class A; def call; B::Private.new; end; end; end").any? { |error| error.include?("constant|a.rb|") })
  end

  def test_public_contract_and_shared_identity_are_allowed
    rules = policy.merge("public" => ["Elevateo::B::API"])
    assert_empty scan('Elevateo::B::API.new; sql = "SELECT * FROM app.organizations"', rules)
  end

  def test_foreign_reads_and_writes_are_rejected
    ["SELECT * FROM", "INSERT INTO", "UPDATE", "DELETE FROM"].each do |verb|
      assert(scan("sql = #{"#{verb} app.secrets".inspect}").any? { |error| error.include?("table|a.rb|app.secrets") })
    end
  end

  def test_unknown_table_and_source_are_rejected
    assert(scan('sql = "SELECT * FROM app.unknown"').any? { |error| error.include?("Unknown SQL object") })
    assert(scan("nil", policy.merge("files" => {})).any? { |error| error.include?("Unclassified source") })
  end

  def test_comments_do_not_create_dependencies
    assert_empty scan("# Elevateo::B::Private.new; SELECT * FROM app.secrets\nnil")
  end

  def test_exact_exception_does_not_allow_another_target
    rules = policy.merge("exceptions" => { "constant|a.rb|Elevateo::B::Private" => "fixture reason" })
    assert_empty scan("Elevateo::B::Private.new", rules)
    assert(scan("Elevateo::B::API.new", rules).any? { |error| error.include?("Undeclared") })
    assert(scan("nil", rules).any? { |error| error.include?("Stale exception") })
  end

  def test_invalid_ruby_fails_closed
    assert_raises(RuntimeError) { scan("module") }
  end

  def test_quoted_foreign_table_is_rejected
    assert(scan('sql = %q{SELECT * FROM "app"."secrets"}').any? { |error| error.include?("table|a.rb|app.secrets") })
  end

  def test_dynamic_sql_requires_exact_reviewed_source
    code = 'sql = "SELECT * FROM app.#{table}"'
    assert(scan(code).any? { |error| error.include?("Unreviewed dynamic SQL") })
    rules = policy.merge("dynamic_sql" => { "a.rb" => Digest::SHA256.hexdigest(code) })
    assert_empty scan(code, rules)
    assert(scan(code + "; nil", rules).any? { |error| error.include?("Unreviewed dynamic SQL") })
  end

  def test_reflection_cannot_bypass_constant_boundaries
    assert(scan('Elevateo.const_get("B")').any? { |error| error.include?("Dynamic constant lookup") })
  end

  def test_spaced_and_unqualified_relations_cannot_bypass_ownership
    assert(scan('sql = "SELECT * FROM app . secrets"').any? { |error| error.include?("table|a.rb|app.secrets") })
    assert(scan('sql = "SELECT * FROM secrets"').any? { |error| error.include?("Unqualified SQL relation") })
    assert(scan('sql = "SELECT secrets.id FROM secrets"').any? { |error| error.include?("Unqualified SQL relation") })
  end

  def test_interpolation_and_concatenation_cannot_hide_a_relation
    ['sql = "SELECT * FROM #{table}"', 'sql = "SELECT * FROM " + table', 'sql = "SELECT * FROM app." + table'].each do |code|
      assert(scan(code).any? { |error| error.include?("Unreviewed dynamic SQL") })
    end
  end

  def test_foreign_reopening_is_rejected
    assert(scan('module Elevateo; module B; class Private; end; end; end').any? { |error| error.include?("Cross-module declaration") })
    assert(scan('class Elevateo::B::NewPrivate; end').any? { |error| error.include?("Cross-module namespace extension") })
  end

  def test_sql_function_requires_explicit_caller
    rules = policy.merge("functions" => ["app.read_snapshot"])
    code = 'sql = "SELECT app.read_snapshot()"'
    assert(scan(code, rules).any? { |error| error.include?("Undeclared SQL contract") })
    assert_empty scan(code, rules.merge("sql_contracts" => ["a.rb|app.read_snapshot"]))
  end

  def test_public_class_does_not_export_nested_constants
    sources = { "a.rb" => "Elevateo::B::API::SQL", "b.rb" => "module Elevateo; module B; class API; SQL = 'secret'; end; end; end" }
    errors = ArchitectureScanner.new(sources).violations(policy.merge("public" => ["Elevateo::B::API"]))
    assert(errors.any? { |error| error.include?("constant|a.rb|Elevateo::B::API::SQL") })
  end
end

# rubocop:enable Lint/InterpolationCheck
