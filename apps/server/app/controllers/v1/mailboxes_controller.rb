# frozen_string_literal: true

require_relative "../../../lib/elevateo/mailbox_reads"

module V1
  # AIDEV-NOTE: The shared wrapper owns Auth, snapshot, deadlines, headers and the post-materialization touch.
  class MailboxesController < ReadController
    def index
      protected_read(
        allowed_query: %w[cursor limit], budget: Elevateo::ReadResponse::MAILBOX_BYTES
      ) do |connection:, identity:, session:, query:, **|
        reader = Elevateo::MailboxReads.new(cursor: Elevateo::Cursors.new(secret: read_config.cursor_signing_key))
        reader.call(connection: connection, identity: identity, session: session, query: query)
      end
    rescue Elevateo::MailboxReads::InvalidQuery
      raise Elevateo::AuthError.invalid
    end
  end
end
