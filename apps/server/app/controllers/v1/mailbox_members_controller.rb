# frozen_string_literal: true

module V1
  # AIDEV-NOTE: Validate syntax before authentication; guard the path target before locking its mailbox revision.
  class MailboxMembersController < WriteController
    def index
      mailbox = path_id(:mailbox_id)
      protected_read(allowed_query: %w[cursor limit], budget: Elevateo::ReadResponse::MAILBOX_BYTES) do
        |connection:, identity:, session:, query:, **|
        reader(connection, identity, session).list(mailbox_id: mailbox, query: query)
      end
    end

    def update
      mailbox, user = path_id(:mailbox_id), path_id(:user_id)
      protected_write(required: %w[expected_membership_version capabilities],
                      guard_users: ->(input:, query:) { Elevateo::MailboxMembershipInput.put(input); [user] }) do
        |connection:, identity:, session:, input:, **|
        reader(connection, identity, session).put(mailbox_id: mailbox, user_id: user, input: input,
          digest: identity.digest, presentation: read_sessions.presentation)
      end
    end

    def destroy
      mailbox, user = path_id(:mailbox_id), path_id(:user_id)
      protected_write(allowed_query: %w[expected_membership_version], body: false,
                      guard_users: ->(input:, query:) { Elevateo::MailboxMembershipInput.delete(query); [user] }) do
        |connection:, identity:, session:, query:, **|
        reader(connection, identity, session).delete(mailbox_id: mailbox, user_id: user, query: query,
          digest: identity.digest, presentation: read_sessions.presentation)
      end
    end

    private

    def path_id(key)
      value = params[key]
      raise Elevateo::CollaborationError.new("request_invalid") unless value.is_a?(String)
      Elevateo::WriteInput.uuid(value)
    end

    def reader(connection, identity, session)
      Elevateo::MailboxMemberships.new(connection: connection, identity: identity, session: session,
        cursors: Elevateo::Cursors.new(secret: read_config.cursor_signing_key))
    end
  end
end
