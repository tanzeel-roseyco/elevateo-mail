# frozen_string_literal: true

require_relative "imap_poll_store"
require_relative "imap_sync"

module Elevateo
  module Inbound
    # AIDEV-NOTE: One run processes one SQL-selected account; supervisors bound concurrency, never per-account threads.
    class ImapPoller
      def initialize(connection:, transport:, attachment_storage: nil)
        @connection = connection
        @transport = transport
        @attachment_storage = attachment_storage
        @polls = ImapPollStore.new(connection: connection)
      end

      def run_once
        lease = @polls.claim_next
        return :idle unless lease
        store = ImapWorkerStore.new(connection: @connection, lease_token: lease.fetch("lease_token"))
        sync = ImapSync.new(store: store, transport: @transport, attachment_storage: @attachment_storage)
        begin
          sync.run(account_id: lease.fetch("account_id"), credential_version: lease.fetch("credential_version"))
        rescue StandardError => error
          # AIDEV-NOTE: Persist backoff when still owner; stale ownership cannot overwrite a newer lease's schedule.
          begin
            @polls.finish(lease, outcome: "failure")
          rescue StandardError => finish_error
            raise finish_error, cause: error
          end
          raise
        end
        @polls.finish(lease, outcome: sync.batch_full ? "full" : "success")
        :polled
      end
    end
  end
end
