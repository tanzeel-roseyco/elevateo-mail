# frozen_string_literal: true

require "json"
require_relative "imap_worker_store"

module Elevateo
  module Inbound
    # AIDEV-NOTE: SQL chooses the account and next due time; callers cannot supply tenant scope or schedules.
    class ImapPollStore
      def initialize(connection:)
        @connection = connection
      end

      def claim_next
        # @type var lease: imap_poll_lease
        row = @connection.exec_query("SELECT app.lease_due_imap_account()::text AS result", "IMAP due", []).first
        raise Rejected, "poll_unavailable" unless row && row.key?("result")
        raw = row.fetch("result")
        return nil if raw.nil?
        raise Rejected, "poll_unavailable" unless raw.is_a?(String)
        result = JSON.parse(raw)
        unless result.is_a?(Hash) && result.keys.sort == %w[account_id credential_version lease_token] &&
            result["account_id"].is_a?(String) && FakeIngress::UUID.match?(result["account_id"]) &&
            result["lease_token"].is_a?(String) && FakeIngress::UUID.match?(result["lease_token"]) &&
            result["credential_version"].is_a?(Integer) && result["credential_version"].positive?
          raise Rejected, "poll_unavailable"
        end
        lease = { "account_id" => result.fetch("account_id"), "credential_version" => result.fetch("credential_version"),
          "lease_token" => result.fetch("lease_token") }
        lease.freeze
        lease
      rescue JSON::ParserError
        raise Rejected, "poll_unavailable", cause: nil
      end

      def finish(lease, outcome:)
        raise ArgumentError, "invalid poll outcome" unless %w[success full failure].include?(outcome)
        values = [lease.fetch("account_id"), lease.fetch("credential_version"), lease.fetch("lease_token"), outcome]
        binds = values.map { |value| ActiveRecord::Relation::QueryAttribute.new("imap_poll", value.to_s, ActiveRecord::Type::String.new) }
        row = @connection.exec_query("SELECT app.finish_imap_poll($1::uuid,$2::integer,$3::uuid,$4::text) AS result",
          "IMAP finish", binds).first
        raise Rejected, "poll_unavailable" unless row && row["result"] == true
        nil
      end
    end
  end
end
