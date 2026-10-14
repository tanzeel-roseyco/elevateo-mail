# frozen_string_literal: true

require_relative "../v1/write_controller"
require_relative "../../../lib/elevateo/campaigns/repository"

module V2
  # AIDEV-NOTE: Only inert draft metadata is listed; membership is rechecked by protected_read's tenant snapshot.
  class OutreachCampaignsController < V1::WriteController
    def index
      protected_read(allowed_query: [], budget: 20_480) do |connection:, identity:, **|
        rows = Elevateo::Campaigns::Repository.new(connection: connection).list(
          kind: "campaign", organization_id: identity.org_id)
        items = rows.map do |row|
          self.class.campaign_projection(row)
        end
        api_encode({ "items" => items }, limit: 20_480)
      end
    end

    def self.campaign_projection(row)
      unless row.is_a?(Hash) && row["id"].is_a?(String) && row["name"].is_a?(String) &&
        %w[draft paused].include?(row["status"])
        raise Elevateo::CollaborationError.new("internal_error")
      end
      { "id" => row.fetch("id"), "name" => row.fetch("name"), "status" => row.fetch("status") }
    end
  end
end
