# frozen_string_literal: true

require_relative "drafts"
require_relative "draft_attachment_payload"
require "securerandom"

module Elevateo
  # AIDEV-NOTE: Each call runs inside its caller's guarded snapshot; network bytes never enter this adapter.
  class DraftAttachments
    def initialize(connection:, session:)
      @database = Drafts::Database.new(connection: connection, session: session)
    end

    def list(mailbox, draft)
      result("SELECT app.list_draft_attachments($1::uuid,$2::uuid)::text AS result", [mailbox, draft])
    end

    def reserve(payload, digest)
      values = [digest, payload.mailbox_id, payload.draft_id, payload.operation_id, payload.digest,
        SecureRandom.uuid, SecureRandom.uuid, payload.filename, payload.content_type, payload.bytes.bytesize.to_s, payload.sha256]
      result(<<~SQL, values)
        SELECT app.reserve_draft_attachment($1::text,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,
          $7::uuid,$8::text,$9::text,$10::integer,$11::text)::text AS result
      SQL
    end

    def finalize(payload, digest, token)
      result("SELECT app.finalize_draft_attachment($1::text,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid)::text AS result",
        [digest, payload.mailbox_id, payload.draft_id, payload.operation_id, payload.digest, token])
      items = list(payload.mailbox_id, payload.draft_id)["items"]
      raise CollaborationError.new("internal_error") unless items.is_a?(Array) && items.length == 1
      item = items.first
      raise CollaborationError.new("internal_error") unless item.is_a?(Hash)
      item
    end

    def remove(digest, mailbox, draft, attachment)
      result("SELECT app.remove_draft_attachment($1::text,$2::uuid,$3::uuid,$4::uuid)::text AS result",
        [digest, mailbox, draft, attachment])
    end

    private

    def result(sql, values)
      value = @database.object(sql, values)
      code = value["code"]
      if code
        raise CollaborationError.new("internal_error") unless code.is_a?(String)
        code = "operation_mismatch" if %w[operation_retired attachment_slot_occupied].include?(code)
        raise CollaborationError.new(CollaborationError::ERRORS.key?(code) ? code : "internal_error")
      end
      value
    end
  end
end
