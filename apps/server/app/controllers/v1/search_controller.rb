# frozen_string_literal: true

module V1
  # AIDEV-NOTE: The shared protected read serializes inside the authorization snapshot; search never marks read.
  class SearchController < WriteController
    def index
      protected_read(allowed_query: %w[q mailbox_id cursor limit], budget: Elevateo::ReadResponse::THREAD_BYTES) do
        |connection:, identity:, session:, query:, **|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var query: Hash[String, String]
        Elevateo::MailSearch.new(connection: connection, identity: identity, session: session,
          cursors: Elevateo::Cursors.new(secret: read_config.cursor_signing_key)).search(query: query)
      end
    end
  end
end
