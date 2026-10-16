# frozen_string_literal: true

require "net/http"
require "json"
require "uri"
require_relative "attachments"

module Elevateo
  module Attachments
    # AIDEV-NOTE: This privileged adapter belongs only in a restricted worker/gateway, never the Rails API process.
    class PrivateStorage
      class Unavailable < StandardError; end
      KEY = %r{\Aquarantine/(?:[0-9a-f-]{36}/[0-9a-f-]{36}|imap/[0-9a-f-]{36}/[0-9]+/[0-9]+/[0-9]+)\z}
      API_KEY = %r{\Aquarantine/[0-9a-f-]{36}/[0-9a-f-]{36}\z}
      BUCKET = /\A[a-z0-9][a-z0-9-]{2,62}\z/

      def initialize(base_url:, bucket:, service_token:, process:)
        raise ArgumentError, "restricted process required" unless %w[worker attachment_gateway].include?(process)
        uri = URI.parse(base_url)
        raise ArgumentError, "private Storage URL required" unless uri.scheme == "http" && uri.host == "storage" &&
          uri.port == 5000 && uri.path.to_s.empty? && uri.query.nil? && uri.fragment.nil? && uri.userinfo.nil?
        raise ArgumentError, "invalid bucket" unless bucket.is_a?(String) && BUCKET.match?(bucket)
        raise ArgumentError, "missing private token" unless service_token.is_a?(String) && service_token.bytesize.between?(32, 4096)
        # AIDEV-NOTE: The validated private endpoint has nonnullable transport fields for strict network typing.
        @host, @port, @bucket, @token = "storage", 5000, bucket, service_token
      rescue URI::InvalidURIError
        raise ArgumentError, "private Storage URL required"
      end

      def inspect = "#<Elevateo::Attachments::PrivateStorage redacted>"
      alias to_s inspect

      def put(key, bytes, content_type:)
        raise ArgumentError, "invalid object" unless API_KEY.match?(key.to_s) && bytes.is_a?(String) &&
          bytes.bytesize.between?(1, MAX_BYTES) && content_type == "application/octet-stream"
        raise Unavailable, "private bucket unavailable" unless private_bucket?
        request(Net::HTTP::Post, key, bytes: bytes, expected: [200, 201])
        nil
      end

      # AIDEV-NOTE: Inbound retries compare committed bytes; they never overwrite or delete an earlier object.
      def put_once(key, bytes)
        raise ArgumentError, "invalid inbound object" unless KEY.match?(key.to_s) && key.start_with?("quarantine/imap/") &&
          bytes.is_a?(String) && bytes.bytesize.between?(1, 262_144)
        raise Unavailable, "private bucket unavailable" unless private_bucket?
        # AIDEV-NOTE: Supabase may report duplicates as 400 or 409; only exact authorized read-back admits a retry.
        request(Net::HTTP::Post, key, bytes: bytes, expected: [200, 201, 400, 409])
        stored = get(key)
        raise Unavailable, "staged object conflict" unless stored == bytes
        nil
      end

      def get(key)
        raise ArgumentError, "invalid key" unless KEY.match?(key.to_s)
        raise Unavailable, "private bucket unavailable" unless private_bucket?
        request(Net::HTTP::Get, key, expected: [200])
      end

      def delete(key)
        raise ArgumentError, "invalid key" unless API_KEY.match?(key.to_s)
        # Storage's object endpoint uses DELETE with the path; no retry is automatic.
        raise Unavailable, "private bucket unavailable" unless private_bucket?
        request(Net::HTTP::Delete, key, expected: [200, 204, 404])
        nil
      end

      private

      def private_bucket?
        http = Net::HTTP.new(@host, @port, nil)
        http.open_timeout = 3
        http.read_timeout = 5
        http.max_retries = 0
        req = Net::HTTP::Get.new("/bucket/#{@bucket}")
        req["Authorization"] = "Bearer #{@token}"
        body = +"".b
        # AIDEV-NOTE: Bound the streamed metadata before retaining it; denial never proceeds to an object request.
        http.start do |session|
          session.request(req) do |response|
            raise Unavailable unless response.code.to_i == 200
            response.read_body do |chunk|
              raise Unavailable if body.bytesize + chunk.bytesize > 4096
              body << chunk
            end
          end
        end
        metadata = JSON.parse(body)
        metadata.is_a?(Hash) && metadata["public"] == false
      rescue IOError, SocketError, SystemCallError, Timeout::Error, Net::HTTPBadResponse,
        Net::HTTPHeaderSyntaxError, JSON::ParserError, Unavailable
        false
      end

      def request(method, key, bytes: nil, expected:)
        path = "/object/#{@bucket}/#{key}"
        http = Net::HTTP.new(@host, @port, nil)
        http.open_timeout = 3
        http.read_timeout = 15
        http.write_timeout = 15
        http.max_retries = 0
        req = method.new(path)
        req["Authorization"] = "Bearer #{@token}"
        req["Content-Type"] = "application/octet-stream"
        req.body = bytes if bytes
        body = +"".b
        http.start do |session|
          session.request(req) do |response|
            raise Unavailable, "private object unavailable" unless expected.include?(response.code.to_i)
            response.read_body do |chunk|
              raise Unavailable, "private object response too large" if body.bytesize + chunk.bytesize > MAX_BYTES
              body << chunk
            end
          end
        end
        body
      rescue IOError, SocketError, SystemCallError, Timeout::Error, Net::HTTPBadResponse, Net::HTTPHeaderSyntaxError
        raise Unavailable, "private object unavailable"
      end
    end
  end
end
