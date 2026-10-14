# frozen_string_literal: true

module V1
  class SendIntentsController < SendController
    def show
      send_read_target(:send_id)
      protected_read(allowed_query: %w[mailbox_id], budget: 16_384) do |connection:, session:, query:, **|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var session: Elevateo::auth_object
        # @type var query: Hash[String, String]
        send_service(connection, session).status(send_id: send_path(:send_id), query: query, epoch: send_epoch)
      end
    end

    # AIDEV-NOTE: Cancellation uses the same protected transaction as approval; SQL owns the job lock and race outcome.
    def cancel
      protected_write(required: %w[mailbox_id], max_bytes: 4096, budget: 16_384,
        guard_users: ->(input:, query:) {
          # @type var input: Elevateo::WriteInput::object
          # @type var query: Hash[String, String]
          Elevateo::WriteInput.invalid! unless query.empty?
          Elevateo::WriteInput.uuid(input["mailbox_id"])
          send_path(:send_id)
          []
        }) do |connection:, identity:, session:, input:, **|
        # @type var connection: Elevateo::WriteStatements
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var input: Elevateo::WriteInput::object
        mailbox_id = Elevateo::WriteInput.uuid(input.fetch("mailbox_id"))
        send_service(connection, session).cancel(send_id: send_path(:send_id), mailbox_id: mailbox_id,
          session_digest: identity.digest, epoch: send_epoch)
      end
    end
  end
end
