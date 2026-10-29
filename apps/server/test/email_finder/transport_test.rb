# frozen_string_literal: true

require "minitest/autorun"
require "stringio"
require_relative "../../lib/elevateo/write_input"

# AIDEV-NOTE: CSV transport needs escaping headroom without changing any other endpoint's explicit request bound.
class EmailFinderTransportTest < Minitest::Test
  def test_json_escaped_csv_fits_opt_in_transport_bound
    body = JSON.generate("csv" => "\"" * 2_097_152)
    assert_equal body, Elevateo::WriteInput.read(StringIO.new(body), maximum: 16_777_216)
  end

  def test_existing_small_bound_still_rejects_larger_body
    assert_raises(Elevateo::CollaborationError) do
      Elevateo::WriteInput.read(StringIO.new("x" * 8193), maximum: 8192)
    end
  end

  def test_transport_cannot_disable_absolute_limit
    assert_raises(ArgumentError) do
      Elevateo::WriteInput.read(StringIO.new(""), maximum: 16_777_217)
    end
  end
end
