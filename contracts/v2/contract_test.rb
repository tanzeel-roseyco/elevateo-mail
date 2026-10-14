# frozen_string_literal: true

require "json"
require "minitest/autorun"

class ContractV2Test < Minitest::Test
  SOURCE = File.expand_path("openapi.json", __dir__)
  V1 = File.expand_path("../v1/openapi.json", __dir__)

  def setup
    @contract = JSON.parse(File.read(SOURCE))
  end

  def test_happy_path_has_additive_interfaces
    assert_equal "2.0.0-draft.1", @contract.dig("info", "version")
    assert_equal %w[get post put], @contract.fetch("paths").values.flat_map(&:keys).uniq.sort
    assert @contract.dig("components", "schemas", "OrganizationGrant")
  end

  def test_failure_no_live_dispatch_or_v1_collision
    assert_empty(@contract.fetch("paths").keys & JSON.parse(File.read(V1)).fetch("paths").keys)
    assert_equal "simulation", @contract.dig("components", "schemas", "OutreachPlan", "properties", "mode", "const")
    refute @contract.fetch("paths").keys.any? { |path| path.include?("send") }
  end

  def test_failure_worker_does_not_inherit_browser_authority
    operation = @contract.dig("paths", "/v2/worker/jobs/{job_id}", "get")
    assert_equal [{"workerPrincipal" => []}], operation.fetch("security")
    refute operation.fetch("security").any? { |scheme| scheme.key?("sessionCookie") }
  end
end
