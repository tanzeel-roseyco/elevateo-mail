# frozen_string_literal: true

require "socket"
require "net/http"
require "timeout"

# AIDEV-NOTE: Only the injected HTTP client reaches this container-local stub; production endpoint rules stay intact.
class ResendHTTPStub
  attr_reader :requests

  def initialize(status: 200, body:)
    @server = TCPServer.new("127.0.0.1", 0)
    @port = @server.addr[1]
    @requests = []
    @thread = Thread.new do
      loop do
        socket = @server.accept
        begin
          Timeout.timeout(5) do
            first = socket.gets("\r\n")
            headers = {}
            while (line = socket.gets("\r\n")) && line != "\r\n"
              name, value = line.strip.split(":", 2)
              headers[name.downcase] = value.strip
            end
            length = Integer(headers.fetch("content-length", "0"), 10)
            raise "oversized provider fixture request" unless length.between?(0, 1_500_000)
            @requests << { line: first, headers: headers, body: socket.read(length) }
            socket.write("HTTP/1.1 #{status} Fixture\r\nContent-Type: application/json\r\nContent-Length: #{body.bytesize}\r\nConnection: close\r\n\r\n#{body}")
          end
        ensure
          socket.close
        end
      end
    rescue IOError, Errno::EBADF
      raise unless @server.closed?
    end
    @thread.report_on_exception = false
  end

  def client(_uri)
    Net::HTTP.new("127.0.0.1", @port, nil)
  end

  def close
    @server.close
    raise "provider stub did not stop" unless @thread.join(6)
    @thread.value
  end
end
