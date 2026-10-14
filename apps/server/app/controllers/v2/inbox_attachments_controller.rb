# frozen_string_literal: true

require_relative "../v1/write_controller"
require_relative "../../../lib/elevateo/attachments_repository"
require_relative "../../../lib/elevateo/thread_reads"

module V2
  # Candidate read adapter; central registry keeps it inactive until private byte proxy and fleet proof exist.
  class InboxAttachmentsController < V1::WriteController
    class NoStorage
      def put(_key, _bytes, content_type:)
        raise Elevateo::Attachments::Invalid
      end

      def get(_key)
        raise Elevateo::Attachments::NotAvailable
      end
    end

    def index
      mailbox, thread, message = %i[mailbox_id thread_id message_id].map { |key| path_uuid(key) }
      protected_read(allowed_query: %w[cursor limit], budget: 262_144) do |connection:, identity:, session:, query:, **|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::ReadResponse::item
        # @type var query: Hash[String, String]
        limit = query.fetch("limit", "50")
        unless limit.is_a?(String) && /\A[1-9][0-9]?\z/.match?(limit) && limit.to_i.between?(1, 50)
          raise Elevateo::CollaborationError.new("request_invalid")
        end
        cursor = query["cursor"]
        cursor = Elevateo::WriteInput.uuid(cursor) if cursor
        reader = Elevateo::ThreadReads.new(connection: connection, identity: identity, session: session,
          cursors: Elevateo::Cursors.new(secret: read_config.cursor_signing_key))
        authorize = ->(organization_id:, mailbox_id:, thread_id:, message_id:, capability:) {
          raise Elevateo::CollaborationError.new("not_available") unless capability == :read &&
            organization_id == identity.org_id && mailbox_id == mailbox && thread_id == thread && message_id == message
          reader.direct_message(thread_id: thread, message_id: message, query: { "mailbox_id" => mailbox })
          nil
        }
        service = Elevateo::Attachments::Service.new(repository: Elevateo::Attachments::Repository.new(connection: connection),
          storage: NoStorage.new, authorize: authorize)
        JSON.generate(service.list(organization_id: identity.org_id, mailbox_id: mailbox,
          thread_id: thread, message_id: message, cursor: cursor, limit: limit.to_i))
      end
    rescue Elevateo::Attachments::Invalid, Elevateo::ThreadReads::InvalidQuery
      raise Elevateo::CollaborationError.new("request_invalid")
    rescue Elevateo::Attachments::NotAvailable, Elevateo::ThreadReads::NotAvailable
      raise Elevateo::CollaborationError.new("not_available")
    end

    private

    def path_uuid(key)
      Elevateo::WriteInput.uuid(request.path_parameters.fetch(key))
    end
  end
end
