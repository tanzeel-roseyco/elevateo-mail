# frozen_string_literal: true

require_relative "write_input"
require_relative "thread_projection"

module Elevateo
  # AIDEV-NOTE: Closed capabilities and bounded versions share one validator across the read/write projections.
  module MailboxMembershipInput
    MAX_VERSION = 2_147_483_647
    FLAGS = %w[compose approve_send manage_members].freeze

    def self.capabilities(value)
      WriteInput.invalid! unless value.is_a?(Hash) && value.keys.sort == FLAGS.sort
      FLAGS.to_h { |key| [key, WriteInput.boolean(value[key])] }
    end

    def self.put(input)
      WriteInput.invalid! unless input.keys.sort == %w[capabilities expected_membership_version]
      version = WriteInput.integer(input["expected_membership_version"], minimum: 0, maximum: MAX_VERSION)
      [version, capabilities(input["capabilities"])]
    end

    def self.delete(query)
      WriteInput.invalid! unless query.keys == ["expected_membership_version"]
      raw = query["expected_membership_version"]
      WriteInput.invalid! unless raw.is_a?(String) && /\A(?:0|[1-9][0-9]{0,9})\z/.match?(raw)
      WriteInput.integer(raw.to_i, minimum: 0, maximum: MAX_VERSION)
    end

    def self.member(row)
      { "user_id" => ThreadProjection.uuid(row["user_id"]),
        "capabilities" => FLAGS.to_h { |key| [key, ThreadProjection.boolean(row[key])] } }
    end
  end
end
