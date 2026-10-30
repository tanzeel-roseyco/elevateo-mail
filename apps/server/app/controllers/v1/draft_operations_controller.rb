# frozen_string_literal: true

module V1
  # AIDEV-NOTE: Lookup is a metadata-only snapshot; an unknown operation never asserts that a write did not commit.
  class DraftOperationsController < WriteController
    def show
      protected_read(allowed_query: %w[mailbox_id draft_id], budget: 4096) do
        |connection:, session:, query:, **|
        operation = params[:operation_id]
        Elevateo::WriteInput.invalid! unless operation.is_a?(String)
        Elevateo::DraftOperations.new(connection: connection, session: session).lookup(operation_id: operation, query: query)
      end
    end
  end
end
