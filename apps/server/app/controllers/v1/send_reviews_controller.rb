# frozen_string_literal: true

module V1
  class SendReviewsController < SendController
    def show
      protected_read(allowed_query: %w[mailbox_id], budget: 2_097_152) do |connection:, session:, query:, **|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var session: Elevateo::auth_object
        # @type var query: Hash[String, String]
        send_service(connection, session).review(draft_id: send_path(:draft_id), query: query)
      end
    end
  end
end
