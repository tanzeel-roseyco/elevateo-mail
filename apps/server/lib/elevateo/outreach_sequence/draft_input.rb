# frozen_string_literal: true

require "digest"
require "json"
require "tzinfo"
require_relative "schedule"

module Elevateo
  module OutreachSequence
    class DraftInput
      STATUS = %w[draft held].freeze
      CLOCK = /\A(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\z/
      attr_reader :id, :campaign_id, :operation_id, :expected_version, :status, :timezone, :steps, :fingerprint

      def initialize(value:)
        raise ArgumentError, "invalid sequence draft" unless value.is_a?(Hash)
        required = %w[id campaign_id operation_id expected_version status timezone steps]
        raise ArgumentError, "invalid sequence keys" unless value.keys.sort == required.sort
        @id = uuid(value.fetch("id"))
        @campaign_id = uuid(value.fetch("campaign_id"))
        @operation_id = uuid(value.fetch("operation_id"))
        version = value.fetch("expected_version")
        unless version.nil? || (version.is_a?(Integer) && version.between?(1, Schedule::MAX_VERSION))
          raise ArgumentError, "invalid expected version"
        end
        @expected_version = version
        status = value.fetch("status")
        raise ArgumentError, "invalid sequence status" unless STATUS.include?(status)
        @status = status.dup.freeze
        timezone = value.fetch("timezone")
        unless timezone.is_a?(String) && timezone.valid_encoding? && timezone.ascii_only? &&
               timezone.bytesize.between?(1, 128)
          raise ArgumentError, "invalid timezone"
        end
        TZInfo::Timezone.get(timezone)
        @timezone = timezone.dup.freeze
        raw_steps = value.fetch("steps")
        raise ArgumentError, "invalid steps" unless raw_steps.is_a?(Array) && raw_steps.length.between?(1, 20)
        @steps = raw_steps.each_with_index.map { |raw, index| step(raw, index + 1) }.freeze
        raise ArgumentError, "duplicate step id" unless @steps.map { |item| item.fetch("id") }.uniq.length == @steps.length
        canonical = [@id, @campaign_id, @expected_version, @status, @timezone, @steps]
        @fingerprint = Digest::SHA256.hexdigest(JSON.generate(canonical))
        freeze
      rescue TZInfo::InvalidTimezoneIdentifier
        raise ArgumentError, "invalid timezone"
      end

      private

      def uuid(value)
        raise ArgumentError, "invalid UUID" unless value.is_a?(String) && value.valid_encoding? &&
          value.ascii_only? && Schedule::UUID.match?(value)
        value.dup.freeze
      end

      def step(raw, position)
        keys = %w[id position delay_seconds local_time label]
        raise ArgumentError, "invalid step keys" unless raw.is_a?(Hash) && raw.keys.sort == keys.sort
        raise ArgumentError, "invalid step position" unless raw.fetch("position") == position
        delay = raw.fetch("delay_seconds")
        raise ArgumentError, "invalid step delay" unless delay.is_a?(Integer) && delay.between?(0, 2_592_000)
        clock = raw.fetch("local_time")
        raise ArgumentError, "invalid local clock" unless clock.is_a?(String) && clock.valid_encoding? &&
          clock.ascii_only? && CLOCK.match?(clock)
        label = raw.fetch("label")
        raise ArgumentError, "invalid label" unless label.is_a?(String) && label.valid_encoding? &&
          label.length.between?(1, 120) && label.bytesize <= 480 && !label.match?(/[\x00-\x1f\x7f]/)
        { "id" => uuid(raw.fetch("id")), "position" => position, "delay_seconds" => delay,
          "local_time" => clock.dup.freeze, "label" => label.dup.freeze }.freeze
      end
    end
  end
end
