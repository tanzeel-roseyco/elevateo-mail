# frozen_string_literal: true

require "json"
require "minitest/autorun"

# AIDEV-NOTE: This checkpoint is additive; advertised availability remains separate from specified wire shapes.
class CompletionContractTest < Minitest::Test
  ROOT = File.expand_path(__dir__)

  def setup
    @document = JSON.parse(File.read(File.join(ROOT, "completion.openapi.json")))
    @examples = JSON.parse(File.read(File.join(ROOT, "completion.examples.json")))
  end

  def test_happy_path_references_resolve
    walk(@document) do |value|
      next unless value.is_a?(Hash) && value.key?("$ref")
      file, pointer = value.fetch("$ref").split("#", 2)
      source = file.empty? ? @document : JSON.parse(File.read(File.expand_path(file, ROOT)))
      pointer.delete_prefix("/").split("/").each do |key|
        source = source.fetch(key.gsub("~1", "/").gsub("~0", "~"))
      end
      assert_kind_of Hash, source
    end
  end

  def test_grant_happy_path_is_bounded_and_never_sends
    schema = @document.dig("components", "schemas", "GrantRequest")
    assert_equal schema.fetch("required").sort, @examples.fetch("grant_request").keys.sort
    assert_equal %w[search read draft], schema.dig("properties", "scopes", "items", "enum")
    assert_equal 86400, schema.dig("properties", "expires_in_seconds", "maximum")
    assert_equal false, schema.fetch("additionalProperties")
    refute @document.fetch("paths").keys.any? { |path| path.match?(%r{/send(?:/|$)}) }
  end

  def test_failure_authority_does_not_come_from_message_content
    assert_equal true, @document.dig("components", "schemas", "Message", "properties", "untrusted_content", "const")
    %w[SearchRequest ReadRequest DraftRequest].each do |name|
      schema = @document.dig("components", "schemas", name)
      assert_includes schema.fetch("required"), "mailbox_id"
      assert_equal false, schema.fetch("additionalProperties")
      refute schema.fetch("properties").key?("scopes")
    end
    %w[search read draft].each do |name|
      assert_equal [{"connectorBearer" => []}], @document.dig("paths", "/v2/connector/#{name}", "post", "security")
    end
  end

  def test_failure_native_limits_are_explicit
    limits = @document.dig("x-local-agent-protocol", "limits")
    assert_equal "denied", limits.fetch("shell")
    assert_equal "denied", limits.fetch("filesystem")
    assert_equal 2, limits.fetch("max_concurrent_runs")
    assert_equal 300, @document.dig("components", "schemas", "AgentStart", "properties", "timeout_seconds", "maximum")
    assert_equal %w[output completed failed cancelled timed_out],
      @document.dig("components", "schemas", "AgentEvent", "properties", "type", "enum")
  end

  private

  def walk(value, &block)
    yield value
    case value
    when Hash then value.each_value { |child| walk(child, &block) }
    when Array then value.each { |child| walk(child, &block) }
    end
  end
end
