# frozen_string_literal: true

module V1
  class SendApprovalsController < SendController
    def create
      protected_write(required: Elevateo::SendAPI::Input::FIELDS, max_bytes: 4096, budget: 16_384) do
        |connection:, identity:, session:, input:, **|
        # @type var connection: Elevateo::WriteStatements
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var input: Elevateo::WriteInput::object
        payload = Elevateo::SendAPI::Input.new(draft_id: send_path(:draft_id), input: input)
        send_service(connection, session).approve(payload, session_digest: identity.digest,
          epoch: send_epoch, request_id: request.request_id)
      end
    end
  end
end
