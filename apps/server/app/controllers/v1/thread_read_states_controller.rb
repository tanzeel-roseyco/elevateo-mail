# frozen_string_literal: true

require_relative "../../../lib/elevateo/thread_read_state"

module V1
  # AIDEV-NOTE: Read-state writes always derive the acting user from protected_write, never from input.
  class ThreadReadStatesController < WriteController
    def update
      # AIDEV-NOTE: Reading params here would parse JSON before the raw duplicate-key and byte-limit boundary.
      thread = Elevateo::WriteInput.uuid(request.path_parameters[:thread_id])
      # @type var validate: V1::WriteController::target_users
      validate = ->(input:, **) { Elevateo::ThreadReadState.validate!(input); [] }
      protected_write(required: Elevateo::ThreadReadState::REQUIRED, guard_users: validate) do
        |connection:, identity:, session:, input:, **|
        # @type var connection: Elevateo::WriteStatements
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var input: Elevateo::WriteInput::object
        Elevateo::ThreadReadState.new(connection: connection, identity: identity, session: session)
          .put(thread_id: thread, input: input)
      end
    end
  end
end
