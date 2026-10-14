# frozen_string_literal: true

require "json"
require_relative "fake_ingress"

module Elevateo
  module Inbound
    # AIDEV-NOTE: This adapter requires the elevateo_worker DB login; account scope is resolved only inside SQL.
    class ImapWorkerStore
      SQL = <<~SQL.freeze
        SELECT app.ingest_imap_mail_with_attachments($1::uuid,$2::integer,$3::bigint,$4::bigint,$5::text,
          $6::jsonb,$7::jsonb,$8::text,$9::text,$10::jsonb)::text AS result
      SQL
      PLAIN_SQL = <<~SQL.freeze
        SELECT app.ingest_imap_mail($1::uuid,$2::integer,$3::bigint,$4::bigint,$5::text,
          $6::jsonb,$7::jsonb,$8::text,$9::text)::text AS result
      SQL
      RESET_SQL = "SELECT app.reset_imap_uidvalidity($1::uuid,$2::integer,$3::bigint,$4::bigint) AS result"
      CLAIM_SQL = "SELECT app.claim_imap_account($1::uuid,$2::integer)::text AS result"

      def initialize(connection:)
        @connection = connection
      end

      def insert_once(account_id:, credential_version:, uidvalidity:, uid:, content_sha256:, from:, to:, subject:, text:,
        attachments: [])
        values = [account_id, credential_version, uidvalidity, uid, content_sha256,
                  { display_name: nil, address: from }.to_json,
                  to.map { |address| { display_name: nil, address: address } }.to_json, subject, text,
                  attachments.to_json]
        statement = attachments.empty? ? PLAIN_SQL : SQL
        values.pop if attachments.empty?
        row = @connection.exec_query(statement, "IMAP receive", binds(values)).first
        raise Rejected, "store_unavailable" unless row

        raw = row.fetch("result")
        raise Rejected, "store_unavailable" unless raw.is_a?(String)

        result = JSON.parse(raw)
        unless result.is_a?(Hash) && %w[created duplicate uidvalidity_changed].include?(result["result"])
          raise Rejected, "store_unavailable"
        end
        result
      end

      def reset_uidvalidity(account_id:, credential_version:, expected:, replacement:)
        values = [account_id, credential_version, expected, replacement]
        row = @connection.exec_query(RESET_SQL, "IMAP epoch reset", binds(values)).first
        !row.nil? && row["result"] == true
      end

      def claim(account_id:, credential_version:)
        row = @connection.exec_query(CLAIM_SQL, "IMAP account claim", binds([account_id, credential_version])).first
        raise Rejected, "account_unavailable" unless row

        raw = row.fetch("result")
        raise Rejected, "account_unavailable" unless raw.is_a?(String)

        result = JSON.parse(raw)
        raise Rejected, "account_unavailable" unless result.is_a?(Hash) &&
          result.keys.sort == %w[credential_ref last_uid uidvalidity]

        ref = result.fetch("credential_ref")
        last_uid = result.fetch("last_uid")
        validity = result.fetch("uidvalidity")
        raise Rejected, "account_unavailable" unless ref.is_a?(String) && ref.start_with?("test:")
        raise Rejected, "account_unavailable" unless last_uid.is_a?(Integer) && last_uid >= 0
        raise Rejected, "account_unavailable" unless validity.nil? || validity.is_a?(Integer)

        # @type var claim: imap_claim
        claim = { "credential_ref" => ref, "uidvalidity" => validity, "last_uid" => last_uid }
        claim
      end

      private

      def binds(values)
        values.map do |value|
          ActiveRecord::Relation::QueryAttribute.new("imap_receive", value&.to_s, ActiveRecord::Type::String.new)
        end
      end
    end
  end
end
