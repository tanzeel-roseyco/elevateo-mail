# frozen_string_literal: true

require_relative "collaboration_error"

module Elevateo
  # AIDEV-NOTE: Send errors are independent; frozen C/D enums must never gain send-specific codes.
  class SendError < StandardError
    ERRORS = {
      "request_invalid" => [400, "Invalid request"], "unauthenticated" => [401, "Authentication required"],
      "not_available" => [404, "This item is unavailable."], "context_changed" => [409, "Session context changed"],
      "rate_limited" => [429, "Too many requests"], "temporarily_unavailable" => [503, "Temporarily unavailable"],
      "internal_error" => [500, "Internal error"], "review_stale" => [409, "Review has changed"],
      "send_not_ready" => [409, "Send is not ready"], "draft_consumed" => [409, "Draft has already been consumed"],
      "draft_conflict" => [409, "Draft has changed"], "operation_mismatch" => [409, "Operation does not match"],
      "send_terminal" => [409, "Send is terminal"], "dispatch_held" => [503, "Dispatch is held"]
    }.freeze
    attr_reader :code, :status, :retry_after

    def initialize(code, retry_after: nil)
      @code = ERRORS.key?(code) ? code : "internal_error"
      @status, message = ERRORS.fetch(@code)
      @retry_after = retry_after
      super(message)
    end

    def body(request_id)
      id = request_id.to_s.encode(Encoding::UTF_8, invalid: :replace, undef: :replace, replace: "")
      id = id.delete("\u0000").byteslice(0, 128).to_s.scrub("")
      { "code" => code, "message" => message, "request_id" => id.empty? ? "unavailable" : id }
    end
  end
end
