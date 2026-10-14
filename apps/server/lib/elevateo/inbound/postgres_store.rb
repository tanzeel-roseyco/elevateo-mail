# frozen_string_literal: true

require "json"
require_relative "fake_ingress"
require_relative "../read_response"

module Elevateo
  module Inbound
    # AIDEV-NOTE: The protected caller owns one trusted tenant transaction; the SQL function owns atomic replay.
    class PostgresStore
      SQL = <<~SQL.freeze
        SELECT app.ingest_fake_mail($1::text,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,
          $8::jsonb,$9::jsonb,$10::text,$11::text,$12::jsonb)::text AS result
      SQL
      SCOPE_SQL = "SELECT id FROM app.mailboxes WHERE organization_id=$1::uuid AND id=$2::uuid LIMIT 1"

      def initialize(connection:, session_digest:, actor_id:)
        @connection = connection
        @session_digest = session_digest
        @actor_id = actor_id
      end

      def authorized?(organization_id:, mailbox_id:)
        values = [organization_id, mailbox_id].map do |value|
          ActiveRecord::Relation::QueryAttribute.new("inbound_scope", value, ActiveRecord::Type::String.new)
        end
        !@connection.exec_query(SCOPE_SQL, "Inbound mailbox scope", values).to_a.empty?
      end

      def insert_once(record)
        values = [@session_digest, @actor_id, record.fetch(:organization_id), record.fetch(:mailbox_id),
                  record.fetch(:provider_account_id),
                  record.fetch(:provider_event_id), record.fetch(:content_sha256),
                  address(record.fetch(:from)).to_json,
                  record.fetch(:to).map { |value| address(value) }.to_json,
                  record.fetch(:subject), record.fetch(:text), record.fetch(:attachments).to_json]
        binds = values.map do |value|
          ActiveRecord::Relation::QueryAttribute.new("inbound", value, ActiveRecord::Type::String.new)
        end
        row = @connection.exec_query(SQL, "Inbound ingest", binds).first
        raise ReadResponse::Invalid unless row

        raw = row.fetch("result")
        raise ReadResponse::Invalid unless raw.is_a?(String)

        result = JSON.parse(raw)
        unless result.is_a?(Hash) && result.keys.sort == %w[message_id result thread_id] &&
               %w[created duplicate].include?(result["result"]) &&
               FakeIngress::UUID.match?(result["thread_id"]) && FakeIngress::UUID.match?(result["message_id"])
          raise ReadResponse::Invalid
        end
        result
      rescue ActiveRecord::StatementInvalid => error
        case error.cause
        when PG::CheckViolation then raise Rejected, "replay_mismatch"
        when PG::InvalidParameterValue then raise Rejected, "request_invalid"
        else raise
        end
      end

      private

      def address(value)
        { "display_name" => nil, "address" => value }
      end
    end
  end
end
