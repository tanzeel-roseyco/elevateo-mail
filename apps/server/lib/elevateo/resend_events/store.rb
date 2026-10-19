# frozen_string_literal: true

require "json"
require_relative "signature"
require "securerandom"

module Elevateo
  module ResendEvents
    # AIDEV-NOTE: API can only append receipts; worker leases and SQL own all tenant decisions and state effects.
    class Store
      def initialize(connection:)
        @connection = connection
      end

      def receive(id:, body:)
        query("SELECT app.receive_resend_event($1::text,$2::text)::text AS result", [id, body])
      end

      def claim
        query("SELECT app.claim_resend_event($1::uuid)::text AS result", [SecureRandom.uuid])
      end

      def apply(id:, lease:)
        query("SELECT app.apply_resend_event($1::text,$2::uuid)::text AS result", [id, lease])
      end

      def ingest(id:, lease:, content:)
        query("SELECT app.ingest_resend_email($1::text,$2::uuid,$3::jsonb)::text AS result",
          [id, lease, JSON.generate(content)])
      end

      private

      def query(sql, values)
        binds = values.map do |value|
          ActiveRecord::Relation::QueryAttribute.new("resend_event", value, ActiveRecord::Type::String.new)
        end
        row = @connection.exec_query(sql, "Resend event", binds).first
        raise Invalid, "event store unavailable" unless row && row["result"].is_a?(String)

        # @type var value: value
        value = JSON.parse(row["result"])
        raise Invalid, "event store unavailable" unless value.is_a?(Hash)

        value
      end
    end
  end
end
