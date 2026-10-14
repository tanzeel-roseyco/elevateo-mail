# frozen_string_literal: true

require "minitest/autorun"
require_relative "http_fixture"

# AIDEV-NOTE: These offline checks prove unsafe environments reject before any Auth/DB I/O; not runtime acceptance.
class Be03HTTPBoundaryTest < Minitest::Test
  def setup
    @before = ENV.to_h
    ENV.update("BE02_ADMIN_DATABASE_URL" => "postgres://supabase_admin:synthetic@db:5432/postgres",
      "ELEVATEO_MODE" => "local", "ELEVATEO_OUTBOUND_HOLD" => "true",
      "ELEVATEO_SEND_API_ENABLED" => "true", "ELEVATEO_BROWSER_ORIGIN" => "http://api:3000")
  end

  def teardown
    ENV.replace(@before)
  end

  def test_external_database_and_query_reject_before_io
    ["postgres://supabase_admin:synthetic@external.invalid:5432/postgres",
     "postgres://supabase_admin:synthetic@db:5432/postgres?host=external.invalid"].each do |url|
      ENV["BE02_ADMIN_DATABASE_URL"] = url
      error = assert_raises(Be03HTTP::Failure) { Be03HTTP::Fixture.new }
      assert_equal "isolated_database_required", error.message
      refute_includes error.message, "synthetic"
    end
  end

  def test_live_or_unheld_profile_rejects_before_io
    %w[ELEVATEO_MODE ELEVATEO_OUTBOUND_HOLD ELEVATEO_SEND_API_ENABLED ELEVATEO_BROWSER_ORIGIN].each do |name|
      before = ENV.fetch(name)
      ENV[name] = "unsafe"
      error = assert_raises(Be03HTTP::Failure) { Be03HTTP::Fixture.new }
      assert_equal "isolated_api_required", error.message
      ENV[name] = before
    end
  end

  def test_valid_isolated_profile_constructs_without_network
    fixture = Be03HTTP::Fixture.new
    assert_equal 2, fixture.assertions
    assert_instance_of Be02Http, fixture.client
    assert_instance_of Be02Fixture, fixture.seed
  end
end
