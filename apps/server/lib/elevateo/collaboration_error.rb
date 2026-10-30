# frozen_string_literal: true

module Elevateo
  # AIDEV-NOTE: C/D have their own fixed error vocabulary; A/B lifecycle responses keep their existing contract.
  class CollaborationError < StandardError
    ERRORS = {
      "request_invalid" => [400, "Invalid request"], "cursor_invalid" => [400, "Invalid cursor"],
      "unauthenticated" => [401, "Authentication required"],
      "not_available" => [404, "This item is unavailable."],
      "context_changed" => [409, "Session context changed"],
      "draft_conflict" => [409, "Draft has changed"], "operation_mismatch" => [409, "Operation does not match"],
      "draft_consumed" => [409, "Draft has already been consumed"],
      "assignment_conflict" => [409, "Assignment has changed"],
      "membership_conflict" => [409, "Membership has changed"],
      "rate_limited" => [429, "Too many requests"],
      "temporarily_unavailable" => [503, "Temporarily unavailable"], "internal_error" => [500, "Internal error"]
    }.freeze
    attr_reader :code, :status, :retry_after

    def initialize(code, retry_after: nil)
      @code = code
      @status, message = ERRORS.fetch(code)
      unless retry_after.nil? || ([429, 503].include?(@status) && retry_after.between?(1, 300))
        raise ArgumentError, "invalid retry delay"
      end
      @retry_after = retry_after
      super(message)
    end

    def body(request_id)
      # AIDEV-NOTE: Even proxy-generated IDs must remain bounded valid UTF-8 in the closed error envelope.
      id = request_id.to_s.encode(Encoding::UTF_8, invalid: :replace, undef: :replace, replace: "")
      id = id.delete("\u0000").byteslice(0, 128).to_s.scrub("")
      id = "unavailable" if id.empty?
      { "code" => code, "message" => message, "request_id" => id }
    end
  end
end
