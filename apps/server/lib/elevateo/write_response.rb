# frozen_string_literal: true

require_relative "write_input"

module Elevateo
  class WriteResponse
    attr_reader :json, :status

    def initialize(json:, status:)
      unless json.is_a?(String) && status.is_a?(Integer)
        raise CollaborationError.new("internal_error")
      end
      @json, @status = json.dup.freeze, status
    end

    # AIDEV-NOTE: Serialized terminal 409s commit durable draft ledgers; raised errors always roll back business work.
    def verify!(budget:)
      unless budget.positive? && json.bytesize <= budget && (status.between?(200, 299) || status == 409)
        raise CollaborationError.new("internal_error")
      end
      WriteInput.object(json)
      self
    rescue CollaborationError
      raise CollaborationError.new("internal_error")
    end
  end
end
