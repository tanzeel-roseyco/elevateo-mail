# frozen_string_literal: true

require "minitest/autorun"
require "stringio"
require_relative "../../lib/elevateo/write_response"

class WriteBoundaryInputTest < Minitest::Test
  Input = Elevateo::WriteInput

  def test_closed_json_and_unicode_scalar_limits
    assert_equal({ "value" => "é😀" }, Input.body('{"value":"é😀"}', required: ["value"]))
    assert_equal "é😀", Input.text("é😀", maximum: 2)
    invalid { Input.text("é😀x", maximum: 2) }
    assert_equal 3, Input.integer(3.0, minimum: 1, maximum: 5)
    invalid { Input.integer(3.2, minimum: 1, maximum: 5) }
    invalid { Input.integer("3", minimum: 1, maximum: 5) }
    invalid { Input.integer(6, minimum: 1, maximum: 5) }
    invalid { Input.body('{"value":null,"extra":true}', required: ["value"]) }
    invalid { Input.body('{}', required: ["value"]) }
  end

  def test_duplicate_keys_at_any_depth_and_illegal_scalars
    ['{"x":1,"x":2}', '{"x":{"a":1,"a":2}}', '{"x":[{"a":1,"a":2}]}',
      '{"x":"\u0000"}', '{"x":"\ud800"}', '{"x":"\udfff"}', '[]', '{"x":NaN}',
      "{\"x\":\"\xFF\"}".b].each { |raw| invalid { Input.object(raw) } }
    assert_equal({ "x" => "😀" }, Input.object('{"x":"\ud83d\ude00"}'))
  end

  def test_decoded_query_keys_are_unique_closed_and_decode_once
    assert_equal({ "cursor" => "%2F" }, Input.query("cursor=%252F", allowed: ["cursor"]))
    ["cursor=x&cursor=y", "cursor=x&%63ursor=y", "cursor[]=x", "other=x", "cursor=%FF",
      "cursor=%", "cursor=%0Z", "cursor=%00", "cursor=x&", "=x"].each do |raw|
      invalid { Input.query(raw, allowed: ["cursor"]) }
    end
  end

  def test_exact_origin_media_type_and_encoding
    base = { origin: "https://app.test", expected_origin: "https://app.test",
      content_type: 'application/json; charset="UTF-8"', content_encoding: "identity", body: true }
    Input.transport!(**base)
    ["null", "https://app.test/", "https://app.test.evil", "https://app.test:443"].each do |origin|
      invalid { Input.transport!(**base.merge(origin: origin)) }
    end
    ["text/json", "application/json; charset=iso-8859-1", "application/json; charset=UTF-8; x=y", nil].each do |type|
      invalid { Input.transport!(**base.merge(content_type: type)) }
    end
    invalid { Input.transport!(**base.merge(content_encoding: "gzip")) }
    Input.transport!(**base.merge(body: false, content_type: nil))
  end

  # AIDEV-NOTE: StringIO splits UTF-8 at byte boundaries, matching Rack IO rather than character slicing.
  class ShortStream < StringIO
    def read(maximum)
      super([maximum, 2].min)
    end
  end

  def test_actual_byte_bound_and_empty_stream
    assert_equal "abcd", Input.read(ShortStream.new(+"abcd"), maximum: 4)
    invalid { Input.read(ShortStream.new(+"abcde"), maximum: 4) }
    assert_equal "", Input.read(StringIO.new(""), maximum: 0)
    invalid { Input.read(StringIO.new(" "), maximum: 0) }
  end

  def test_multibyte_short_reads_and_exact_byte_cap
    scalar = "\u{1F600}"
    stream = ShortStream.new(scalar)
    assert_equal scalar.b.byteslice(0, 1), stream.read(1).b
    assert_equal scalar.b.byteslice(1, 2), stream.read(2).b
    assert_equal scalar.b.byteslice(3, 1), stream.read(2).b
    assert_nil stream.read(2)
    assert_equal scalar, Input.read(ShortStream.new(scalar), maximum: scalar.bytesize)
    invalid { Input.read(ShortStream.new(scalar + "x"), maximum: scalar.bytesize) }
    raw = JSON.generate({ "value" => "\u00e9#{scalar}" })
    assert_equal({ "value" => "\u00e9#{scalar}" },
      Input.body(Input.read(ShortStream.new(raw), maximum: raw.bytesize), required: ["value"]))
  end

  def test_exact_json_mathematical_integer_versions
    { "0" => 0, "-0.0" => 0, "0e-400" => 0, "1.0" => 1, "1e0" => 1,
      "10e-1" => 1, "2147483647.0" => 2_147_483_647, "2147483647e0" => 2_147_483_647 }.each do |token, expected|
      value = Input.object('{"version":' + token + '}').fetch("version")
      normalized = Input.integer(value, minimum: 0, maximum: 2_147_483_647)
      # AIDEV-NOTE: Numeric equality alone hides BigDecimal values that callers cannot bind as Integer versions.
      assert_instance_of Integer, normalized
      assert_equal expected, normalized
    end
    %w[0.99999999999999999 1e-400 -1e-400 2147483647.0000001 -1 2147483648
      1e400 1e-999999999999999999999999 true null].push('"1"').each do |token|
      invalid do
        Input.integer(Input.object('{"version":' + token + '}').fetch("version"),
          minimum: 0, maximum: 2_147_483_647)
      end
    end
    safe_max = 9_007_199_254_740_991
    normalized = Input.integer(Input.object('{"n":9007199254740991.0}').fetch("n"),
      minimum: 0, maximum: safe_max)
    assert_instance_of Integer, normalized
    assert_equal safe_max, normalized
    %w[9007199254740991.0000001 9007199254740992].each do |token|
      invalid { Input.integer(Input.object('{"n":' + token + '}').fetch("n"), minimum: 0, maximum: safe_max) }
    end
    invalid { Input.object('{"x":' + ('[' * 16) + '0' + (']' * 16) + '}') }
    invalid { Input.object('{"x":1,"\u0078":2}') }
  end

  def test_extreme_decimal_true_zero_and_signed_nonzero
    %w[0e-999999999999999999999999 -0.0e-999999999999999999999999].each do |token|
      assert_equal 0, Input.integer(Input.object('{"n":' + token + '}').fetch("n"), minimum: 0, maximum: 1)
    end
    %w[1e-999999999999999999999999 -1e-999999999999999999999999].each do |token|
      invalid { Input.object('{"n":' + token + '}') }
    end
  end

  def test_preserves_exception_modes_on_success_and_parse_failures
    # AIDEV-NOTE: Restore ambient decimal modes even when this regression fails, so later tests stay isolated.
    BigDecimal.save_exception_mode do
      [false, true].each do |underflow_enabled|
        BigDecimal.mode(BigDecimal::EXCEPTION_UNDERFLOW, underflow_enabled)
        baseline = BigDecimal.mode(BigDecimal::EXCEPTION_ALL)
        assert_equal({ "n" => BigDecimal("1.0") }, Input.object('{"n":1.0}'))
        assert_equal baseline, BigDecimal.mode(BigDecimal::EXCEPTION_ALL)
        ['{"n":', '{"n":1,"n":2}', '{"n":1e-999999999999999999999999}'].each do |raw|
          invalid { Input.object(raw) }
          assert_equal baseline, BigDecimal.mode(BigDecimal::EXCEPTION_ALL)
        end
      end
    end
  end

  def test_serialization_fails_closed_before_commit
    response = Elevateo::WriteResponse.new(json: '{"ok":true}', status: 201)
    assert_same response, response.verify!(budget: 11)
    ['{"x":1,"x":2}', '[1]', '{"x":"\u0000"}', 'invalid'].each do |json|
      error = assert_raises(Elevateo::CollaborationError) do
        Elevateo::WriteResponse.new(json: json, status: 200).verify!(budget: 100)
      end
      assert_equal "internal_error", error.code
    end
    assert_raises(Elevateo::CollaborationError) { response.verify!(budget: 10) }
  end

  def test_error_envelope_and_bounded_request_id
    error = Elevateo::CollaborationError.new("not_available")
    assert_equal 404, error.status
    assert_equal "This item is unavailable.", error.body("request").fetch("message")
    [nil, "", "😀" * 128, "\xFF".b].each do |id|
      bounded = error.body(id).fetch("request_id")
      assert bounded.valid_encoding?
      assert bounded.bytesize.between?(1, 128)
    end
  end

  private

  def invalid
    error = assert_raises(Elevateo::CollaborationError) { yield }
    assert_equal "request_invalid", error.code
  end
end
