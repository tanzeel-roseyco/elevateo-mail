# frozen_string_literal: true

require "minitest/autorun"
require "minitest/mock"
require_relative "../../lib/elevateo/attachments_storage"

class PrivateAttachmentStorageTest < Minitest::Test
  KEY = "quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222"
  ERROR = Elevateo::Attachments::PrivateStorage::Unavailable

  # AIDEV-NOTE: Forbid buffered access and record consumed chunks to prove early refusal at the HTTP boundary.
  class Response
    attr_reader :code, :reads
    def initialize(code: "200", chunks: ['{"public":false}'])
      @code, @chunks, @reads = code, chunks, 0
    end
    def body = raise "buffered body access forbidden"
    def read_body
      @chunks.each do |chunk|
        @reads += 1
        yield chunk
      end
    end
  end

  class Exchange
    attr_accessor :open_timeout, :read_timeout, :write_timeout, :max_retries, :ignore_eof
    attr_reader :paths
    def initialize(bucket:, object:)
      @bucket, @object, @paths = bucket, object, []
    end
    def start = yield self
    def request(request)
      @paths << request.path
      response = request.path.start_with?("/bucket/") ? @bucket : @object
      raise response if response.is_a?(Exception)
      yield response
    end
  end

  def setup
    @adapter = Elevateo::Attachments::PrivateStorage.new(base_url: "http://storage:5000",
      bucket: "inbox-private", service_token: "x" * 32, process: "attachment_gateway")
  end

  def with_exchange(bucket:, object: Response.new(chunks: ["bytes"]))
    exchange = Exchange.new(bucket: bucket, object: object)
    Net::HTTP.stub(:new, ->(*_args) { exchange }) { yield exchange }
  end

  def test_private_bucket_and_exact_limit_metadata_allow_exact_object_bytes
    ['{"public":false}', '{"public":false}' + " " * (4096 - 16)].each do |json|
      with_exchange(bucket: Response.new(chunks: [json])) do |exchange|
        assert_equal "bytes", @adapter.get(KEY)
        assert_equal ["/bucket/inbox-private", "/object/inbox-private/#{KEY}"], exchange.paths
        assert_equal 0, exchange.max_retries
      end
    end
  end

  def test_draft_keys_are_readable_but_not_writable_through_inbox_adapter
    key = KEY.sub("quarantine/", "drafts/")
    with_exchange(bucket: Response.new) do
      assert_equal "bytes", @adapter.get(key)
    end
    assert_raises(ArgumentError) { @adapter.put(key, "bytes", content_type: "application/octet-stream") }
    assert_raises(ArgumentError) { @adapter.delete(key) }
    assert_raises(ArgumentError) { @adapter.get(key + "/../secret") }
  end

  def test_public_missing_malformed_and_nonobject_metadata_never_reach_object
    ['{"public":true}', '{"public":"false"}', '{}', '[]', 'null', 'false', '0', '"text"', '{', ''].each do |json|
      with_exchange(bucket: Response.new(chunks: [json])) do |exchange|
        error = assert_raises(ERROR) { @adapter.get(KEY) }
        assert_equal "private bucket unavailable", error.message
        assert_equal ["/bucket/inbox-private"], exchange.paths
      end
    end
  end

  def test_bucket_status_is_rejected_before_streaming
    bucket = Response.new(code: "403")
    with_exchange(bucket: bucket) do |exchange|
      assert_raises(ERROR) { @adapter.get(KEY) }
      assert_equal 0, bucket.reads
      assert_equal ["/bucket/inbox-private"], exchange.paths
    end
  end

  def test_metadata_overflow_stops_consumption_immediately
    [["x" * 4097, "unread"], ["x" * 4096, "y", "unread"]].each do |chunks|
      bucket = Response.new(chunks: chunks)
      with_exchange(bucket: bucket) do |exchange|
        assert_raises(ERROR) { @adapter.get(KEY) }
        assert_equal chunks.length - 1, bucket.reads
        assert_equal ["/bucket/inbox-private"], exchange.paths
      end
    end
  end

  def test_transport_failures_have_fixed_errors_at_both_boundaries
    [SocketError, Socket::ResolutionError, IOError, Errno::ECONNRESET, Timeout::Error,
      Net::HTTPBadResponse, Net::HTTPHeaderSyntaxError].each do |kind|
      with_exchange(bucket: kind.new("private upstream detail")) do |exchange|
        error = assert_raises(ERROR) { @adapter.get(KEY) }
        assert_equal "private bucket unavailable", error.message
        assert_equal ["/bucket/inbox-private"], exchange.paths
      end
      with_exchange(bucket: Response.new, object: kind.new("private upstream detail")) do
        error = assert_raises(ERROR) { @adapter.get(KEY) }
        assert_equal "private object unavailable", error.message
      end
    end
  end

  def test_exact_object_limit_and_binary_bytes_are_preserved
    bytes = "\x00\xff".b * (Elevateo::Attachments::MAX_BYTES / 2)
    with_exchange(bucket: Response.new, object: Response.new(chunks: [bytes])) do
      assert_equal bytes, @adapter.get(KEY)
    end
  end

  def test_object_overflow_stops_consumption_immediately
    object = Response.new(chunks: ["x" * Elevateo::Attachments::MAX_BYTES, "y", "unread"])
    with_exchange(bucket: Response.new, object: object) do
      error = assert_raises(ERROR) { @adapter.get(KEY) }
      assert_equal "private object response too large", error.message
      assert_equal 2, object.reads
    end
  end
end
