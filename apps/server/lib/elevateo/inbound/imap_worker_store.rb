# frozen_string_literal: true

require "json"
require_relative "fake_ingress"
require_relative "../mail_credentials/binding"

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
          result.keys.sort == %w[account_id credential_ref credential_version last_uid mailbox_id organization_id uidvalidity]

        # AIDEV-NOTE: Preserve SQL tenant authority through secret resolution; caller IDs cannot supply missing scope.
        binding = MailCredentials::Binding.new(account_id: result.fetch("account_id"),
          organization_id: result.fetch("organization_id"), mailbox_id: result.fetch("mailbox_id"),
          credential_version: result.fetch("credential_version"), credential_ref: result.fetch("credential_ref"))
        last_uid = result.fetch("last_uid")
        validity = result.fetch("uidvalidity")
        raise Rejected, "account_unavailable" unless binding.account_id == account_id &&
          binding.credential_version == credential_version && last_uid.is_a?(Integer) &&
          last_uid.between?(0, 4_294_967_295) &&
          (validity.nil? ? last_uid.zero? : validity.is_a?(Integer) && validity.between?(1, 4_294_967_295))

        # @type var claim: imap_claim
        claim = { "binding" => binding, "uidvalidity" => validity, "last_uid" => last_uid }
        claim
      rescue JSON::ParserError, KeyError, MailCredentials::Unavailable
        raise Rejected, "account_unavailable", cause: nil
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
