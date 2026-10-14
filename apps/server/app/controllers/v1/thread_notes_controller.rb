# frozen_string_literal: true

require_relative "../../../lib/elevateo/thread_notes"

module V1
  # AIDEV-NOTE: Note pages and POSTs have different byte budgets; both render already-serialized whole entries.
  class ThreadNotesController < WriteController
    def index
      thread = Elevateo::WriteInput.uuid(request.path_parameters[:thread_id])
      protected_read(allowed_query: %w[mailbox_id cursor limit], budget: 262_144) do
        |connection:, identity:, session:, query:, **|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var query: Hash[String, String]
        notes(connection, identity, session).list(thread_id: thread, query: query)
      end
    end

    def create
      # AIDEV-NOTE: Read only route parameters until protected_write validates the raw JSON body.
      thread = Elevateo::WriteInput.uuid(request.path_parameters[:thread_id])
      # @type var validate: V1::WriteController::target_users
      validate = ->(input:, **) { Elevateo::ThreadNotes.validate!(input); [] }
      protected_write(required: Elevateo::ThreadNotes::REQUIRED, max_bytes: 65_536, budget: 65_536,
        guard_users: validate) do |connection:, identity:, session:, input:, **|
        # @type var connection: Elevateo::WriteStatements
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var input: Elevateo::WriteInput::object
        notes(connection, identity, session).post(thread_id: thread, input: input)
      end
    end

    private

    def notes(connection, identity, session)
      Elevateo::ThreadNotes.new(connection: connection, identity: identity, session: session,
        cursors: Elevateo::Cursors.new(secret: read_config.cursor_signing_key))
    end
  end
end
