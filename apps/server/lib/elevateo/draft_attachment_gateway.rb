# frozen_string_literal: true

require "net/http"
require "timeout"
require_relative "draft_attachment_request"

module Elevateo
  class DraftAttachmentGateway
    # AIDEV-NOTE: API holds only the gateway signing key; this exchange must run outside every SQL transaction.
    def initialize(config:)
      @config = config
    end

    def stage(fields:)
      raise CollaborationError.new("internal_error") if ActiveRecord::Base.connection_pool.active_connection?&.transaction_open?
      key = @config.attachment_gateway_hmac_key
      raise CollaborationError.new("temporarily_unavailable") unless @config.attachment_gateway_url == "http://attachment-gateway:4708" && key
      signed = DraftAttachmentRequest.new(fields: fields, key: key)
      http = Net::HTTP.new("attachment-gateway", 4708, nil)
      http.max_retries = 0
      http.open_timeout = 1
      http.read_timeout = http.write_timeout = 5
      request = Net::HTTP::Post.new(DraftAttachmentRequest::PATH)
      request["Content-Type"] = "application/json"
      request["X-Elevateo-Attachment-Signature"] = signed.signature
      request.body = signed.body
      Timeout.timeout(5) do
        http.start do |connection|
          connection.request(request) do |response|
            raise CollaborationError.new("not_available") if response.code == "404"
            raise CollaborationError.new("temporarily_unavailable") unless response.code == "204"
            response.read_body { |chunk| raise CollaborationError.new("temporarily_unavailable") unless chunk.empty? }
          end
        end
      end
      nil
    rescue IOError, SystemCallError, SocketError, Timeout::Error, Net::HTTPBadResponse, Net::ProtocolError
      raise CollaborationError.new("temporarily_unavailable")
    end
  end
end
