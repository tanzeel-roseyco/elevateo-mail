# frozen_string_literal: true

require_relative "base_controller"

module V2
  module Outreach
    class AnalyticsController < BaseController
      def show
        campaign = path_uuid(:campaign_id)
        protected_read(allowed_query: [], budget: 4096) do |connection:, identity:, **|
          row = campaign_repository(connection, identity: identity, write: false).analytics(organization_id: identity.org_id, campaign_id: campaign)
          encoded({ "campaign_id" => row.fetch("id"), "lead_count" => row.fetch("lead_count").to_i,
            "consented_count" => row.fetch("consented_count").to_i })
        end
      end
    end
  end
end
