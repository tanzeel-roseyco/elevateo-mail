# frozen_string_literal: true

require_relative "../drafts/database"
require_relative "../send_error"

module Elevateo
  module SendAPI
    # AIDEV-NOTE: Only named SQL owner functions cross this boundary; absent migration/bridge fails closed.
    class Database < Drafts::Database
      def object(sql, values, budget: 2_097_152)
        row = rows(sql, values).first
        raise ReadResponse::Invalid unless row
        value = ThreadProjection.source_json(row["result"], budget)
        raise ReadResponse::Invalid unless value.is_a?(Hash)
        value
      end

      def outcome(value)
        return value unless value.key?("code")
        code = value["code"]
        unless value.keys == ["code"] && code.is_a?(String) && SendError::ERRORS.key?(code)
          raise ReadResponse::Invalid
        end
        raise SendError.new(code)
      end
    end
  end
end
