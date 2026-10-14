# frozen_string_literal: true

require "date"
require "digest"
require "time"
require "tzinfo"

module Elevateo
  module OutreachSequence
    # Pure draft planner. Only the existing reviewed send-intent path may authorize delivery.
    module Schedule
      UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/
      LOCAL_AT = /\A(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\z/
      MAX_VERSION = 2_147_483_646

      module_function

      # AIDEV-NOTE: A DST gap or fold has no unambiguous due instant; the author must choose another local time.
      def due_utc(local_at:, timezone:)
        raise ArgumentError, "invalid local time" unless local_at.is_a?(String) && local_at.valid_encoding? && local_at.ascii_only? &&
          (match = LOCAL_AT.match(local_at))
        year, month, day, hour, minute, second = match.captures.map(&:to_i)
        unless Date.valid_date?(year, month, day) && hour.between?(0, 23) &&
               minute.between?(0, 59) && second.between?(0, 59)
          raise ArgumentError, "invalid local time"
        end
        raise ArgumentError, "invalid timezone" unless timezone.is_a?(String) && timezone.valid_encoding? && timezone.ascii_only? &&
          timezone.bytesize.between?(1, 128)
        zone = TZInfo::Timezone.get(timezone)
        local = Time.utc(year, month, day, hour, minute, second)
        zone.local_to_utc(local, nil).utc
      rescue TZInfo::InvalidTimezoneIdentifier
        raise ArgumentError, "invalid timezone"
      rescue TZInfo::PeriodNotFound, TZInfo::AmbiguousTime
        nil
      end

      # Stable occurrence identity for a proposed lead/step on one draft revision; persistence must enforce UNIQUE.
      def occurrence_key(campaign_id:, lead_id:, step_id:, draft_version:)
        ids = [campaign_id, lead_id, step_id]
        raise ArgumentError, "invalid occurrence id" unless ids.all? { |id| id.is_a?(String) && id.valid_encoding? && id.ascii_only? && UUID.match?(id) }
        unless draft_version.is_a?(Integer) && draft_version.between?(1, MAX_VERSION)
          raise ArgumentError, "invalid draft version"
        end
        Digest::SHA256.hexdigest(ids.join(":") + ":" + draft_version.to_s)
      end

      # This can block a candidate, but false never establishes consent or permission to send.
      def stop_required?(reply_at:, unsubscribe_at:)
        [reply_at, unsubscribe_at].each do |value|
          raise ArgumentError, "invalid stop signal" unless value.nil? || value.is_a?(Time)
        end
        !reply_at.nil? || !unsubscribe_at.nil?
      end
    end
  end
end
