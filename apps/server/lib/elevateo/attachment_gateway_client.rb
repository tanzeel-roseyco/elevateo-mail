# frozen_string_literal: true

require "net/http"
require "timeout"
require_relative "attachment_gateway_request"

module Elevateo
  # Private, single-attempt byte transport. The caller must reauthorize after this returns and before release.
  class AttachmentGatewayClient
    class NotAvailable < StandardError; end
    class Unavailable < StandardError; end
    MAX_BYTES = 10 * 1024 * 1024

    def initialize(config:, transport: nil, transaction_open: nil, http_factory: nil)
      @config, @transport = config, transport
      @http_factory = http_factory || ->(host, port, proxy) { Net::HTTP.new(host, port, proxy) }
      @transaction_open = transaction_open || -> {
        connection = defined?(ActiveRecord::Base) && ActiveRecord::Base.connection_pool.active_connection?
        connection ? connection.transaction_open? : false
      }
    end

    def download(fields:, timeout:, now: Time.now.to_i)
      raise Unavailable if @transaction_open.call
      url, key = @config.attachment_gateway_url, @config.attachment_gateway_hmac_key
      raise Unavailable unless url == "http://attachment-gateway:4708" && key.is_a?(String) && key.bytesize == 32
      raise Unavailable unless timeout.is_a?(Numeric) && timeout.positive? && timeout <= 5
      signed = AttachmentGatewayRequest.new(fields: fields, key: key, now: now)
      # AIDEV-NOTE: Net::HTTP read_timeout resets per chunk; one outer deadline covers the entire private exchange.
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + timeout
      status, headers, bytes = Timeout.timeout(timeout) do
        transport = @transport
        if transport
          transport.call(signed.body, signed.signature, timeout)
        else
          # Kernel.Float preserves Numeric conversion while Net::HTTP setters require Float.
          exchange(signed, Float(timeout))
        end
      end
      raise Unavailable if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
      raise NotAvailable if status == 404
      raise Unavailable unless status == 200 && headers.is_a?(Hash) && bytes.is_a?(String)
      normalized = headers.transform_keys { |name| name.to_s.downcase }
      length = normalized["content-length"]
      raise Unavailable unless normalized["content-type"] == "application/octet-stream" &&
        normalized["cache-control"] == "no-store" && normalized["x-content-type-options"] == "nosniff" &&
        normalized["content-disposition"] == 'attachment; filename="attachment"' &&
        length.is_a?(String) && /\A[1-9][0-9]*\z/.match?(length) && length.to_i == bytes.bytesize &&
        bytes.bytesize.between?(1, MAX_BYTES)
      bytes.b.freeze
    rescue ArgumentError, TypeError, IOError, SystemCallError, SocketError, Timeout::Error,
      Net::HTTPBadResponse, Net::ProtocolError
      raise Unavailable
    end

    private

    def exchange(signed, timeout)
      http = @http_factory.call("attachment-gateway", 4708, nil)
      http.max_retries = 0
      http.open_timeout = [timeout, 0.5].min
      http.read_timeout = http.write_timeout = timeout
      request = Net::HTTP::Post.new(AttachmentGatewayRequest::PATH)
      request["Content-Type"] = "application/json"
      request["Accept"] = "application/octet-stream"
      request["X-Elevateo-Attachment-Signature"] = signed.signature
      request.body = signed.body
      # @type var result: [Integer, Hash[String, String], String]?
      result = nil
      http.start do |connection|
        connection.request(request) do |response|
          body = +"".b
          response.read_body do |chunk|
            raise Unavailable if body.bytesize + chunk.bytesize > MAX_BYTES
            body << chunk
          end
          result = [response.code.to_i, response.each_header.to_h, body]
        end
      end
      raise Unavailable unless result
      result
    end
  end
end
