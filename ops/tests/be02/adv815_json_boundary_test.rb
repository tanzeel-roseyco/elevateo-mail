# frozen_string_literal: true

require "minitest/autorun"
require_relative "http_support"

# AIDEV-NOTE: Exercise the real HTTP decoder without network or token-bearing failure messages.
class Adv815JsonBoundaryTest < Minitest::Test
  def decode(body)
    response = Net::HTTPOK.new("1.1", "200", "OK")
    response.instance_variable_set(:@read, true)
    response.body = body
    Be02Http.new.json(response)
  end

  def test_nested_json_is_preserved
    assert_equal({ "actor" => { "id" => "fixture" }, "values" => [nil, 1, false] },
                 decode('{"actor":{"id":"fixture"},"values":[null,1,false]}'))
  end

  def test_non_objects_are_rejected_without_payload
    ["null", "[]", "1", '"private-value"'].each do |body|
      error = assert_raises(RuntimeError) { decode(body) }
      assert_equal "fixture expected JSON object", error.message
    end
  end

  def test_malformed_json_is_rejected_without_payload
    error = assert_raises(RuntimeError) { decode("private-value") }
    assert_equal "fixture received invalid JSON", error.message
  end
end
