# frozen_string_literal: true

module V1
  # AIDEV-NOTE: Render the reader's bytes unchanged; the shared wrapper owns authorization, deadlines and touch.
  class ThreadsController < ReadController
    def index
      protected_read(allowed_query: %w[cursor limit filter], budget: Elevateo::ReadResponse::THREAD_BYTES) do
        |connection:, identity:, session:, query:, **|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var query: Hash[String, String]
        reader(connection, identity, session).list(mailbox_id: path_id(:mailbox_id), query: query)
      end
    rescue Elevateo::ThreadReads::NotAvailable
      raise Elevateo::AuthError.new("not_available", status: 404)
    rescue Elevateo::ThreadReads::InvalidQuery
      raise Elevateo::AuthError.invalid
    end

    def show
      protected_read(allowed_query: %w[mailbox_id cursor limit], budget: Elevateo::ReadResponse::MESSAGE_BYTES) do
        |connection:, identity:, session:, query:, **|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var query: Hash[String, String]
        reader(connection, identity, session).detail(thread_id: path_id(:thread_id), query: query)
      end
    rescue Elevateo::ThreadReads::NotAvailable
      raise Elevateo::AuthError.new("not_available", status: 404)
    rescue Elevateo::ThreadReads::InvalidQuery
      raise Elevateo::AuthError.invalid
    end

    private

    def path_id(key)
      # AIDEV-NOTE: Rails parameters may be arrays or objects; keep UUID validation in the domain reader.
      value = params[key]
      raise Elevateo::ThreadReads::InvalidQuery, "invalid request" unless value.is_a?(String)
      value
    end

    def reader(connection, identity, session)
      Elevateo::ThreadReads.new(connection: connection, identity: identity, session: session,
                               cursors: Elevateo::Cursors.new(secret: read_config.cursor_signing_key))
    end
  end
end
