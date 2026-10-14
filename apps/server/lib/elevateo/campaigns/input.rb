# frozen_string_literal: true

require "time"
require_relative "../write_input"

module Elevateo
  module Campaigns
    # AIDEV-NOTE: These DTOs describe inert drafts only; consent never follows from address validity.
    class Input
      attr_reader :kind, :id, :operation_id, :attributes

      FIELDS = {
        "campaign" => %w[id operation_id name status],
        "lead" => %w[id operation_id campaign_id email consent_status consent_recorded_at consent_source suppressed],
        "account" => %w[id operation_id campaign_id mailbox_id label]
      }.freeze

      def initialize(kind:, value:)
        WriteInput.invalid! unless FIELDS.key?(kind) && value.is_a?(Hash) && value.keys.all? { |key| key.is_a?(String) } && value.keys.sort == FIELDS.fetch(kind).sort
        @kind = kind
        @id = WriteInput.uuid(value.fetch("id"))
        @operation_id = WriteInput.uuid(value.fetch("operation_id"))
        @attributes = case kind
        when "campaign"
          { "name" => label(value.fetch("name"), 160), "status" => enum(value.fetch("status"), %w[draft paused]) }
        when "lead"
          recorded = value.fetch("consent_recorded_at")
          status = enum(value.fetch("consent_status"), %w[unknown granted withdrawn])
          WriteInput.invalid! unless recorded.nil? || (recorded.is_a?(String) && /\A\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\z/.match?(recorded))
          if recorded
            begin
              WriteInput.invalid! if Time.iso8601(recorded) > Time.now.utc + 300
            rescue ArgumentError
              WriteInput.invalid!
            end
          end
          source = value.fetch("consent_source")
          WriteInput.invalid! unless source.nil? || (source.is_a?(String) && source.length.between?(1, 200) &&
            source.valid_encoding? && !source.match?(/[\x00-\x1f\x7f]/))
          WriteInput.invalid! if status == "granted" && (recorded.nil? || source.nil?)
          suppressed = value.fetch("suppressed")
          WriteInput.invalid! unless suppressed == true || suppressed == false
          { "campaign_id" => WriteInput.uuid(value.fetch("campaign_id")), "email" => self.class.email(value.fetch("email")),
            "consent_status" => status, "consent_recorded_at" => recorded, "consent_source" => source, "suppressed" => suppressed }
        when "account"
          { "campaign_id" => WriteInput.uuid(value.fetch("campaign_id")),
            "mailbox_id" => WriteInput.uuid(value.fetch("mailbox_id")), "label" => label(value.fetch("label"), 120) }
        else WriteInput.invalid!
        end.freeze
      end

      def label(value, maximum)
        WriteInput.invalid! unless value.is_a?(String) && value.valid_encoding? && value.length.between?(1, maximum) &&
          value.bytesize <= maximum * 4 && !value.match?(/[\x00-\x1f\x7f]/)
        value.freeze
      end

      def enum(value, allowed)
        WriteInput.invalid! unless value.is_a?(String) && allowed.include?(value)
        value
      end

      def self.email(value)
        WriteInput.invalid! unless value.is_a?(String) && value.ascii_only? && value.bytesize.between?(3, 254) &&
          /\A[^@\s]+@[^@\s]+\z/.match?(value)
        value.downcase.freeze
      end
    end
  end
end
