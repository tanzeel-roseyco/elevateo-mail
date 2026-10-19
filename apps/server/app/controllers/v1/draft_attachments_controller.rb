# frozen_string_literal: true

require_relative "write_controller"
require_relative "../../../lib/elevateo/draft_attachments"
require_relative "../../../lib/elevateo/draft_attachment_gateway"

module V1
  # AIDEV-NOTE: Reserve and finalize use separate fresh guarded writes; the gateway exchange owns no database lease.
  class DraftAttachmentsController < WriteController
    def index
      draft = Elevateo::WriteInput.uuid(params[:draft_id])
      protected_read(allowed_query: %w[mailbox_id], budget: 4096) do |connection:, session:, query:, **|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var session: Elevateo::auth_object
        # @type var query: Hash[String, String]
        mailbox = Elevateo::WriteInput.uuid(query["mailbox_id"])
        JSON.generate(Elevateo::DraftAttachments.new(connection: connection, session: session).list(mailbox, draft))
      end
    end

    def create
      Elevateo::WriteInput.transport!(origin: request.headers["Origin"], expected_origin: read_config.browser_origin,
        content_type: request.get_header("CONTENT_TYPE"), content_encoding: request.get_header("HTTP_CONTENT_ENCODING"), body: true)
      api_query(allowed: [])
      input = Elevateo::WriteInput.body(Elevateo::WriteInput.read(request.body, maximum: 1_402_200),
        required: Elevateo::DraftAttachmentPayload::FIELDS)
      draft = Elevateo::WriteInput.uuid(params[:draft_id])
      payload = Elevateo::DraftAttachmentPayload.new(draft_id: draft, input: input)
      context, version = read_context(required: true)
      csrf = request_csrf
      Elevateo::WriteInput.invalid! unless csrf.is_a?(String) && /\A[A-Za-z0-9_-]{32,512}\z/.match?(csrf)
      first = stage_transaction(context, version, csrf) do |service, identity, session|
        reservation = service.reserve(payload, identity.digest)
        token = reservation["reservation_token"]
        generation = identity.metadata["authorization_generation"]
        context_id = session["context_id"]
        raise Elevateo::CollaborationError.new("internal_error") unless token.is_a?(String) &&
          generation.is_a?(Integer) && context_id.is_a?(String)
        # @type var fields: Hash[String, String | Integer]
        fields = { "operation" => "draft_attachment.stage", "audience" => "attachment_gateway.v1",
          "organization_id" => identity.org_id, "mailbox_id" => payload.mailbox_id, "draft_id" => draft,
          "operation_id" => payload.operation_id, "reservation_token" => token, "session_digest" => identity.digest,
          "expected_user_id" => identity.user_id, "expected_auth_session_id" => identity.auth_session_id,
          "context_id" => context_id, "authorization_generation" => generation,
          "mode" => reservation["stage_state"] == "reserved" ? "put" : "reconcile",
          "expires_at" => Time.now.to_i + 30 }
        # AIDEV-NOTE: Only bounded private metadata crosses the commit; content is attached after the SQL transaction.
        Elevateo::WriteResponse.new(json: JSON.generate(fields), status: 200)
      end
      fields = JSON.parse(first.json)
      fields["content_base64"] = Base64.strict_encode64(payload.bytes)
      Elevateo::DraftAttachmentGateway.new(config: read_config).stage(fields: fields)
      token = fields.fetch("reservation_token")
      raise Elevateo::CollaborationError.new("internal_error") unless token.is_a?(String)
      final = stage_transaction(context, version, csrf) do |service, identity, _session|
        Elevateo::WriteResponse.new(json: JSON.generate(service.finalize(payload, identity.digest, token)), status: 200)
      end
      api_serialized(final.json, status: final.status, limit: 4096)
    end

    def destroy
      draft = Elevateo::WriteInput.uuid(params[:draft_id])
      attachment = Elevateo::WriteInput.uuid(params[:attachment_id])
      protected_write(allowed_query: %w[mailbox_id], body: false) do |connection:, identity:, session:, query:, **|
        # @type var connection: Elevateo::WriteStatements
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var query: Hash[String, String]
        mailbox = Elevateo::WriteInput.uuid(query["mailbox_id"])
        result = Elevateo::DraftAttachments.new(connection: connection, session: session).remove(identity.digest, mailbox, draft, attachment)
        Elevateo::WriteResponse.new(json: JSON.generate(result), status: 200)
      end
    end

    private

    def stage_transaction(context, version, csrf)
      identity = read_sessions.authenticate(cookie: session_cookie, deadline: api_deadline)
      Elevateo::SessionWrites.new(sessions: read_sessions).transaction(identity, context: context, version: version,
        csrf: csrf, guard_users: [], budget: 4096, deadline: api_deadline) do |connection:, session:|
        # @type var connection: Elevateo::WriteStatements
        # @type var session: Elevateo::auth_object
        service = Elevateo::DraftAttachments.new(connection: connection, session: session)
        yield(service, identity, session)
      end
    end
  end
end
