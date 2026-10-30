# frozen_string_literal: true

module Elevateo
  # AIDEV-NOTE: Only fixed public errors cross the boundary; provider bodies and credentials never become messages.
  class AuthError < StandardError
    MESSAGES = { "request_invalid" => "Invalid request", "unauthenticated" => "Authentication required",
                 "not_available" => "Not available", "context_changed" => "Session context changed",
                 "temporarily_unavailable" => "Temporarily unavailable", "rate_limited" => "Too many requests",
                 "cursor_invalid" => "Invalid cursor", "internal_error" => "Internal error" }.freeze
    attr_reader :code, :status, :retry_after

    def initialize(code = "temporarily_unavailable", status: 503, retry_after: nil)
      @code, @status, @retry_after = code, status, retry_after
      super(MESSAGES.fetch(code))
    end

    def self.invalid = new("request_invalid", status: 400)
    def self.unauthorized = new("unauthenticated", status: 401)
    def self.unavailable = new("not_available", status: 404)
  end
end
