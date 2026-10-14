# frozen_string_literal: true

require_relative "../../v1/write_controller"
require_relative "../../../../lib/elevateo/campaigns/repository"

module V2
  module Outreach
    # AIDEV-NOTE: V2 outreach reuses V1's authenticated snapshot, CSRF, current session and tenant transaction.
    class BaseController < V1::WriteController
      protected

      def campaign_repository(connection)
        Elevateo::Campaigns::Repository.new(connection: connection)
      end

      def path_uuid(key)
        Elevateo::WriteInput.uuid(request.path_parameters.fetch(key))
      end

      def page_options(query)
        raw_limit = query.fetch("limit", "50")
        Elevateo::WriteInput.invalid! unless /\A[1-9][0-9]?\z/.match?(raw_limit) || raw_limit == "100"
        limit = raw_limit.to_i
        Elevateo::WriteInput.invalid! unless limit.between?(1, 100)
        cursor = query["cursor"]
        cursor = Elevateo::WriteInput.uuid(cursor) if cursor
        [cursor, limit]
      end

      def encoded(payload)
        result = JSON.generate(payload, allow_nan: false)
        raise Elevateo::CollaborationError.new("internal_error") if result.bytesize > 262_144
        result
      end

      def write_result(payload, status: 200)
        Elevateo::WriteResponse.new(json: encoded(payload), status: status)
      end

      def public_item(kind, item)
        fields = case kind
        when "campaign" then %w[id name status version]
        when "lead" then %w[id campaign_id email consent_status suppressed version]
        when "account" then %w[id campaign_id mailbox_id label status version]
        else Elevateo::WriteInput.invalid!
        end
        item.slice(*fields)
      end

      def public_detail(kind, item)
        result = public_item(kind, item)
        return result unless kind == "lead"
        result.merge(item.slice("consent_recorded_at", "consent_source", "consent_recorded_by"))
      end

      def public_page(kind, page)
        { "items" => page.fetch("items").map { |item| public_item(kind, item) },
          "next_cursor" => page.fetch("next_cursor") }
      end
    end
  end
end
