# frozen_string_literal: true

require_relative "../drafts/projection"

module Elevateo
  module SendAPI
    # AIDEV-NOTE: Status deliberately excludes snapshot/body/session bindings and validates SQL's closed projection.
    module Status
      FIELDS = %w[send_id mailbox_id draft_id approved_version approved_at state attempts first_possible_at
                  retry_deadline_at cancel_requested cancellable hold_reason updated_at delivery_status
                  delivery_updated_at suppression_reason simulated].freeze
      STATES = %w[queued dispatching unknown needs_review accepted rejected cancelled].freeze
      HOLDS = %w[session_invalid authorization_changed capability_revoked mailbox_disabled suppressed policy_changed
                 restore_unreconciled control_unavailable auth_unavailable uncertain retry_expired attempt_limit
                 evidence_conflict counter_exhausted].freeze

      def self.validate(value, mailbox:, send_id:)
        unless value.keys.sort == FIELDS.sort && value["send_id"] == send_id && value["mailbox_id"] == mailbox &&
               [true, false].include?(value["simulated"]) && STATES.include?(value["state"]) &&
               (value["hold_reason"].nil? || HOLDS.include?(value["hold_reason"]))
          raise ReadResponse::Invalid
        end
        ThreadProjection.uuid(value["draft_id"])
        raise ReadResponse::Invalid unless ThreadProjection.integer(value["approved_version"], 2_147_483_647).positive?
        ThreadProjection.integer(value["attempts"], 3)
        %w[approved_at updated_at].each { |key| Drafts::Projection.timestamp(value[key]) }
        %w[first_possible_at retry_deadline_at].each { |key| ThreadProjection.timestamp(value[key]) }
        %w[cancel_requested cancellable].each { |key| ThreadProjection.boolean(value[key]) }
        delivery = value["delivery_status"]
        suppression = value["suppression_reason"]
        raise ReadResponse::Invalid unless delivery.nil? ||
          %w[sent delivery_delayed delivered failed bounced suppressed complained].include?(delivery)
        raise ReadResponse::Invalid unless suppression.nil? || %w[bounced complained].include?(suppression)
        ThreadProjection.timestamp(value["delivery_updated_at"])
      end
    end
  end
end
