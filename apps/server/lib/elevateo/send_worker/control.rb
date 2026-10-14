# frozen_string_literal: true

require "json"

module Elevateo
  module SendWorker
    class ControlState
      attr_reader :epoch, :outbound_held

      def initialize(epoch:, outbound_held:)
        unless (epoch.nil? || Control.valid_epoch?(epoch)) && [true, false].include?(outbound_held)
          raise ArgumentError, "invalid dispatch control"
        end
        @epoch = epoch&.dup&.freeze
        @outbound_held = outbound_held || epoch.nil?
        freeze
      end

      def readable? = !epoch.nil?
      def submission_allowed? = readable? && !outbound_held
    end

    class Control
      MAX_BYTES = 4096
      UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/

      # AIDEV-NOTE: This file lives outside database backups; unreadable state never authorizes submission.
      def initialize(path:)
        raise ArgumentError, "invalid dispatch control path" unless path.is_a?(String) && !path.empty?
        @path = path.dup.freeze
      end

      def self.valid_epoch?(value) = value.is_a?(String) && UUID.match?(value)

      def read
        bytes = File.open(@path, File::RDONLY | File::NONBLOCK) do |file|
          file.stat.file? ? file.read(MAX_BYTES + 1) : nil
        end
        return held unless bytes && bytes.bytesize <= MAX_BYTES
        text = bytes.force_encoding(Encoding::UTF_8)
        return held unless text.valid_encoding?
        value = JSON.parse(text, object_class: UniqueObject, max_nesting: 2)
        return held unless value.is_a?(Hash) && value.keys.sort == %w[epoch outbound_held]
        epoch, outbound_held = value["epoch"], value["outbound_held"]
        return held unless self.class.valid_epoch?(epoch) && [true, false].include?(outbound_held)
        ControlState.new(epoch: epoch, outbound_held: outbound_held)
      rescue SystemCallError, IOError, JSON::ParserError, ArgumentError
        held
      end

      private

      def held = ControlState.new(epoch: nil, outbound_held: true)

      class UniqueObject < Hash
        def []=(key, value)
          raise JSON::ParserError, "duplicate dispatch control key" if key?(key)
          super
        end
      end
    end
  end
end
