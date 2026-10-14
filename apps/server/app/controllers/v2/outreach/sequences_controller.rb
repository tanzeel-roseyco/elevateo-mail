# frozen_string_literal: true

require_relative "base_controller"
require_relative "../../../../lib/elevateo/outreach_sequence/repository"

module V2
  module Outreach
    # Inert draft metadata only. Delivery and enrollment have separate authority.
    class SequencesController < BaseController
      def show
        campaign = path_uuid(:campaign_id)
        protected_read(allowed_query: [], budget: 16_384) do |connection:, identity:, **|
          # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
          # @type var identity: Elevateo::SessionIdentity
          result = repository(connection).fetch(campaign_id: campaign,
            organization_id: identity.org_id, session_digest: identity.digest)
          raise Elevateo::CollaborationError.new("not_available") unless result
          encoded(result)
        end
      end

      def update
        campaign = path_uuid(:campaign_id)
        protected_write(required: %w[id campaign_id operation_id expected_version status timezone steps],
          max_bytes: 16_384, budget: 16_384) do |connection:, identity:, input:, **|
          # @type var connection: Elevateo::WriteStatements
          # @type var identity: Elevateo::SessionIdentity
          # @type var input: Elevateo::WriteInput::object
          raise Elevateo::CollaborationError.new("request_invalid") unless input["campaign_id"] == campaign
          draft = validated_draft(input)
          # AIDEV-NOTE: Confirm the parent campaign under the current write proof before inserting a draft.
          campaign_repository(connection, identity: identity, write: true).detail(kind: "campaign",
            organization_id: identity.org_id, id: campaign)
          result = repository(connection).save(draft, organization_id: identity.org_id,
            session_digest: identity.digest)
          write_result(result, status: draft.expected_version.nil? ? 201 : 200)
        end
      rescue Elevateo::OutreachSequence::DraftError => error
        # The existing C/D error vocabulary represents reschedule as a draft conflict.
        code = error.code == "reschedule_required" ? "draft_conflict" : error.code
        code = "internal_error" unless Elevateo::CollaborationError::ERRORS.key?(code)
        raise Elevateo::CollaborationError.new(code)
      end

      private

      def validated_draft(input)
        Elevateo::OutreachSequence::DraftInput.new(value: input)
      rescue ArgumentError
        raise Elevateo::CollaborationError.new("request_invalid")
      end

      def repository(connection)
        Elevateo::OutreachSequence::Repository.new(connection: connection)
      end
    end
  end
end
