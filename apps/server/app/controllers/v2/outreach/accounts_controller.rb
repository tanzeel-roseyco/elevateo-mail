# frozen_string_literal: true

require_relative "base_controller"

module V2
  module Outreach
    class AccountsController < BaseController
      def index
        campaign = path_uuid(:campaign_id)
        protected_read(allowed_query: %w[cursor limit], budget: 262_144) do |connection:, identity:, query:, **|
          # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
          # @type var identity: Elevateo::SessionIdentity
          # @type var query: Hash[String, String]
          repository = campaign_repository(connection, identity: identity, write: false)
          repository.detail(kind: "campaign", organization_id: identity.org_id, id: campaign)
          cursor, limit = page_options(query)
          encoded(public_page("account", repository.page(kind: "account",
            organization_id: identity.org_id, campaign_id: campaign, cursor: cursor, limit: limit)))
        end
      end

      def show
        id, campaign = path_uuid(:account_id), path_uuid(:campaign_id)
        protected_read(allowed_query: [], budget: 4096) do |connection:, identity:, **|
          # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
          # @type var identity: Elevateo::SessionIdentity
          item = campaign_repository(connection, identity: identity, write: false).detail(kind: "account",
            organization_id: identity.org_id, id: id)
          raise Elevateo::CollaborationError.new("not_available") unless item.fetch("campaign_id") == campaign
          encoded(public_item("account", item))
        end
      end

      def create
        campaign = path_uuid(:campaign_id)
        protected_write(required: %w[id operation_id mailbox_id label], budget: 4096) do
          |connection:, identity:, input:, **|
          # @type var connection: Elevateo::WriteStatements
          # @type var identity: Elevateo::SessionIdentity
          # @type var input: Elevateo::WriteInput::object
          payload = Elevateo::Campaigns::Input.new(kind: "account", value: input.merge("campaign_id" => campaign))
          repository = campaign_repository(connection, identity: identity, write: true)
          repository.detail(kind: "campaign", organization_id: identity.org_id,
            id: payload.attributes.fetch("campaign_id"))
          repository.save(payload, organization_id: identity.org_id)
          write_result(public_item("account", repository.detail(kind: "account",
            organization_id: identity.org_id, id: payload.id)), status: 201)
        end
      end

      def update
        id, campaign = path_uuid(:account_id), path_uuid(:campaign_id)
        protected_write(required: %w[operation_id expected_version label], budget: 4096) do
          |connection:, identity:, input:, **|
          # @type var connection: Elevateo::WriteStatements
          # @type var identity: Elevateo::SessionIdentity
          # @type var input: Elevateo::WriteInput::object
          repository = campaign_repository(connection, identity: identity, write: true)
          old = repository.detail(kind: "account", organization_id: identity.org_id, id: id)
          raise Elevateo::CollaborationError.new("not_available") unless old.fetch("campaign_id") == campaign
          payload = Elevateo::Campaigns::Input.new(kind: "account", value: {
            "id" => id, "operation_id" => input.fetch("operation_id"),
            "campaign_id" => old.fetch("campaign_id"), "mailbox_id" => old.fetch("mailbox_id"),
            "label" => input.fetch("label")
          })
          result = repository.replace(payload, organization_id: identity.org_id,
            expected_version: Elevateo::WriteInput.integer(input.fetch("expected_version"), minimum: 1, maximum: 2_147_483_646),
            intent: input)
          write_result(public_item("account", result))
        end
      end
    end
  end
end
