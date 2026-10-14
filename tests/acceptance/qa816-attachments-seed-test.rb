# frozen_string_literal: true

require "minitest/autorun"
require "securerandom"
require_relative "qa816-attachments-seed"

class Qa816AttachmentsSeedTest < Minitest::Test
  def setup
    @previous_cookie = ENV["QA816_READER_COOKIE"]
    ENV["QA816_READER_COOKIE"] = "session=synthetic_private_cookie_123456789"
    @actor = SecureRandom.uuid
    @scope = { mailbox_id: SecureRandom.uuid, thread_id: SecureRandom.uuid, message_id: SecureRandom.uuid }
    @clean = { id: SecureRandom.uuid }
    @base = { "actors" => { "reader" => { "user_id" => @actor } } }
    @session = { actor: { id: @actor }, context_id: "a" * 20, authorization_version: "b" * 20 }
    @headers = { "cache-control" => "no-store", "x-content-type-options" => "nosniff",
      "content-type" => "application/octet-stream", "content-disposition" => 'attachment; filename="attachment"',
      "content-length" => Qa816AttachmentsSeed::BYTES.bytesize.to_s }
  end

  def teardown
    ENV["QA816_READER_COOKIE"] = @previous_cookie
  end

  def test_authorized_read_requires_current_reader_identity_then_exact_safe_bytes
    calls = []
    fetch = lambda do |path, cookie, headers = {}|
      calls << [path, cookie, headers]
      path == "/v1/session" ? ["200", {}, JSON.generate(@session)] :
        ["200", @headers, Qa816AttachmentsSeed::BYTES]
    end
    Qa816AttachmentsSeed.verify_authorized_bytes(@base, @scope, @clean, fetch: fetch)
    assert_equal 2, calls.length
    assert_equal @clean.fetch(:id), calls.last.first.split("/")[-2]
    assert_equal "a" * 20, calls.last.last.fetch("X-Session-Context")
  end

  def test_foreign_actor_cannot_reach_attachment_request
    calls = []
    fetch = lambda do |path, _cookie, _headers = {}|
      calls << path
      ["200", {}, JSON.generate(@session.merge(actor: { id: SecureRandom.uuid }))]
    end
    assert_raises(RuntimeError) { Qa816AttachmentsSeed.verify_authorized_bytes(@base, @scope, @clean, fetch: fetch) }
    assert_equal ["/v1/session"], calls
  end

  def test_wrong_private_bytes_block_sidecar_admission
    fetch = lambda do |path, _cookie, _headers = {}|
      path == "/v1/session" ? ["200", {}, JSON.generate(@session)] : ["200", @headers, "wrong"]
    end
    assert_raises(RuntimeError) { Qa816AttachmentsSeed.verify_authorized_bytes(@base, @scope, @clean, fetch: fetch) }
  end
end
