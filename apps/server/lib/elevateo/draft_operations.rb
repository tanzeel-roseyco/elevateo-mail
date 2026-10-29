# frozen_string_literal: true

require_relative "drafts"
require_relative "write_response"

module Elevateo
  # AIDEV-NOTE: Only terminal draft 409s return WriteResponse to commit; boundary failures raise and roll back.
  class DraftOperations
    SAVE_SQL = <<~SQL.freeze
      SELECT app.save_draft($1::text, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::integer,
        $7::text, $8::jsonb, $9::text, $10::uuid)::text AS result
    SQL
    LOOKUP_SQL = "SELECT app.draft_operation($1::uuid, $2::uuid, $3::uuid)::text AS result"

    def initialize(connection:, session:)
      @database = Drafts::Database.new(connection: connection, session: session)
    end

    def save(payload, session_digest:, request_id:)
      result = @database.object(SAVE_SQL, [session_digest, payload.mailbox_id, payload.draft_id, payload.operation_id, payload.digest,
        payload.expected_version.to_s, payload.subject, JSON.generate(payload.recipients), payload.body_text, payload.reply_id])
      code = result["code"]
      if code
        unless code.is_a?(String) && result.keys == ["code"] &&
               %w[draft_conflict draft_consumed operation_mismatch request_invalid unauthenticated not_available
                  context_changed temporarily_unavailable].include?(code)
          raise ReadResponse::Invalid, "invalid draft outcome"
        end
        error = CollaborationError.new(code)
        raise error unless %w[draft_conflict draft_consumed operation_mismatch].include?(code)
        return WriteResponse.new(json: @database.encode(error.body(request_id), budget: 4096), status: error.status)
      end
      unless result.keys.sort == %w[draft_id operation_id state version] && result["draft_id"] == payload.draft_id &&
             result["operation_id"] == payload.operation_id && result["state"] == "editable" &&
             ThreadProjection.integer(result["version"], 2_147_483_647).positive?
        raise ReadResponse::Invalid, "invalid draft outcome"
      end
      WriteResponse.new(json: @database.encode(result, budget: 4096), status: 200)
    rescue ReadResponse::Overflow
      raise CollaborationError.new("internal_error")
    end

    def lookup(operation_id:, query:)
      WriteInput.invalid! unless query.keys.sort == %w[draft_id mailbox_id]
      mailbox = WriteInput.uuid(query["mailbox_id"])
      draft = WriteInput.uuid(query["draft_id"])
      operation = WriteInput.uuid(operation_id)
      result = @database.object(LOOKUP_SQL, [mailbox, draft, operation])
      # AIDEV-NOTE: A recorded conflict legitimately contains code alongside metadata; only a lone code is an error.
      if result.keys == ["code"]
        raise ReadResponse::Invalid, "invalid draft outcome" unless result["code"] == "not_available"
        raise CollaborationError.new("not_available")
      end
      validate_lookup(result, operation, mailbox, draft)
      @database.encode(@database.envelope.merge("operation" => result), budget: 4096)
    end

    private

    def validate_lookup(result, operation, mailbox, draft)
      base = %w[operation_id mailbox_id draft_id outcome]
      case result["outcome"]
      when "unknown", "expired" then fields = base
      when "applied" then fields = base + %w[expected_version version state recorded_at detail_expires_at]
      when "conflict" then fields = base + %w[code expected_version current_version state recorded_at detail_expires_at]
      else raise ReadResponse::Invalid, "invalid draft outcome"
      end
      unless result.keys.sort == fields.sort && result["operation_id"] == operation &&
             result["mailbox_id"] == mailbox && result["draft_id"] == draft
        raise ReadResponse::Invalid, "invalid draft outcome"
      end
      return if %w[unknown expired].include?(result["outcome"])
      ThreadProjection.integer(result["expected_version"], 2_147_483_647)
      Drafts::Projection.timestamp(result["recorded_at"])
      Drafts::Projection.timestamp(result["detail_expires_at"])
      if result["outcome"] == "applied"
        valid = ThreadProjection.integer(result["version"], 2_147_483_647).positive? && result["state"] == "editable"
      else
        version = ThreadProjection.integer(result["current_version"], 2_147_483_647)
        valid = %w[draft_conflict draft_consumed].include?(result["code"]) &&
          (version.zero? ? result["state"].nil? : %w[editable consumed].include?(result["state"]))
      end
      raise ReadResponse::Invalid, "invalid draft outcome" unless valid
    end
  end
end
