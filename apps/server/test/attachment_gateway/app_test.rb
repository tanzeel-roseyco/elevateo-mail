# frozen_string_literal: true

require "minitest/autorun"
require "stringio"
require_relative "../../attachment_gateway/app"

class AttachmentGatewayAppTest < Minitest::Test
  KEY = "k" * 32
  BYTES = "private fixture bytes".b
  ID = "11111111-1111-1111-1111-111111111111"

  class Authority
    attr_reader :checks
    attr_accessor :revoked, :held

    def initialize(expected_box:, metadata:)
      @expected_box, @metadata, @checks, @revoked, @held = expected_box, metadata, 0, false, false
    end

    def clean_binding(claim)
      @checks += 1
      raise Elevateo::AttachmentGateway::Denied if @revoked || @held || claim.fetch("mailbox_id") != @expected_box
      @metadata.dup
    end
  end

  class Storage
    attr_reader :reads

    def initialize(bytes: BYTES, &during_read)
      @bytes, @during_read, @reads = bytes, during_read, 0
    end

    def get(key)
      raise "unexpected object key" unless key == "quarantine/#{ID}/#{ID}"
      @reads += 1
      @during_read&.call
      @bytes
    end
  end

  def setup
    @metadata = { "storage_key" => "quarantine/#{ID}/#{ID}", "byte_size" => BYTES.bytesize.to_s,
                  "sha256" => Digest::SHA256.hexdigest(BYTES) }
    @authority = Authority.new(expected_box: ID, metadata: @metadata)
    @storage = Storage.new
    @app = Elevateo::AttachmentGateway::App.new(key: KEY, authority: @authority, storage: @storage,
      clock: -> { 1000 })
  end

  def claim
    values = { "operation" => "attachment.read", "audience" => "attachment_gateway.v1",
               "attachment_id" => ID, "organization_id" => ID, "mailbox_id" => ID,
               "thread_id" => ID, "message_id" => ID, "session_digest" => "d" * 64,
               "expected_user_id" => ID, "expected_auth_session_id" => ID,
               "context_id" => ID, "authorization_version" => "a" * 43,
               "context_uuid" => ID, "authorization_generation" => 0, "expires_at" => 1020,
               "request_id" => ID }
    Elevateo::AttachmentGateway::Protocol::KEYS.to_h { |key| [key, values.fetch(key)] }
  end

  def request(fields = {}, sign: true)
    body = JSON.generate(claim.merge(fields))
    signature = OpenSSL::HMAC.hexdigest("SHA256", KEY,
      Elevateo::AttachmentGateway::Protocol::PREFIX + body)
    { "REQUEST_METHOD" => "POST", "PATH_INFO" => "/internal/attachments/read",
      "CONTENT_TYPE" => "application/json", "CONTENT_LENGTH" => body.bytesize.to_s,
      "rack.input" => StringIO.new(body), "HTTP_X_ELEVATEO_ATTACHMENT_SIGNATURE" => sign ? signature : "0" * 64 }
  end

  def test_clean_authorized_download_rechecks_before_release
    status, headers, body = @app.call(request)
    assert_equal 200, status
    assert_equal [BYTES], body
    assert_equal "no-store", headers.fetch("Cache-Control")
    assert_equal "nosniff", headers.fetch("X-Content-Type-Options")
    assert_equal 2, @authority.checks
    assert_equal 1, @storage.reads
  end

  def test_forged_signature_denies_without_database_or_storage
    assert_equal 404, @app.call(request(sign: false)).first
    assert_equal 0, @authority.checks
    assert_equal 0, @storage.reads
  end

  def test_expired_or_range_request_denies_without_database_or_storage
    assert_equal 404, @app.call(request("expires_at" => 999)).first
    ranged = request
    ranged["HTTP_RANGE"] = "bytes=0-3"
    assert_equal 404, @app.call(ranged).first
    assert_equal 0, @authority.checks
    assert_equal 0, @storage.reads
  end

  def test_signed_wrong_mailbox_scope_denies_before_storage
    assert_equal 404, @app.call(request("mailbox_id" => "22222222-2222-2222-2222-222222222222")).first
    assert_equal 1, @authority.checks
    assert_equal 0, @storage.reads
  end

  def test_revocation_during_storage_io_discards_buffered_bytes
    @storage = Storage.new { @authority.revoked = true }
    @app = Elevateo::AttachmentGateway::App.new(key: KEY, authority: @authority, storage: @storage,
      clock: -> { 1000 })
    status, _headers, body = @app.call(request)
    assert_equal [404, []], [status, body]
    assert_equal 2, @authority.checks
  end

  def test_checksum_mismatch_and_held_state_release_nothing
    @storage = Storage.new(bytes: "tampered")
    @app = Elevateo::AttachmentGateway::App.new(key: KEY, authority: @authority, storage: @storage,
      clock: -> { 1000 })
    assert_equal [503, []], @app.call(request).values_at(0, 2)
    assert_equal 1, @authority.checks
    @authority.held = true
    assert_equal 404, @app.call(request).first
    assert_equal 1, @storage.reads
  end

  def test_storage_timeout_releases_nothing
    @storage = Storage.new { raise Timeout::Error }
    @app = Elevateo::AttachmentGateway::App.new(key: KEY, authority: @authority, storage: @storage,
      clock: -> { 1000 })
    assert_equal [503, []], @app.call(request).values_at(0, 2)
    assert_equal 1, @authority.checks
  end
end
