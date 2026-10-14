# frozen_string_literal: true

module V1
  class SendIntentsController < SendController
    def show
      protected_read(allowed_query: %w[mailbox_id], budget: 16_384) do |connection:, session:, query:, **|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var session: Elevateo::auth_object
        # @type var query: Hash[String, String]
        send_service(connection, session).status(send_id: send_path(:send_id), query: query, epoch: send_epoch)
      end
    end

    # AIDEV-NOTE: S3 has no accepted SQL cancellation bridge yet; guarded writes cannot mutate or claim cancellation.
    def cancel
      protected_write(required: %w[mailbox_id], max_bytes: 4096, budget: 16_384) do |input:, **|
        # @type var input: Elevateo::WriteInput::object
        Elevateo::WriteInput.uuid(input["mailbox_id"])
        send_path(:send_id)
        raise Elevateo::SendError.new("temporarily_unavailable")
      end
    end
  end
end
