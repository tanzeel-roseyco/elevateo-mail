# frozen_string_literal: true

require_relative "base_controller"
require_relative "../../../../lib/elevateo/campaigns/runs"
require_relative "../../../../lib/elevateo/send_worker/control"

module V2
  module Outreach
    # AIDEV-NOTE: Run writes reuse protected tenant/session/CSRF transactions; no provider call runs in the API.
    class RunsController < BaseController
      rescue_from Elevateo::SendError, with: :run_send_error
      def index
        campaign = path_uuid(:campaign_id)
        protected_read(allowed_query: %w[cursor], budget: 2_097_152) do |connection:, identity:, session:, query:, **|
          # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
          # @type var identity: Elevateo::SessionIdentity
          # @type var session: Elevateo::auth_object
          # @type var query: Hash[String, String]
          campaign_repository(connection, identity: identity, write: false)
          cursor = query["cursor"] ? Elevateo::WriteInput.uuid(query["cursor"]) : nil
          JSON.generate(run_service(connection, session, identity).list(campaign, cursor: cursor))
        end
      end

      def show
        campaign, id = path_uuid(:campaign_id), path_uuid(:run_id)
        protected_read(allowed_query: [], budget: 262_144) do |connection:, identity:, session:, **|
          # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
          # @type var identity: Elevateo::SessionIdentity
          # @type var session: Elevateo::auth_object
          campaign_repository(connection, identity: identity, write: false)
          encoded(run_service(connection, session, identity).detail(campaign, id))
        end
      end

      def create
        campaign = path_uuid(:campaign_id)
        protected_write(required: Elevateo::Campaigns::RunInput::FIELDS, max_bytes: 262_144, budget: 262_144) do |connection:, identity:, session:, input:, **|
          # @type var connection: Elevateo::WriteStatements
          # @type var identity: Elevateo::SessionIdentity
          # @type var session: Elevateo::auth_object
          # @type var input: Elevateo::WriteInput::object
          payload = Elevateo::Campaigns::RunInput.new(input)
          campaign_repository(connection, identity: identity, write: true)
          request_id = request.request_id
          raise Elevateo::CollaborationError.new("request_invalid") unless request_id
          write_result(run_service(connection, session, identity).create(campaign, payload, request_id: request_id), status: 201)
        end
      end

      def cancel
        campaign, id = path_uuid(:campaign_id), path_uuid(:run_id)
        protected_write(required: %w[operation_id], max_bytes: 262_144, budget: 262_144) do |connection:, identity:, session:, input:, **|
          # @type var connection: Elevateo::WriteStatements
          # @type var identity: Elevateo::SessionIdentity
          # @type var session: Elevateo::auth_object
          # @type var input: Elevateo::WriteInput::object
          Elevateo::WriteInput.uuid(input["operation_id"])
          campaign_repository(connection, identity: identity, write: true)
          write_result(run_service(connection, session, identity).cancel(campaign, id))
        end
      end

      private

      def run_send_error(_error)
        api_error(Elevateo::CollaborationError.new("temporarily_unavailable"))
      end

      def run_service(connection, session, identity)
        raise Elevateo::CollaborationError.new("temporarily_unavailable") unless read_config.send_api_enabled
        epoch = read_config.send_control_path.empty? ? nil : Elevateo::SendWorker::Control.new(path: read_config.send_control_path).read.epoch
        Elevateo::Campaigns::Runs.new(connection: connection, session: session, identity: identity,
          outbound_mode: read_config.outbound_mode, epoch: epoch)
      end
    end
  end
end
