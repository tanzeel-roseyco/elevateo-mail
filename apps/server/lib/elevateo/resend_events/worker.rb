# frozen_string_literal: true

require "timeout"
require_relative "store"
require_relative "content"
require_relative "attachment_stager"

module Elevateo
  module ResendEvents
    # AIDEV-NOTE: Provider failures leave the durable lease recoverable; successful ingestion commits with its receipt.
    class Worker
      def initialize(store:, client:, storage: nil)
        @store = store
        @client = client
        @stager = AttachmentStager.new(client: client, storage: storage)
      end

      def run_once
        # AIDEV-NOTE: Finish before the ten-minute lease; a slow attachment batch remains durably retryable.
        Timeout.timeout(300) { process_once }
      end

      private

      def process_once
        claimed = @store.claim
        return "empty" if claimed["result"] == "empty"
        id = claimed["id"]
        lease = claimed["lease"]
        payload = claimed["payload"]
        raise Invalid, "invalid event lease" unless id.is_a?(String) && lease.is_a?(String) && payload.is_a?(Hash)
        data = payload["data"]
        raise Invalid, "invalid event payload" unless data.is_a?(Hash) && data["email_id"].is_a?(String)
        result = if payload["type"] == "email.received"
          content = Content.new.normalize(@client.retrieve(data["email_id"]))
          parts = content["attachments"]
          raise Invalid, "invalid attachments" unless parts.is_a?(Array)
          content["attachments"] = @stager.stage(data["email_id"], parts)
          @store.ingest(id: id, lease: lease, content: content)
        else
          @store.apply(id: id, lease: lease)
        end
        outcome = result["result"]
        raise Invalid, "invalid event outcome" unless outcome.is_a?(String)
        outcome
      end
    end
  end
end
