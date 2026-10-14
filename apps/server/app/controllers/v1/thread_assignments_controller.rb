# frozen_string_literal: true

require_relative "../../../lib/elevateo/thread_assignment"

module V1
  # AIDEV-NOTE: GET retains the existing read snapshot; PUT guards both the actor and the proposed assignee.
  class ThreadAssignmentsController < WriteController
    def show
      thread = Elevateo::WriteInput.uuid(request.path_parameters[:thread_id])
      protected_read(allowed_query: ["mailbox_id"], budget: 4096) do |connection:, identity:, session:, query:, **|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var query: Hash[String, String]
        Elevateo::ThreadAssignment.new(connection: connection, identity: identity, session: session)
          .get(thread_id: thread, query: query)
      end
    end

    def update
      # AIDEV-NOTE: Read only route parameters until protected_write validates the raw JSON body.
      thread = Elevateo::WriteInput.uuid(request.path_parameters[:thread_id])
      # @type var guards: V1::WriteController::target_users
      guards = ->(input:, **) do
        # @type var input: Elevateo::WriteInput::object
        Elevateo::ThreadAssignment.validate!(input)
        target = input["assignee_id"]
        target.nil? ? [] : [Elevateo::WriteInput.uuid(target)]
      end
      protected_write(required: Elevateo::ThreadAssignment::REQUIRED, guard_users: guards) do
        |connection:, identity:, session:, input:, **|
        # @type var connection: Elevateo::WriteStatements
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var input: Elevateo::WriteInput::object
        Elevateo::ThreadAssignment.new(connection: connection, identity: identity, session: session)
          .put(thread_id: thread, input: input)
      end
    end
  end
end
