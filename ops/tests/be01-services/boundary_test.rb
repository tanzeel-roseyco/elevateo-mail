# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require_relative "state"
require_relative "storage"

# AIDEV-NOTE: Socket-free boundary regressions supplement, never replace, real Auth/Storage/Postgres fixtures.
class ServiceBoundaryTest < Minitest::Test
  def data
    { "nonce" => "a" * 32, "password" => "b" * 64,
      "org" => "10000000-0000-0000-0000-000000000001", "mailbox" => "30000000-0000-0000-0000-000000000001" }
  end

  def test_valid_state_and_mailbox_bound_locator
    assert_equal data, Be01Services::State.validate(data)
    storage = Be01Services::Storage.new("synthetic", "be01-#{'a' * 32}", data.fetch("mailbox"))
    assert_equal "#{data.fetch('mailbox')}/proof.bin", storage.path
  end

  def test_state_rejects_external_recipient_injection
    invalid = data.merge("nonce" => "user@example.com")
    assert_raises(Be01Services::Failure) { Be01Services::State.validate(invalid) }
  end

  def test_state_rejects_bad_uuid_and_empty_password
    assert_raises(Be01Services::Failure) { Be01Services::State.validate(data.merge("org" => "' OR true")) }
    assert_raises(Be01Services::Failure) { Be01Services::State.validate(data.merge("password" => "")) }
  end

  def test_repeated_state_write_does_not_overwrite
    Dir.mktmpdir do |directory|
      path = File.join(directory, "state.json")
      Be01Services::State.write_once(path, data)
      assert_raises(Errno::EEXIST) { Be01Services::State.write_once(path, {}) }
      assert_equal data, Be01Services::State.read(path)
    end
  end

  def test_symlink_and_world_readable_state_rejected
    Dir.mktmpdir do |directory|
      path = File.join(directory, "state.json")
      Be01Services::State.write_once(path, data)
      link = File.join(directory, "link.json")
      File.symlink(path, link)
      assert_raises(Errno::ELOOP) { Be01Services::State.read(link) }
      File.chmod(0o644, path)
      assert_raises(Be01Services::Failure) { Be01Services::State.read(path) }
    end
  end

  def test_foreign_locator_rejected_before_http
    storage = Be01Services::Storage.new("synthetic", "be01-#{'a' * 32}", data.fetch("mailbox"))
    assert_raises(Be01Services::Failure) { storage.read("other/proof.bin") }
    assert_raises(Be01Services::Failure) { storage.read(nil) }
  end

  def test_external_host_and_request_target_rejected_before_socket
    assert_raises(KeyError) { Be01Services::HTTP.new("example.com") }
    http = Be01Services::HTTP.new("auth")
    assert_raises(Be01Services::Failure) { http.request("GET", "//example.com/token") }
    assert_raises(Be01Services::Failure) { http.request("GET", "/user\r\nInjected: value") }
  end
end
