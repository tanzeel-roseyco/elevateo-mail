# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/attachments_scan"

class ClamdScannerTest < Minitest::Test
  class SocketFixture
    attr_reader :written, :closed
    def initialize(reply, max_write: nil)
      @reply, @index, @written, @max_write, @closed = reply, 0, +"".b, max_write, false
    end
    def write(bytes)
      accepted = bytes.byteslice(0, @max_write || bytes.bytesize)
      @written << accepted
      accepted.bytesize
    end
    def read(length)
      return nil if @index >= @reply.bytesize
      value = @reply.byteslice(@index, length)
      @index += value.bytesize
      value
    end
    def close
      @closed = true
    end
  end

  def scanner(reply)
    socket = SocketFixture.new(reply)
    [Elevateo::Attachments::ClamdScanner.new(socket_factory: -> { socket }), socket]
  end

  def test_clean_reply_requires_exact_instream_frame
    clamd, socket = scanner("stream: OK\0")
    assert_equal "clean", clamd.scan("hello")
    assert_equal "zINSTREAM\0" + [5].pack("N") + "hello" + [0].pack("N"), socket.written
  end

  def test_malware_reply_and_error_fail_closed
    clamd, = scanner("stream: Eicar-Test-Signature FOUND\0")
    assert_equal "malware", clamd.scan("safe fixture bytes")
    ["stream: OKAY\0", "stream: INSTREAM size limit exceeded. ERROR\0", "stream: OK"].each do |reply|
      clamd, = scanner(reply)
      assert_raises(Elevateo::Attachments::ClamdScanner::Error) { clamd.scan("hello") }
    end
  end

  def test_partial_socket_writes_preserve_complete_frame
    socket = SocketFixture.new("stream: OK\0", max_write: 2)
    clamd = Elevateo::Attachments::ClamdScanner.new(socket_factory: -> { socket })
    assert_equal "clean", clamd.scan("hello")
    assert_equal "zINSTREAM\0" + [5].pack("N") + "hello" + [0].pack("N"), socket.written
    assert socket.closed
  end

  def test_protocol_failure_closes_socket
    clamd, socket = scanner("stream: invalid\0")
    assert_raises(Elevateo::Attachments::ClamdScanner::Error) { clamd.scan("hello") }
    assert socket.closed
  end

  def test_nil_socket_factory_has_deliberate_error
    clamd = Elevateo::Attachments::ClamdScanner.new(socket_factory: -> { nil })
    error = assert_raises(Elevateo::Attachments::ClamdScanner::Error) { clamd.scan("hello") }
    assert_equal "clamd socket unavailable", error.message
  end

  def test_rejects_empty_and_oversized_before_socket
    clamd, socket = scanner("stream: OK\0")
    assert_raises(Elevateo::Attachments::ClamdScanner::Error) { clamd.scan("") }
    assert_raises(Elevateo::Attachments::ClamdScanner::Error) do
      clamd.scan("x" * (Elevateo::Attachments::MAX_BYTES + 1))
    end
    assert_empty socket.written
  end

  # AIDEV-NOTE: Removing the private daemon can remove its DNS name before TCP connection is attempted.
  def test_dns_and_connection_failures_have_deliberate_error
    [SocketError, Socket::ResolutionError, Errno::ECONNREFUSED, Timeout::Error].each do |failure|
      clamd = Elevateo::Attachments::ClamdScanner.new(socket_factory: -> { raise failure, "private detail" })
      error = assert_raises(Elevateo::Attachments::ClamdScanner::Error) { clamd.scan("hello") }
      assert_equal "clamd unavailable", error.message
    end
  end
end
