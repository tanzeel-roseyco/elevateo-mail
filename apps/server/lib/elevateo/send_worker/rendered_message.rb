# frozen_string_literal: true

module Elevateo
  module SendWorker
    # Validated provider-neutral message. Provider encoders must not parse the approved snapshot independently.
    class RenderedMessage
      attr_reader :sender, :recipients, :subject, :text, :attachments, :organization_id, :mailbox_id, :mime

      def initialize(sender:, recipients:, subject:, text:, attachments:, organization_id:, mailbox_id:, mime: nil)
        # AIDEV-NOTE: Attachments remain empty in snapshot v1; retaining the field makes the provider seam explicit.
        raise ArgumentError, "invalid rendered message" unless sender.is_a?(String) && recipients.is_a?(Array) &&
          recipients.all? { |item| item.is_a?(Array) && item.length == 2 } && subject.is_a?(String) &&
          text.is_a?(String) && attachments.is_a?(Array) && attachments.empty?
        @sender = sender.freeze
        # AIDEV-NOTE: Preserve the nullable display-name/address tuple while copying the immutable approved message.
        @recipients = recipients.map do |item|
          # @type var recipient: [String?, String]
          recipient = [item[0]&.dup&.freeze, item[1].dup.freeze]
          recipient.freeze
        end.freeze
        @subject = subject.freeze
        @text = text.freeze
        @attachments = attachments.freeze
        @organization_id = organization_id.freeze
        @mailbox_id = mailbox_id.freeze
        @mime = mime&.freeze
        freeze
      end

      def recipient_addresses = recipients.map(&:last)

      def with_mime(value)
        self.class.new(sender: sender, recipients: recipients, subject: subject, text: text,
          attachments: attachments, organization_id: organization_id, mailbox_id: mailbox_id, mime: value)
      end
    end
  end
end
