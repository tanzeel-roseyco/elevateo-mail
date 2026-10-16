# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "timeout"
require "minitest/mock"
require_relative "../../lib/elevateo/attachments_worker_storage"
require_relative "../../lib/elevateo/inbound/worker_config"
require_relative "../inbound/worker_environment"

class AttachmentWorkerStorageTest < Minitest::Test
  include InboundWorkerEnvironment
  TOKEN = ("disposable." + "x" * 48 + ".signature").freeze

  def setup
    @directory = Dir.mktmpdir("private-worker-storage-")
    @path = File.join(@directory, "token")
    File.write(@path, TOKEN, perm: 0o600)
    @env = { "ELEVATEO_INBOUND_STORAGE_TOKEN_PATH" => @path,
             "ELEVATEO_INBOUND_STORAGE_BUCKET" => "be02-attachments" }
  end

  def teardown = FileUtils.remove_entry(@directory)

  def load_storage(change = {}) = Elevateo::Attachments::WorkerStorage.load!(@env.merge(change))

  def assert_unavailable(change = {})
    error = assert_raises(ArgumentError) { load_storage(change) }
    assert_equal "inbound private storage configuration unavailable", error.message
    assert_nil error.cause
    refute_includes error.full_message, @path
    refute_includes error.full_message, TOKEN
  end

  def test_optional_profile_and_read_once_redacted_adapter
    assert_nil Elevateo::Attachments::WorkerStorage.load!({})
    adapter = load_storage
    assert_instance_of Elevateo::Attachments::PrivateStorage, adapter
    File.unlink(@path)
    [adapter.inspect, adapter.to_s].each do |text|
      assert_equal "#<Elevateo::Attachments::PrivateStorage redacted>", text
      refute_includes text, TOKEN
    end
  end

  def test_worker_config_injects_storage_but_keeps_api_and_live_token_forbidden
    settings = Elevateo::Inbound::WorkerConfig.load!(worker_environment.merge(@env))
    assert_instance_of Elevateo::Attachments::PrivateStorage, settings.attachment_storage
    assert_nil Elevateo::Inbound::WorkerConfig.load!(worker_environment).attachment_storage
    assert_raises(Elevateo::ConfigError) do
      Elevateo::Inbound::WorkerConfig.load!(worker_environment.merge(@env).merge("ELEVATEO_PROCESS" => "api"))
    end
    assert_raises(Elevateo::ConfigError) do
      Elevateo::Inbound::WorkerConfig.load!(worker_environment.merge(@env).merge(
        "ELEVATEO_ATTACHMENT_STORAGE_SERVICE_TOKEN" => TOKEN))
    end
  end

  def test_partial_blank_or_invalid_settings_fail_closed
    [nil, "", "/", "relative/token", "/private\0token", "/" + "s" * 4096].each do |value|
      assert_unavailable("ELEVATEO_INBOUND_STORAGE_TOKEN_PATH" => value)
    end
    [nil, "", "a", "a" * 64, "BadBucket", "../private", "test bucket"].each do |value|
      assert_unavailable("ELEVATEO_INBOUND_STORAGE_BUCKET" => value)
    end
    assert_instance_of Elevateo::Attachments::PrivateStorage,
      load_storage("ELEVATEO_INBOUND_STORAGE_BUCKET" => "a" * 63)
  end

  def test_token_size_and_bearer_character_boundaries
    ["", "a" * 31, "a" * 4097, TOKEN + "\n", TOKEN + "\r", TOKEN + "\0", TOKEN + " ",
      TOKEN + "\xff".b].each do |bytes|
      File.binwrite(@path, bytes)
      assert_unavailable
    end
    [32, 4096].each do |size|
      File.binwrite(@path, "x" * size)
      assert_instance_of Elevateo::Attachments::PrivateStorage, load_storage
    end
  end

  def test_fifo_is_rejected_without_waiting_for_a_writer
    fifo = File.join(@directory, "fifo")
    assert system("mkfifo", "--", fifo)
    Timeout.timeout(2) { assert_unavailable("ELEVATEO_INBOUND_STORAGE_TOKEN_PATH" => fifo) }
  end

  def test_unrelated_owner_is_rejected
    File.open(@path) do |file|
      stat = file.stat
      stat.define_singleton_method(:uid) { Process.uid == 65_534 ? 65_533 : 65_534 }
      file.define_singleton_method(:stat) { stat }
      File.stub(:open, ->(*_args, &block) { block.call(file) }) { assert_unavailable }
    end
  end

  def test_nonprivate_modes_missing_directory_symlink_and_hardlink_are_rejected
    [0o644, 0o400, 0o4600].each do |mode|
      File.chmod(mode, @path)
      assert_unavailable
    end
    File.chmod(0o600, @path)
    assert_unavailable("ELEVATEO_INBOUND_STORAGE_TOKEN_PATH" => @directory)
    assert_unavailable("ELEVATEO_INBOUND_STORAGE_TOKEN_PATH" => File.join(@directory, "missing"))
    linked = File.join(@directory, "linked")
    File.symlink(@path, linked)
    assert_unavailable("ELEVATEO_INBOUND_STORAGE_TOKEN_PATH" => linked)
    File.unlink(linked)
    File.link(@path, linked)
    assert_unavailable
    assert_unavailable("ELEVATEO_INBOUND_STORAGE_TOKEN_PATH" => linked)
  end
end
