# frozen_string_literal: true

require "json"
require "digest"
require "minitest/autorun"

# AIDEV-NOTE: These structural contract checks are Docker-only; they do not establish API or database acceptance.
class SendContractTest < Minitest::Test
  ROOT = File.expand_path("..", __dir__)
  DOCUMENT = JSON.parse(File.read(File.join(ROOT, "openapi.json")))
  PRESERVATION = JSON.parse(File.read(File.join(ROOT, "be03-preservation.json")))
  FIXTURES = JSON.parse(File.read(File.join(ROOT, "send-fixtures.json")))

  def sorted(value)
    case value
    when Hash then value.keys.sort.to_h { |key| [key, sorted(value.fetch(key))] }
    when Array then value.map { |item| sorted(item) }
    else value
    end
  end

  # AIDEV-NOTE: Pin immutable03ae keysets+seals independently; a manifest resealed from additive source must fail.
  def test_preservation_manifest_is_pinned_to_immutable_baseline
    assert_equal "03ae770c56271cd8236726bfd8fe63248e81283d", PRESERVATION.fetch("baseline_commit")
    assert_equal "65a5f926c661cb028e934e861892a995c2d9271853275546518b78588fa66597",
                 PRESERVATION.fetch("baseline_openapi_sha256")
    assert_equal "d3de289b10ed86f528a1b3b959d39ec00c5768a0d94296f4324146e85dabe01e",
                 Digest::SHA256.hexdigest(JSON.generate(sorted(PRESERVATION.fetch("frozen_sections"))))
  end

  def test_every_baseline_path_and_component_is_structurally_unchanged
    PRESERVATION.fetch("frozen_sections").each do |path, seal|
      section = path.split("/").reduce(DOCUMENT) { |part, key| part.fetch(key) }
      original = seal.fetch("keys").to_h { |key| [key, section.fetch(key)] }
      assert_equal seal.fetch("sha256"), Digest::SHA256.hexdigest(JSON.generate(sorted(original))), path
    end
    assert_equal PRESERVATION.fetch("baseline_fixtures_sha256"),
                 Digest::SHA256.file(File.join(ROOT, "fixtures.json")).hexdigest
  end

  def test_four_routes_have_closed_inputs_and_independent_send_errors
    routes = FIXTURES.fetch("routes")
    assert_equal 4, routes.size
    routes.each do |path, method|
      operation = DOCUMENT.fetch("paths").fetch(path).fetch(method)
      assert_equal 10_000, operation.fetch("x-deadline-ms")
      assert_equal 4096, operation.fetch("x-max-request-bytes") if method == "post"
      %w[400 401 404 409 429 500 503].each do |status|
        assert_equal "#/components/responses/Send#{status}", operation.fetch("responses").fetch(status).fetch("$ref")
      end
    end
    refute DOCUMENT.fetch("paths").keys.any? { |path| path.include?("approval-operations") }
  end

  # This deliberately small fixture walker covers only keywords used here, and fails on unsupported types.
  # It supplements the real pinned generator/client and HTTP validation; it is not a general JSON Schema engine.
  def valid?(schema, value)
    return schema if schema == true || schema == false
    if schema.key?("$ref")
      schema = schema.fetch("$ref").delete_prefix("#/").split("/").reduce(DOCUMENT) { |part, key| part.fetch(key) }
    end
    return false if schema.key?("const") && value != schema.fetch("const")
    return false if schema.key?("enum") && !schema.fetch("enum").include?(value)
    return false if schema.key?("anyOf") && !schema.fetch("anyOf").any? { |part| valid?(part, value) }
    return false if schema.key?("allOf") && !schema.fetch("allOf").all? { |part| valid?(part, value) }
    if schema.key?("if")
      branch = valid?(schema.fetch("if"), value) ? "then" : "else"
      return false if schema.key?(branch) && !valid?(schema.fetch(branch), value)
    end
    type = schema["type"]
    return false if type == "null" && !value.nil?
    return false if type == "boolean" && value != true && value != false
    return false if type == "integer" && !value.is_a?(Integer)
    return false if type == "string" && !value.is_a?(String)
    return false if type == "array" && !value.is_a?(Array)
    return false if type == "object" && !value.is_a?(Hash)
    raise "unsupported type #{type}" unless [nil, "null", "boolean", "integer", "string", "array", "object"].include?(type)
    if value.is_a?(Hash)
      return false unless (schema.fetch("required", []) - value.keys).empty?
      props = schema.fetch("properties", {})
      return false if schema["additionalProperties"] == false && (value.keys - props.keys).any?
      return false unless props.all? { |key, part| !value.key?(key) || valid?(part, value.fetch(key)) }
    elsif value.is_a?(Array)
      return false if schema.key?("maxItems") && value.size > schema.fetch("maxItems")
      return false if schema.key?("items") && !value.all? { |item| valid?(schema.fetch("items"), item) }
    elsif value.is_a?(String)
      return false if schema.key?("maxLength") && value.length > schema.fetch("maxLength")
      return false if schema.key?("minLength") && value.length < schema.fetch("minLength")
      return false if schema.key?("pattern") && !Regexp.new(schema.fetch("pattern")).match?(value)
    elsif value.is_a?(Integer)
      return false if schema.key?("minimum") && value < schema.fetch("minimum")
      return false if schema.key?("maximum") && value > schema.fetch("maximum")
    end
    true
  end

  def schema(name)
    DOCUMENT.fetch("components").fetch("schemas").fetch(name)
  end

  def test_synthetic_examples_conform_to_declared_send_shapes
    FIXTURES.fetch("examples").each do |example|
      assert valid?(schema(example.fetch("schema")), example.fetch("value")), example.fetch("name")
    end
  end

  def test_approval_rejects_zero_version_false_attestation_and_extra_authority
    input = FIXTURES.fetch("approval_input")
    assert valid?(schema("SendApprovalInput"), input)
    [{"expected_version" => 0}, {"expected_version" => 2_147_483_648},
     {"expected_version" => 1.0}, {"correspondence_confirmed" => false},
     {"review_digest" => "A" * 64}, {"epoch" => "server-only"},
     {"snapshot_bytes" => "client-content"}].each do |change|
      refute valid?(schema("SendApprovalInput"), input.merge(change)), change.keys.join(",")
    end
    refute valid?(schema("SendApprovalInput"), input.reject { |key, _| key == "operation_id" })
  end

  def test_review_retains_invalid_unsent_address_and_requires_readiness_digest_pair
    review = FIXTURES.fetch("examples").find { |item| item.fetch("name") == "not_ready" }.fetch("value")
    assert valid?(schema("SendReview"), review)
    refute valid?(schema("SendReview"), review.merge("review_digest" => "a" * 64))
    refute valid?(schema("SendReview"), review.merge("ready" => true))
    refute valid?(schema("SendReview"), review.merge("to" => review.fetch("to") * 101))
    refute valid?(schema("SendReview"), review.merge("attachments" => ["unsupported"]))
    refute valid?(schema("SendReview"), review.merge("simulated" => false))
  end

  def test_non_ready_review_keeps_absent_policy_and_multiple_issues_per_recipient
    review = FIXTURES.fetch("examples").find { |item| item.fetch("name") == "not_ready" }.fetch("value")
    recipients = Array.new(100) { { "display_name" => "\n", "address" => "invalid" } }
    issues = (0...100).flat_map do |index|
      [{ "code" => "recipient_invalid", "recipient_index" => index },
       { "code" => "header_invalid", "recipient_index" => index }]
    end
    checks = (0...100).map { |index| { "index" => index, "status" => "invalid" } }
    candidate = review.merge("policy_revision" => "0", "to" => recipients,
      "recipient_checks" => checks, "issues" => issues + [{ "code" => "purpose_unavailable", "recipient_index" => nil }])
    assert valid?(schema("SendReview"), candidate)
    refute valid?(schema("SendReview"), candidate.merge("policy_revision" => "-1"))
    refute valid?(schema("SendReview"), candidate.merge("issues" => issues * 2))
  end

  def test_status_cannot_claim_delivery_or_expose_snapshot
    status = FIXTURES.fetch("examples").find { |item| item.fetch("name") == "queued" }.fetch("value")
    assert valid?(schema("SendStatus"), status)
    %w[delivered retrying reset].each { |state| refute valid?(schema("SendStatus"), status.merge("state" => state)) }
    refute valid?(schema("SendStatus"), status.merge("snapshot_bytes" => "private"))
    refute valid?(schema("SendStatus"), status.merge("attempts" => 4))
    refute valid?(schema("SendStatus"), status.merge("hold_reason" => "provider-secret"))
  end
end
