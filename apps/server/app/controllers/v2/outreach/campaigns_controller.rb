# frozen_string_literal: true

require_relative "base_controller"

module V2
  module Outreach
    class CampaignsController < BaseController
      def index
        protected_read(allowed_query: %w[cursor limit], budget: 262_144) do |connection:, identity:, query:, **|
          # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
          # @type var identity: Elevateo::SessionIdentity
          # @type var query: Hash[String, String]
          cursor, limit = page_options(query)
          encoded(public_page("campaign", campaign_repository(connection, identity: identity, write: false).page(kind: "campaign",
            organization_id: identity.org_id, cursor: cursor, limit: limit)))
        end
      end

      def show
        id = path_uuid(:campaign_id)
        protected_read(allowed_query: [], budget: 4096) do |connection:, identity:, **|
          # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
          # @type var identity: Elevateo::SessionIdentity
          encoded(public_item("campaign", campaign_repository(connection, identity: identity, write: false).detail(kind: "campaign",
            organization_id: identity.org_id, id: id)))
        end
      end

      def create
        protected_write(required: %w[id operation_id name status], budget: 4096) do
          |connection:, identity:, input:, **|
          # @type var connection: Elevateo::WriteStatements
          # @type var identity: Elevateo::SessionIdentity
          # @type var input: Elevateo::WriteInput::object
          payload = Elevateo::Campaigns::Input.new(kind: "campaign", value: input)
          repository = campaign_repository(connection, identity: identity, write: true)
          repository.save(payload, organization_id: identity.org_id)
          write_result(public_item("campaign", repository.detail(kind: "campaign",
            organization_id: identity.org_id, id: payload.id)), status: 201)
        end
      end

      def update
        id = path_uuid(:campaign_id)
        protected_write(required: %w[operation_id expected_version name status], budget: 4096) do
          |connection:, identity:, input:, **|
          # @type var connection: Elevateo::WriteStatements
          # @type var identity: Elevateo::SessionIdentity
          # @type var input: Elevateo::WriteInput::object
          payload = Elevateo::Campaigns::Input.new(kind: "campaign", value: {
            "id" => id, "operation_id" => input.fetch("operation_id"),
            "name" => input.fetch("name"), "status" => input.fetch("status")
          })
          result = campaign_repository(connection, identity: identity, write: true).replace(payload, organization_id: identity.org_id,
            expected_version: Elevateo::WriteInput.integer(input.fetch("expected_version"), minimum: 1, maximum: 2_147_483_646),
            intent: input)
          write_result(public_item("campaign", result))
        end
      end
    end
  end
end
