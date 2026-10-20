# frozen_string_literal: true

require_relative "../../../lib/elevateo/thread_folder_state"

module V1
  class ThreadFoldersController < WriteController
    def update
      thread = Elevateo::WriteInput.uuid(request.path_parameters[:thread_id])
      # @type var validate: V1::WriteController::target_users
      validate = ->(input:, **) do
        # @type var input: Elevateo::WriteInput::object
        Elevateo::ThreadFolderState.validate_folder!(input)
        []
      end
      protected_write(required: Elevateo::ThreadFolderState::FOLDER_REQUIRED, guard_users: validate) do
        |connection:, identity:, session:, input:, **|
        # @type var connection: Elevateo::WriteStatements
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var input: Elevateo::WriteInput::object
        Elevateo::ThreadFolderState.new(connection: connection, identity: identity, session: session)
          .put_folder(thread_id: thread, input: input)
      end
    end
  end
end
