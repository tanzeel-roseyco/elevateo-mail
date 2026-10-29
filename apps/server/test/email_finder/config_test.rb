# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/email_finder/config"

class EmailFinderConfigTest < Minitest::Test
  def test_explicit_public_address_is_normalized
    config = Elevateo::EmailFinder::Config.new("ELEVATEO_FINDER_PUBLIC_IP" => "2606:4700:4700:0000:0000:0000:0000:1111")
    assert_equal "2606:4700:4700::1111", config.public_ip
  end

  def test_missing_address_remains_unavailable_to_startup
    assert_equal "", Elevateo::EmailFinder::Config.new({}).public_ip
    assert_equal "", Elevateo::EmailFinder::Config.new("ELEVATEO_FINDER_PUBLIC_IP" => "").public_ip
  end

  def test_invalid_address_is_rejected_with_environment_variable_name
    error = assert_raises(ArgumentError) do
      Elevateo::EmailFinder::Config.new("ELEVATEO_FINDER_PUBLIC_IP" => "not-an-address")
    end
    assert_equal "ELEVATEO_FINDER_PUBLIC_IP must be an IP address", error.message
  end
end
