# frozen_string_literal: true

require "json"
require_relative "fake_ingress"

module Elevateo
  module Inbound
    # AIDEV-NOTE: This adapter requires the elevateo_worker DB login; account scope is resolved only inside SQL.
    class ImapWorkerStore
      SQL = <<~SQL.freeze
        SELECT app.ingest_imap_mail($1::uuid,$2::integer,$3::bigint,$4::bigint,$5::text,
          $6::jsonb,$7::jsonb,$8::text,$9::text)::text AS result
      SQL
      RESET_SQL = "SELECT app.reset_imap_uidvalidity($1::uuid,$2::integer,$3::bigint,$4::bigint) AS result"
      CLAIM_SQL = "SELECT app.claim_imap_account($1::uuid,$2::integer)::text AS result"

      def initialize(connection:)
        @connection = connection
      end

      def insert_once(account_id:, credential_version:, uidvalidity:, uid:, content_sha256:, from:, to:, subject:, text:)
        values = [account_id, credential_version, uidvalidity, uid, content_sha256,
                  { display_name: nil, address: from }.to_json,
                  to.map { |address| { display_name: nil, address: address } }.to_json, subject, text]
        row = @connection.exec_query(SQL, "IMAP receive", binds(values)).first
        raise Rejected, "store_unavailable" unless row

        result = JSON.parse(row.fetch("result"))
        unless result.is_a?(Hash) && %w[created duplicate uidvalidity_changed].include?(result["result"])
          raise Rejected, "store_unavailable"
        end
        result
      end

      def reset_uidvalidity(account_id:, credential_version:, expected:, replacement:)
        values = [account_id, credential_version, expected, replacement]
        row = @connection.exec_query(RESET_SQL, "IMAP epoch reset", binds(values)).first
        row && row["result"] == true
      end

      def claim(account_id:, credential_version:)
        row = @connection.exec_query(CLAIM_SQL, "IMAP account claim", binds([account_id, credential_version])).first
        raise Rejected, "account_unavailable" unless row

        result = JSON.parse(row.fetch("result"))
        unless result.is_a?(Hash) && result.keys.sort == %w[credential_ref last_uid uidvalidity] &&
               result["credential_ref"].is_a?(String) && result["credential_ref"].start_with?("test:") &&
               result["last_uid"].is_a?(Integer) && result["last_uid"] >= 0 &&
               (result["uidvalidity"].nil? || result["uidvalidity"].is_a?(Integer))
          raise Rejected, "account_unavailable"
        end
        result
      end

      private

      def binds(values)
        values.map { |value| ActiveRecord::Relation::QueryAttribute.new("imap_receive", value, ActiveRecord::Type::String.new) }
      end
    end
  end
end
