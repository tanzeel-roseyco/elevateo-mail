# frozen_string_literal: true
require "json"
require "minitest/autorun"
require_relative "../../lib/elevateo/write_input"
require_relative "../../lib/elevateo/email_finder/input"

# AIDEV-NOTE: Finder contract bounds stay paired with the real boundary validator, independent of legacy v2 drafts.
class EmailFinderContractTest < Minitest::Test
  def setup
    @contract = JSON.parse(File.read(File.expand_path("../../../../contracts/v2/openapi.json", __dir__)))
    @schemas = @contract.fetch("components").fetch("schemas")
  end

  def test_four_feature_wire_kinds_match_boundary_and_routes
    kinds = @schemas.dig("EmailFinderCreateJob", "properties", "kind", "enum")
    assert_equal Elevateo::EmailFinder::Input::KINDS, kinds
    operations = @contract.fetch("paths").select { |path, _| path.start_with?("/v2/email-finder/") }.values.flat_map(&:values)
    assert_equal 8, operations.length
    operations.each do |operation|
      assert_equal "active", operation.fetch("x-elevateo-status")
      assert_includes operation.fetch("parameters").map { |entry| entry.fetch("name") }, "X-Session-Context"
      assert operation.fetch("responses").key?("403")
    end
  end

  def test_contract_row_limit_rejects_overflow_at_runtime
    bound = @schemas.dig("EmailFinderCreateJob", "properties", "rows", "maxItems")
    assert_equal 5000, bound
    assert_raises(Elevateo::CollaborationError) do
      Elevateo::EmailFinder::Input.rows("verify", Array.new(bound + 1) { { "email" => "jane@example.com" } }, nil)
    end
  end

  def test_contract_csv_limit_rejects_overflow_at_runtime
    bound = @schemas.dig("EmailFinderCreateJob", "properties", "csv", "maxLength")
    assert_equal 2_097_152, bound
    assert_raises(Elevateo::CollaborationError) do
      Elevateo::EmailFinder::Input.rows("verify", nil, "x" * (bound + 1))
    end
  end
end
