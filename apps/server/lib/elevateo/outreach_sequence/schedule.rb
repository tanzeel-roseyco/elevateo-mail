# frozen_string_literal: true

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
        parts = match.captures.map(&:to_i)
        year = parts.fetch(0)
        month = parts.fetch(1)
        day = parts.fetch(2)
        hour = parts.fetch(3)
        minute = parts.fetch(4)
        second = parts.fetch(5)
        unless month.between?(1, 12) && day.between?(1, 31) && hour.between?(0, 23) &&
               minute.between?(0, 59) && second.between?(0, 59)
          raise ArgumentError, "invalid local time"
        end
        raise ArgumentError, "invalid timezone" unless timezone.is_a?(String) && timezone.valid_encoding? && timezone.ascii_only? &&
          timezone.bytesize.between?(1, 128)
        zone = TZInfo::Timezone.get(timezone)
        local = Time.utc(year, month, day, hour, minute, second)
        unless [local.year, local.month, local.day, local.hour, local.min, local.sec] == parts
          raise ArgumentError, "invalid local time"
        end
        zone.local_to_utc(local, nil).utc
      rescue TZInfo::InvalidTimezoneIdentifier
        raise ArgumentError, "invalid timezone"
      rescue TZInfo::PeriodNotFound, TZInfo::AmbiguousTime
        nil
      end

      # Anchor is an observed UTC event (enrollment or prior final outcome), never an implied send.
      def due_after(anchor_utc:, delay_seconds:, local_time:, timezone:)
        raise ArgumentError, "invalid timing anchor" unless anchor_utc.is_a?(Time) && anchor_utc.utc?
        unless delay_seconds.is_a?(Integer) && delay_seconds.between?(0, 2_592_000)
          raise ArgumentError, "invalid step delay"
        end
        raise ArgumentError, "invalid local clock" unless local_time.is_a?(String) &&
          local_time.valid_encoding? && local_time.ascii_only? && /\A(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\z/.match?(local_time)
        raise ArgumentError, "invalid timezone" unless timezone.is_a?(String) && timezone.valid_encoding? && timezone.ascii_only?
        zone = TZInfo::Timezone.get(timezone)
        not_before = anchor_utc + delay_seconds
        wall = zone.utc_to_local(not_before)
        day = Time.utc(wall.year, wall.month, wall.day)
        2.times do
          candidate = due_utc(local_at: "#{day.strftime('%Y-%m-%d')}T#{local_time}", timezone: timezone)
          return nil if candidate.nil? # DST uncertainty holds this occurrence for author correction.
          return candidate if candidate >= not_before
          day += 86_400
        end
        nil
      rescue TZInfo::InvalidTimezoneIdentifier
        raise ArgumentError, "invalid timezone"
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

      # Caller supplies scoped, persisted inbound signals; ambiguous correlation holds rather than inferring consent.
      def stop_decision(campaign_id:, lead_id:, events:)
        ids = [campaign_id, lead_id]
        raise ArgumentError, "invalid candidate" unless ids.all? { |id| id.is_a?(String) && UUID.match?(id) }
        raise ArgumentError, "invalid signals" unless events.is_a?(Array) && events.length <= 100
        held = false
        events.each do |event|
          required = %w[kind campaign_id lead_id correlation occurred_at]
          raise ArgumentError, "invalid signal" unless event.is_a?(Hash) && event.keys.sort == required.sort &&
            %w[reply unsubscribe].include?(event["kind"]) && event["occurred_at"].is_a?(Time) &&
            %w[exact ambiguous].include?(event["correlation"])
          held = true if event["correlation"] == "ambiguous"
          next unless event["correlation"] == "exact"
          valid_ids = [event["campaign_id"], event["lead_id"]].all? { |id| id.is_a?(String) && UUID.match?(id) }
          raise ArgumentError, "invalid signal identity" unless valid_ids
          return :cancel if event["campaign_id"] == campaign_id && event["lead_id"] == lead_id
        end
        held ? :hold : :candidate
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
