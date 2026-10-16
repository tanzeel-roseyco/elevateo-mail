# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require_relative "../../lib/elevateo/attachments_scan_config"
require_relative "../inbound/worker_environment"

class AttachmentScanConfigTest < Minitest::Test
  include InboundWorkerEnvironment

  def setup
    @directory = Dir.mktmpdir("scanner-config-")
    @path = File.join(@directory, "token")
    File.write(@path, "disposable." + "x" * 48, perm: 0o600)
    @env = worker_environment.reject { |key, _value| key.start_with?("ELEVATEO_IMAP_") }.merge(
      "ELEVATEO_SCAN_PROFILE" => "private-storage-test-v1", "ELEVATEO_SCAN_STORAGE_TOKEN_PATH" => @path,
      "ELEVATEO_SCAN_STORAGE_BUCKET" => "be02-attachments")
  end

  def teardown = FileUtils.remove_entry(@directory)

  def test_private_file_profile_needs_no_imap_configuration_and_redacts_values
    config = Elevateo::Attachments::ScanConfig.load!(@env)
    assert_instance_of Elevateo::Attachments::PrivateStorage, config.storage
    assert_equal "worker", config.runtime.process
    assert config.frozen?
    assert_equal "#<Elevateo::Attachments::ScanConfig redacted>", config.inspect
    assert_equal config.inspect, config.to_s
    File.unlink(@path)
    assert_instance_of Elevateo::Attachments::PrivateStorage, config.storage
  end

  def test_missing_wrong_profile_role_or_storage_is_rejected
    [{ "ELEVATEO_SCAN_PROFILE" => nil }, { "ELEVATEO_SCAN_PROFILE" => "production" },
      { "ELEVATEO_PROCESS" => "api" }, { "ELEVATEO_OUTBOUND_HOLD" => "false" },
      { "ELEVATEO_DB_ROLE" => "elevateo_api", "API_DB_PASSWORD" => "disposable" },
      { "ELEVATEO_SCAN_STORAGE_TOKEN_PATH" => nil, "ELEVATEO_SCAN_STORAGE_BUCKET" => nil }].each do |change|
      assert_raises(Elevateo::ConfigError) { Elevateo::Attachments::ScanConfig.load!(@env.merge(change)) }
    end
    [{ "ELEVATEO_SCAN_STORAGE_TOKEN_PATH" => "/missing" }, { "ELEVATEO_SCAN_STORAGE_BUCKET" => "public bucket" }].each do |change|
      assert_raises(ArgumentError) { Elevateo::Attachments::ScanConfig.load!(@env.merge(change)) }
    end
  end
end
