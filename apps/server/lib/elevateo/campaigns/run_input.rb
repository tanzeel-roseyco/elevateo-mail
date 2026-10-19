# frozen_string_literal: true

require "digest"
require "json"
require_relative "../write_input"
require_relative "../send_api/address"

module Elevateo
  module Campaigns
    # AIDEV-NOTE: Frozen audience/content and the operation digest prevent a timeout retry becoming a different send.
    class RunInput
      FIELDS = %w[operation_id mailbox_id expected_campaign_version subject body_text lead_ids marketing_confirmed].freeze
      attr_reader :operation_id, :mailbox_id, :expected_version, :subject, :body_text, :lead_ids, :digest

      def initialize(value)
        WriteInput.invalid! unless value.keys.sort == FIELDS.sort && value["marketing_confirmed"] == true
        @operation_id = WriteInput.uuid(value["operation_id"])
        @mailbox_id = WriteInput.uuid(value["mailbox_id"])
        @expected_version = WriteInput.integer(value["expected_campaign_version"], minimum: 1, maximum: 2_147_483_647)
        @subject = text(value["subject"], 998)
        WriteInput.invalid! unless SendAPI::Address.header?(@subject)
        @body_text = text(value["body_text"], 65_536)
        leads = value["lead_ids"]
        WriteInput.invalid! unless leads.is_a?(Array) && leads.length.between?(1, 25)
        @lead_ids = leads.map { |id| WriteInput.uuid(id) }.sort
        WriteInput.invalid! unless @lead_ids.uniq.length == @lead_ids.length
        @digest = Digest::SHA256.hexdigest(JSON.generate([@mailbox_id, @expected_version, @subject, @body_text, @lead_ids]))
      end

      private

      def text(value, maximum)
        WriteInput.invalid! unless value.is_a?(String) && value.valid_encoding? && value.length.between?(1, maximum) && value.bytesize <= maximum &&
          !value.strip.empty? && !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.match?(value)
        value
      end
    end
  end
end
