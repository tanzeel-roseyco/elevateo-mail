# frozen_string_literal: true

require_relative "../v1/write_controller"
require_relative "../../../lib/elevateo/inbound/postgres_store"

module V2
  # AIDEV-NOTE: Test-only route still uses protected session/CSRF guard and PostgreSQL mailbox RLS.
  class FakeInboundController < V1::WriteController
    REQUIRED = %w[actor_id mailbox_id provider_account_id provider_event_id raw_mime].freeze

    def create
      raise Elevateo::AuthError.new("not_available", status: 404) unless ENV["RAILS_ENV"] == "test" &&
        ENV["ELEVATEO_FAKE_INBOUND_ENABLED"] == "1"

      protected_write(required: REQUIRED, max_bytes: 1_500_000, budget: 4096,
        guard_users: ->(input:, query: _query) {
          # @type var input: Elevateo::WriteInput::object
          [Elevateo::WriteInput.uuid(input["actor_id"])]
        }) do
        |connection:, identity:, input:, **|
        # @type var connection: Elevateo::WriteStatements
        # @type var identity: Elevateo::SessionIdentity
        # @type var input: Elevateo::WriteInput::object
        raise Elevateo::CollaborationError.new("not_available") unless input["actor_id"] == identity.user_id
        mailbox = Elevateo::WriteInput.uuid(input["mailbox_id"])
        store = Elevateo::Inbound::PostgresStore.new(connection: connection,
          session_digest: identity.digest, actor_id: identity.user_id)
        raise Elevateo::CollaborationError.new("not_available") unless store.authorized?(
          organization_id: identity.org_id, mailbox_id: mailbox)

        account_id = input["provider_account_id"]
        event_id = input["provider_event_id"]
        raw_mime = input["raw_mime"]
        # AIDEV-NOTE: JSON field presence does not establish scalar types; narrow before the MIME boundary.
        unless account_id.is_a?(String) && event_id.is_a?(String) && raw_mime.is_a?(String)
          raise Elevateo::CollaborationError.new("request_invalid")
        end
        result = Elevateo::Inbound::FakeIngress.new(store: store).ingest(
          organization_id: identity.org_id, mailbox_id: mailbox, authorized_mailbox_ids: [mailbox],
          provider_account_id: account_id, provider_event_id: event_id, raw_mime: raw_mime)
        payload = result.merge("simulated" => true)
        Elevateo::WriteResponse.new(json: JSON.generate(payload),
          status: result.fetch("result") == "created" ? 201 : 200)
      end
    rescue Elevateo::Inbound::Rejected => error
      code = error.code == "replay_mismatch" ? "inbound_replay_mismatch" : "request_invalid"
      api_json({ "code" => code, "message" => "Inbound request rejected", "request_id" => request.request_id },
        status: code == "request_invalid" ? 400 : 409, limit: 4096)
    end
  end
end
