# frozen_string_literal: true

require_relative "base_controller"

module V2
  module Outreach
    class AccountsController < BaseController
      def index
        protected_read(allowed_query: %w[cursor limit], budget: 65_536) do |connection:, identity:, query:, **|
          cursor, limit = page_options(query)
          encoded(public_page("account", campaign_repository(connection).page(kind: "account",
            organization_id: identity.org_id, cursor: cursor, limit: limit)))
        end
      end

      def show
        id = path_uuid(:account_id)
        protected_read(allowed_query: [], budget: 4096) do |connection:, identity:, **|
          encoded(public_item("account", campaign_repository(connection).detail(kind: "account",
            organization_id: identity.org_id, id: id)))
        end
      end

      def create
        protected_write(required: %w[id operation_id campaign_id mailbox_id label], budget: 4096) do
          |connection:, identity:, input:, **|
          payload = Elevateo::Campaigns::Input.new(kind: "account", value: input)
          repository = campaign_repository(connection)
          repository.detail(kind: "campaign", organization_id: identity.org_id,
            id: payload.attributes.fetch("campaign_id"))
          repository.save(payload, organization_id: identity.org_id)
          write_result(public_item("account", repository.detail(kind: "account",
            organization_id: identity.org_id, id: payload.id)), status: 201)
        end
      end

      def update
        id = path_uuid(:account_id)
        protected_write(required: %w[operation_id expected_version label], budget: 4096) do
          |connection:, identity:, input:, **|
          repository = campaign_repository(connection)
          old = repository.detail(kind: "account", organization_id: identity.org_id, id: id)
          payload = Elevateo::Campaigns::Input.new(kind: "account", value: {
            "id" => id, "operation_id" => input.fetch("operation_id"),
            "campaign_id" => old.fetch("campaign_id"), "mailbox_id" => old.fetch("mailbox_id"),
            "label" => input.fetch("label")
          })
          result = repository.replace(payload, organization_id: identity.org_id,
            expected_version: Elevateo::WriteInput.integer(input.fetch("expected_version"), minimum: 1, maximum: 2_147_483_646))
          write_result(public_item("account", result))
        end
      end
    end
  end
end
