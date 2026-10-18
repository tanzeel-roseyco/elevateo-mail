# frozen_string_literal: true

require_relative "input"
require_relative "database"
require_relative "review"
require_relative "status"
require_relative "../write_response"

module Elevateo
  module SendAPI
    # AIDEV-NOTE: Protected caller owns Auth/transaction; SQL owns replay, scope and the atomic durable queue.
    class Service
      REVIEW_SQL = "SELECT app.send_review($1::uuid, $2::uuid)::text AS result"
      APPROVE_SQL = "SELECT app.approve_draft_send($1::text,$2::uuid,$3::uuid,$4::uuid,$5::integer," \
        "$6::text,$7::bytea,$8::uuid,$9::text)::text AS result"
      STATUS_SQL = "SELECT app.send_status($1::uuid,$2::uuid,$3::uuid)::text AS result"
      CANCEL_SQL = "SELECT app.cancel_send($1::text,$2::uuid,$3::uuid,$4::uuid)::text AS result"
      APPROVED = %w[send_id draft_id approved_version review_digest approved_at simulated].freeze
      SEMANTIC = %w[review_stale send_not_ready draft_consumed draft_conflict operation_mismatch consent_required].freeze

      def initialize(connection:, session:, outbound_mode: "held")
        @database = Database.new(connection: connection, session: session)
        @outbound_mode = outbound_mode
      end

      def review(draft_id:, query:)
        mailbox, draft = target(query, draft_id)
        result = Review.new(@database.outcome(@database.object(REVIEW_SQL, [mailbox, draft])),
          outbound_mode: @outbound_mode).result
        @database.encode(@database.envelope.merge(result), budget: 2_097_152)
      end

      def approve(input, session_digest:, epoch:, request_id:)
        # AIDEV-NOTE: No current-readiness failure may bypass SQL's currently authorized immutable replay path.
        binding = @database.object(REVIEW_SQL, [input.mailbox_id, input.draft_id])
        snapshot = nil # : String?
        unless binding.key?("code")
          review = Review.new(binding, outbound_mode: @outbound_mode)
          if review.result.fetch("issues").any? { |issue| issue["code"] == "consent_required" }
            error = SendError.new("consent_required")
            return WriteResponse.new(json: @database.encode(error.body(request_id), budget: 4096), status: 409)
          end
          snapshot = review.snapshot if review.result["ready"] == true
        end
        # bytea text format avoids adapter binary encoding ambiguity; bytes are never interpolated as SQL.
        bytes = snapshot ? "\\x#{snapshot.unpack1('H*')}" : nil
        value = @database.object(APPROVE_SQL, [session_digest, input.mailbox_id, input.draft_id, input.operation_id,
          input.expected_version.to_s, input.review_digest, bytes, epoch, @outbound_mode], budget: 16_384)
        if value.key?("code")
          code = value["code"]
          if value.keys == ["code"] && code.is_a?(String) && SEMANTIC.include?(code)
            error = SendError.new(code)
            return WriteResponse.new(json: @database.encode(error.body(request_id), budget: 4096), status: 409)
          end
          @database.outcome(value)
        end
        validate_approval(value, input)
        WriteResponse.new(json: @database.encode(@database.envelope.merge(value), budget: 16_384), status: 202)
      end

      def status(send_id:, query:, epoch:)
        mailbox, send = target(query, send_id)
        value = @database.outcome(@database.object(STATUS_SQL, [mailbox, send, epoch], budget: 16_384))
        Status.validate(value, mailbox: mailbox, send_id: send)
        @database.encode(@database.envelope.merge(value), budget: 16_384)
      end

      def cancel(send_id:, mailbox_id:, session_digest:, epoch:)
        mailbox = WriteInput.uuid(mailbox_id)
        send = WriteInput.uuid(send_id)
        value = @database.outcome(@database.object(CANCEL_SQL, [session_digest, mailbox, send, epoch], budget: 16_384))
        Status.validate(value, mailbox: mailbox, send_id: send)
        unless value["cancel_requested"] == true && (value["state"] == "cancelled" || value["state"] == "dispatching" ||
               value["state"] == "unknown" || value["state"] == "needs_review" || value["state"] == "queued")
          raise ReadResponse::Invalid
        end
        result = { "send_id" => send, "result" => value["state"] == "cancelled" ? "cancelled" : "stop_requested",
          "state" => value["state"], "cancel_requested" => true, "simulated" => value.fetch("simulated") }
        WriteResponse.new(json: @database.encode(@database.envelope.merge(result), budget: 16_384), status: 200)
      end

      private

      def target(query, id)
        WriteInput.invalid! unless query.keys == ["mailbox_id"]
        [WriteInput.uuid(query["mailbox_id"]), WriteInput.uuid(id)]
      end

      def validate_approval(value, input)
        unless value.keys.sort == APPROVED.sort && value["draft_id"] == input.draft_id &&
               value["approved_version"] == input.expected_version && value["review_digest"] == input.review_digest &&
               value["simulated"] == (@outbound_mode != "resend")
          raise ReadResponse::Invalid
        end
        ThreadProjection.uuid(value["send_id"])
        Drafts::Projection.timestamp(value["approved_at"])
      end
    end
  end
end
