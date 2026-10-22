# frozen_string_literal: true

require "net/http"
require "json"
require "timeout"
require "uri"
require_relative "signature"

module Elevateo
  module ResendEvents
    # AIDEV-NOTE: Fixed provider origins, exact attachment paths and streamed limits exclude webhook-supplied URLs.
    class Client
      MAX_RESPONSE = 1_048_576
      def initialize(api_key:)
        raise Invalid, "receiving API unavailable" unless api_key.is_a?(String) &&
          /\Are_[A-Za-z0-9_-]{8,250}\z/.match?(api_key)
        @api_key = api_key
      end

      def retrieve(email_id)
        # @type var value: object
        raise Invalid, "invalid email id" unless Signature::UUID.match?(email_id)
        value = json("/emails/receiving/#{email_id}?html_format=cid")
        raise Invalid, "invalid received content" unless value["id"] == email_id
        value
      end

      def attachment(email_id, attachment_id)
        raise Invalid, "invalid attachment id" unless Signature::UUID.match?(email_id) &&
          Signature::UUID.match?(attachment_id)
        metadata = json("/emails/receiving/#{email_id}/attachments/#{attachment_id}")
        url = metadata["download_url"]
        raise Invalid, "invalid attachment response" unless metadata["id"] == attachment_id && url.is_a?(String) &&
          url.bytesize <= 8192
        uri = URI.parse(url)
        raise Invalid, "invalid attachment origin" unless uri.is_a?(URI::HTTPS) && uri.scheme == "https" &&
          uri.host == "inbound-cdn.resend.com" && uri.port == 443 && !uri.userinfo && !uri.fragment &&
          uri.path == "/#{email_id}/attachments/#{attachment_id}"
        # AIDEV-NOTE: The presigned CDN URL is never logged; API authorization never leaves api.resend.com.
        request("inbound-cdn.resend.com", uri.request_uri, limit: Signature::MAX_BODY, authorized: false)
      rescue URI::InvalidURIError
        raise Invalid, "invalid attachment origin", cause: nil
      end

      def inspect = "#<Elevateo::ResendEvents::Client redacted>"
      alias to_s inspect

      private

      def json(path)
        # @type var value: value
        value = JSON.parse(request("api.resend.com", path, limit: MAX_RESPONSE, authorized: true), max_nesting: 16)
        raise Invalid, "invalid received content" unless value.is_a?(Hash)
        value
      end

      def request(host, path, limit:, authorized:)
        http = Net::HTTP.new(host, 443, nil)
        http.use_ssl = true
        http.verify_mode = OpenSSL::SSL::VERIFY_PEER
        http.open_timeout = 5
        http.read_timeout = 10
        http.write_timeout = 5
        http.max_retries = 0
        http.ignore_eof = false
        req = Net::HTTP::Get.new(path)
        req["Authorization"] = "Bearer #{@api_key}" if authorized
        body = +"".b
        # AIDEV-NOTE: A total deadline also bounds slow headers and trickles; redirects are rejected.
        Timeout.timeout(25) do
          http.start do |session|
            session.request(req) do |response|
              raise Invalid, "receiving API unavailable" unless response.code == "200"
              response.read_body do |chunk|
                raise Invalid, "received content too large" if body.bytesize + chunk.bytesize > limit
                body << chunk
              end
            end
          end
        end
        body
      end
    end
  end
end
