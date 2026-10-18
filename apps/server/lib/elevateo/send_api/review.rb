# frozen_string_literal: true

require_relative "address"
require_relative "canonical"
require_relative "../thread_projection"

module Elevateo
  module SendAPI
    # AIDEV-NOTE: Binding comes from one protected SQL snapshot; readiness never queries arbitrary suppression lists.
    class Review
      FIELDS = %w[organization_id mailbox_id draft_id actor_id version state sender_address recipients subject body_text
                  reply_to_thread_id policy_revision mailbox_enabled reply_available suppressed_addresses
                  consented_addresses].freeze
      attr_reader :snapshot, :result

      def initialize(binding, outbound_mode: "held")
        raise ReadResponse::Invalid unless binding.keys.sort == FIELDS.sort
        @binding = binding
        @issues = [] # : Array[ReadResponse::item]
        @organization = ThreadProjection.uuid(binding["organization_id"])
        @mailbox = ThreadProjection.uuid(binding["mailbox_id"])
        @draft = ThreadProjection.uuid(binding["draft_id"])
        ThreadProjection.uuid(binding["actor_id"])
        @version = ThreadProjection.integer(binding["version"], 2_147_483_647)
        raise ReadResponse::Invalid unless @version.positive? && %w[editable consumed].include?(binding["state"])
        @subject = ThreadProjection.text(binding["subject"], 998)
        @body = ThreadProjection.text(binding["body_text"], 65_536)
        @reply = binding["reply_to_thread_id"].nil? ? nil : ThreadProjection.uuid(binding["reply_to_thread_id"])
        @policy = binding["policy_revision"].nil? ? "0" : ThreadProjection.text(binding["policy_revision"], 19)
        raise ReadResponse::Invalid unless /\A(?:0|[1-9][0-9]{0,18})\z/.match?(@policy) && @policy.to_i <= 9_223_372_036_854_775_807
        sender = ThreadProjection.nullable_text(binding["sender_address"], 256)
        @sender = Address.canonical(sender)
        issue(sender.nil? ? "sender_unconfigured" : "sender_invalid") unless @sender
        issue("draft_consumed") if binding["state"] == "consumed"
        issue("purpose_unavailable") if @policy == "0"
        issue("mailbox_disabled") unless ThreadProjection.boolean(binding["mailbox_enabled"])
        issue("reply_unavailable") unless ThreadProjection.boolean(binding["reply_available"])
        issue("header_invalid") unless Address.header?(@subject)
        @consent_required = outbound_mode == "resend"
        @outbound_mode = outbound_mode
        @recipients, checks = recipients(binding)
        @snapshot = Canonical.bytes(organization_id: @organization, mailbox_id: @mailbox, draft_id: @draft,
          version: @version, sender: @sender, recipients: @recipients, subject: @subject, body: @body,
          reply_id: @reply, policy: @policy)
        issue("snapshot_too_large") if @snapshot.bytesize > Canonical::MAXIMUM
        @result = { "draft_id" => @draft, "mailbox_id" => @mailbox, "draft_version" => @version,
          "sender" => { "display_name" => nil, "address" => @sender || sender }, "to" => @recipients,
          "subject" => @subject, "body_text" => @body, "reply_to_thread_id" => @reply,
          "purpose" => "correspondence", "consent_basis" => "human_attestation_required",
          "attachments" => [], "attachments_supported" => false, "policy_revision" => @policy,
          "recipient_checks" => checks, "ready" => @issues.empty?, "issues" => @issues,
          "review_digest" => @issues.empty? ? Canonical.digest(@snapshot) : nil,
          "simulated" => outbound_mode != "resend", "outbound_mode" => outbound_mode }
      end

      private

      def issue(code, index = nil)
        @issues << { "code" => code, "recipient_index" => index }
      end

      def recipients(binding)
        values = binding["recipients"]
        suppressed = binding["suppressed_addresses"]
        consented = binding["consented_addresses"]
        unless values.is_a?(Array) && values.length <= 100 && suppressed.is_a?(Array) && suppressed.length <= 100 &&
               suppressed.all? { |value| value.is_a?(String) && Address.canonical(value) == value } &&
               consented.is_a?(Array) && consented.length <= 100 &&
               consented.all? { |value| value.is_a?(String) && Address.canonical(value) == value }
          raise ReadResponse::Invalid
        end
        issue("recipient_required") if values.empty?
        seen = {} # : Hash[String, bool]
        checks = [] # : Array[ReadResponse::item]
        items = values.each_with_index.map do |value, index|
          unless value.is_a?(Hash) && value.keys.sort == %w[address display_name]
            raise ReadResponse::Invalid
          end
          name = ThreadProjection.nullable_text(value["display_name"], 256)
          raw = ThreadProjection.nullable_text(value["address"], 256)
          address = Address.canonical(raw)
          status = if !address then "invalid"
            elsif seen[address] then "duplicate"
            elsif suppressed.include?(address) then "suppressed"
            else "ok"
            end
          consent_evidence = !address.nil? && consented.include?(address)
          seen[address] = true if address
          issue("recipient_#{status}", index) unless status == "ok"
          issue("consent_required", index) if status == "ok" && @consent_required && !consent_evidence
          issue("header_invalid", index) if name && !Address.header?(name)
          checks << { "index" => index, "status" => status, "consent_evidence" => consent_evidence }
          { "display_name" => name, "address" => address || raw }
        end
        [items, checks]
      end
    end
  end
end
