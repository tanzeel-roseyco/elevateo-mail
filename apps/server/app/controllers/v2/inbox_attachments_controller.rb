# frozen_string_literal: true

require_relative "../v1/write_controller"
require_relative "../../../lib/elevateo/attachments_repository"
require_relative "../../../lib/elevateo/thread_reads"
require_relative "../../../lib/elevateo/attachments_download"
require_relative "../../../lib/elevateo/attachment_gateway_client"
require "securerandom"

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
      mailbox = path_uuid(:mailbox_id)
      thread = path_uuid(:thread_id)
      message = path_uuid(:message_id)
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
        # @type var authorize: Elevateo::Attachments::_Authorization
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

    # AIDEV-NOTE: The two read snapshots finish before and after the private request; no SQL frame spans network bytes.
    def content
      mailbox = path_uuid(:mailbox_id)
      thread = path_uuid(:thread_id)
      message = path_uuid(:message_id)
      attachment = path_uuid(:attachment_id)
      raise Elevateo::AuthError.invalid unless api_query(allowed: []).empty? && request.body.read(1).to_s.empty?
      context, version = read_context(required: true)
      request_id = SecureRandom.uuid
      expiry = Time.now.to_i + 10
      # @type var snapshot: Elevateo::Attachments::_DownloadSnapshot
      snapshot = -> { download_snapshot(mailbox, thread, message, attachment, context, version, request_id, expiry) }
      client = Elevateo::AttachmentGatewayClient.new(config: read_config)
      bytes = Elevateo::Attachments::DownloadService.new(snapshot: snapshot, gateway: client).fetch
      api_deadline.check!
      send_data bytes, type: "application/octet-stream", disposition: "attachment", filename: "attachment"
      api_security_headers
      response.headers["Content-Disposition"] = 'attachment; filename="attachment"'
      response.headers["Content-Length"] = bytes.bytesize.to_s
    rescue Elevateo::Attachments::Held
      api_json({ "code" => "attachment_held", "message" => "Attachment is not ready",
        "request_id" => request_id },
        status: 423, limit: 4096)
    rescue Elevateo::Attachments::Invalid, Elevateo::ThreadReads::InvalidQuery
      raise Elevateo::CollaborationError.new("request_invalid")
    rescue Elevateo::Attachments::NotAvailable, Elevateo::ThreadReads::NotAvailable,
      Elevateo::AttachmentGatewayClient::NotAvailable
      raise Elevateo::CollaborationError.new("not_available")
    rescue Elevateo::Attachments::DownloadService::Unavailable, Elevateo::AttachmentGatewayClient::Unavailable
      raise Elevateo::CollaborationError.new("temporarily_unavailable")
    end

    private

    def download_snapshot(mailbox, thread, message, attachment, context, version, request_id, expiry)
      identity = read_sessions.authenticate(cookie: session_cookie, deadline: api_deadline)
      principal = Elevateo::Tenancy::Principal.new(user_id: identity.user_id, org_id: identity.org_id)
      result = ActiveRecord::Base.connection_pool.with_connection do |connection|
        Elevateo::Tenancy.with_context(principal, connection: connection, read_only: true) do
          session = read_sessions.authorize(identity, context: context, version: version,
            deadline: api_deadline, connection: connection)
          reader = Elevateo::ThreadReads.new(connection: connection, identity: identity, session: session,
            cursors: Elevateo::Cursors.new(secret: read_config.cursor_signing_key))
          reader.direct_message(thread_id: thread, message_id: message, query: { "mailbox_id" => mailbox })
          row = Elevateo::Attachments::Repository.new(connection: connection).find(
            organization_id: identity.org_id, mailbox_id: mailbox, thread_id: thread, message_id: message, id: attachment)
          raise Elevateo::Attachments::NotAvailable unless row
          status = row.fetch("scan_status")
          raise Elevateo::Attachments::Held unless status == "clean"
          size = row.fetch("byte_size")
          raise Elevateo::Attachments::NotAvailable unless size.is_a?(Integer) && size.between?(1, Elevateo::Attachments::MAX_BYTES)
          row_id, filename, content_type = row.values_at("id", "filename", "content_type")
          raise Elevateo::Attachments::NotAvailable unless row_id == attachment && filename.is_a?(String) &&
            content_type.is_a?(String)
          generation = identity.metadata["authorization_generation"]
          context_id, auth_version = session.values_at("context_id", "authorization_version")
          raise Elevateo::AuthError.new unless generation.is_a?(Integer) && generation >= 0 &&
            context_id.is_a?(String) && auth_version.is_a?(String)
          fields = { "operation" => "attachment.read", "audience" => "attachment_gateway.v1",
            "attachment_id" => attachment, "organization_id" => identity.org_id,
            "mailbox_id" => mailbox, "thread_id" => thread, "message_id" => message,
            "session_digest" => identity.digest, "expected_user_id" => identity.user_id,
            "expected_auth_session_id" => identity.auth_session_id, "context_id" => context_id,
            "authorization_version" => auth_version, "context_uuid" => context_id,
            "authorization_generation" => generation, "expires_at" => expiry, "request_id" => request_id }
          binding = { "id" => row_id, "filename" => filename,
            "content_type" => content_type, "byte_size" => size, "scan_status" => status }
          { fields: fields, binding: binding, byte_size: size }
        end
      end
      raise Elevateo::Attachments::NotAvailable unless result
      result
    end

    def path_uuid(key)
      Elevateo::WriteInput.uuid(request.path_parameters.fetch(key))
    end
  end
end
