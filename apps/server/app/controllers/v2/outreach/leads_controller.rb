# frozen_string_literal: true

require_relative "base_controller"

module V2
  module Outreach
    class LeadsController < BaseController
      def index
        campaign = path_uuid(:campaign_id)
        protected_read(allowed_query: %w[cursor limit], budget: 262_144) do |connection:, identity:, query:, **|
          repository = campaign_repository(connection)
          repository.detail(kind: "campaign", organization_id: identity.org_id, id: campaign)
          cursor, limit = page_options(query)
          encoded(public_page("lead", repository.page(kind: "lead", organization_id: identity.org_id,
            campaign_id: campaign, cursor: cursor, limit: limit)))
        end
      end

      def show
        id, campaign = path_uuid(:lead_id), path_uuid(:campaign_id)
        protected_read(allowed_query: [], budget: 4096) do |connection:, identity:, **|
          repository = campaign_repository(connection)
          item = repository.detail(kind: "lead", organization_id: identity.org_id, id: id)
          raise Elevateo::CollaborationError.new("not_available") unless item.fetch("campaign_id") == campaign
          encoded(public_detail("lead", item))
        end
      end

      def create
        campaign = path_uuid(:campaign_id)
        protected_write(required: %w[id operation_id email], budget: 4096) do
          |connection:, identity:, input:, **|
          repository = campaign_repository(connection)
          repository.detail(kind: "campaign", organization_id: identity.org_id, id: campaign)
          payload = Elevateo::Campaigns::Input.new(kind: "lead", value: {
            "id" => input.fetch("id"), "operation_id" => input.fetch("operation_id"),
            "campaign_id" => campaign, "email" => input.fetch("email"), "consent_status" => "unknown",
            "consent_recorded_at" => nil, "consent_source" => nil, "suppressed" => false
          })
          repository.save(payload, organization_id: identity.org_id)
          write_result(public_item("lead", repository.detail(kind: "lead",
            organization_id: identity.org_id, id: payload.id)), status: 201)
        end
      end

      def update
        campaign, id = path_uuid(:campaign_id), path_uuid(:lead_id)
        protected_write(required: %w[operation_id expected_version email], budget: 4096) do
          |connection:, identity:, input:, **|
          repository = campaign_repository(connection)
          old = repository.detail(kind: "lead", organization_id: identity.org_id, id: id)
          raise Elevateo::CollaborationError.new("not_available") unless old.fetch("campaign_id") == campaign
          # AIDEV-NOTE: An address edit invalidates prior consent; local suppression is never cleared by replace.
          payload = Elevateo::Campaigns::Input.new(kind: "lead", value: {
            "id" => id, "operation_id" => input.fetch("operation_id"), "campaign_id" => campaign,
            "email" => input.fetch("email"), "consent_status" => "unknown", "consent_recorded_at" => nil,
            "consent_source" => nil, "suppressed" => false
          })
          result = repository.replace(payload, organization_id: identity.org_id,
            expected_version: Elevateo::WriteInput.integer(input.fetch("expected_version"), minimum: 1, maximum: 2_147_483_646),
            actor_id: identity.user_id, intent: input.merge("campaign_id" => campaign))
          write_result(public_item("lead", result))
        end
      end
      def record_consent
        campaign, id = path_uuid(:campaign_id), path_uuid(:lead_id)
        protected_write(required: %w[operation_id expected_version source observed_at attested], budget: 4096) do
          |connection:, identity:, input:, **|
          Elevateo::WriteInput.invalid! unless input.fetch("attested") == true
          repository = campaign_repository(connection)
          old = repository.detail(kind: "lead", organization_id: identity.org_id, id: id)
          raise Elevateo::CollaborationError.new("not_available") unless old.fetch("campaign_id") == campaign
          payload = Elevateo::Campaigns::Input.new(kind: "lead", value: {
            "id" => id, "operation_id" => input.fetch("operation_id"), "campaign_id" => campaign,
            "email" => old.fetch("email"), "consent_status" => "granted",
            "consent_recorded_at" => input.fetch("observed_at"), "consent_source" => input.fetch("source"),
            "suppressed" => false
          })
          result = repository.replace(payload, organization_id: identity.org_id,
            expected_version: Elevateo::WriteInput.integer(input.fetch("expected_version"), minimum: 1, maximum: 2_147_483_646),
            actor_id: identity.user_id, intent: input.merge("campaign_id" => campaign))
          write_result(public_item("lead", result))
        end
      end

      def withdraw_consent
        campaign, id = path_uuid(:campaign_id), path_uuid(:lead_id)
        protected_write(required: %w[operation_id expected_version], budget: 4096) do
          |connection:, identity:, input:, **|
          repository = campaign_repository(connection)
          old = repository.detail(kind: "lead", organization_id: identity.org_id, id: id)
          raise Elevateo::CollaborationError.new("not_available") unless old.fetch("campaign_id") == campaign
          payload = Elevateo::Campaigns::Input.new(kind: "lead", value: {
            "id" => id, "operation_id" => input.fetch("operation_id"), "campaign_id" => campaign,
            "email" => old.fetch("email"), "consent_status" => "withdrawn",
            "consent_recorded_at" => nil, "consent_source" => nil, "suppressed" => false
          })
          result = repository.replace(payload, organization_id: identity.org_id,
            expected_version: Elevateo::WriteInput.integer(input.fetch("expected_version"), minimum: 1, maximum: 2_147_483_646),
            actor_id: identity.user_id, intent: input.merge("campaign_id" => campaign))
          write_result(public_item("lead", result))
        end
      end

      def suppress
        campaign, id = path_uuid(:campaign_id), path_uuid(:lead_id)
        protected_write(required: %w[reason], budget: 4096) do |connection:, identity:, input:, **|
          repository = campaign_repository(connection)
          old = repository.detail(kind: "lead", organization_id: identity.org_id, id: id)
          raise Elevateo::CollaborationError.new("not_available") unless old.fetch("campaign_id") == campaign
          repository.suppress(organization_id: identity.org_id, email: old.fetch("email"), reason: input.fetch("reason"))
          write_result(public_item("lead", repository.detail(kind: "lead",
            organization_id: identity.org_id, id: id)))
        end
      end
    end
  end
end
