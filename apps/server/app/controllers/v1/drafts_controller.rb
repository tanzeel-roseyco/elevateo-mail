# frozen_string_literal: true

module V1
  # AIDEV-NOTE: Reuse shared protected snapshots/guarded writes; the domain never starts its own transaction.
  class DraftsController < WriteController
    def index
      protected_read(allowed_query: %w[mailbox_id cursor limit], budget: Elevateo::Drafts::SUMMARY_BYTES) do
        |connection:, identity:, session:, query:, **|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var query: Hash[String, String]
        reader(connection, identity, session).list(query: query)
      end
    end

    def show
      protected_read(allowed_query: %w[mailbox_id], budget: Elevateo::Drafts::FULL_BYTES) do
        |connection:, identity:, session:, query:, **|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var query: Hash[String, String]
        reader(connection, identity, session).detail(draft_id: path_id, query: query)
      end
    end

    def update
      protected_write(required: Elevateo::Drafts::Payload::FIELDS, max_bytes: 1_048_576, budget: 4096) do
        |connection:, identity:, session:, input:, **|
        # @type var connection: Elevateo::WriteStatements
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var input: Elevateo::WriteInput::object
        payload = Elevateo::Drafts::Payload.new(draft_id: path_id, input: input)
        Elevateo::DraftOperations.new(connection: connection, session: session).save(payload,
          session_digest: identity.digest, request_id: request.request_id)
      end
    end

    private

    def path_id
      value = params[:draft_id]
      Elevateo::WriteInput.invalid! unless value.is_a?(String)
      value
    end

    def reader(connection, identity, session)
      Elevateo::Drafts.new(connection: connection, identity: identity, session: session,
        cursors: Elevateo::Cursors.new(secret: read_config.cursor_signing_key))
    end
  end
end
