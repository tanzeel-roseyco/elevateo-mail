# frozen_string_literal: true

require "time"
require_relative "cursors"
require_relative "read_response"

module Elevateo
  # AIDEV-NOTE: SQL bounds source text before Ruby; this boundary validates canonical output without HTML rendering.
  module ThreadProjection
    TIMESTAMP = /\A[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z\z/

    def self.thread(row, summary:)
      maximum = summary ? 256 : 998
      subject = nullable_text(row["subject"], 999)
      # @type var result: ReadResponse::item
      result = { "id" => uuid(row["id"]), "mailbox_id" => uuid(row["mailbox_id"]),
                 "subject" => subject&.slice(0, maximum),
                 "subject_truncated" => !subject.nil? && subject.length > maximum,
                 "unread" => boolean(row["unread"]), "message_count" => integer(row["message_count"], 2_147_483_647) }
      if summary
        result["sender"] = address(row["sender"], nullable: true)
        result["preview_text"] = text(row["preview_text"], 256)
        result["last_message_at"] = timestamp(row["last_message_at"])
      end
      result
    end

    def self.message(row)
      body = text(row["body_text"], 16_385)
      recipients = source_json(row["recipients"], 409_600)
      raise ReadResponse::Invalid, "invalid read response" unless recipients.is_a?(Array) && recipients.length <= 100

      { "id" => uuid(row["id"]), "sender" => address(row["sender"], nullable: true),
        "to" => recipients.map { |recipient| address(recipient, nullable: false) },
        "sent_at" => timestamp(row["sent_at"]), "body_text" => body.slice(0, 16_384),
        "body_truncated" => body.length > 16_384,
        "attachment_count" => integer(row["attachment_count"], 1000) }
    end

    def self.address(value, nullable:)
      return nil if nullable && value.nil?

      value = source_json(value, 4096)
      unless value.is_a?(Hash) && value.keys.sort == %w[address display_name]
        raise ReadResponse::Invalid, "invalid read response"
      end
      { "display_name" => nullable_text(value["display_name"], 256),
        "address" => nullable_text(value["address"], 256) }
    end

    def self.timestamp(value)
      return nil if value.nil?

      raw = text(value, 27)
      raise ReadResponse::Invalid, "invalid read response" unless TIMESTAMP.match?(raw)

      parsed = Time.iso8601(raw)
      # AIDEV-NOTE: Reject normalized invalid calendar dates; preserve microseconds in pagination positions.
      unless parsed.year.between?(1, 9999) && parsed.utc.strftime("%Y-%m-%dT%H:%M:%S") == raw.slice(0, 19)
        raise ReadResponse::Invalid, "invalid read response"
      end
      parsed.utc.iso8601(parsed.usec.zero? ? 0 : 6)
    rescue ArgumentError
      raise ReadResponse::Invalid, "invalid read response"
    end

    def self.source_json(value, maximum_bytes)
      return value unless value.is_a?(String)

      # AIDEV-NOTE: SQL casts JSONB to bounded text so PostgreSQL adapter decoder choices cannot change this boundary.
      raw = text(value, maximum_bytes)
      raise ReadResponse::Invalid, "invalid read response" if raw.bytesize > maximum_bytes

      JSON.parse(raw, max_nesting: 4, allow_nan: false)
    rescue JSON::ParserError, JSON::NestingError
      raise ReadResponse::Invalid, "invalid read response"
    end

    def self.uuid(value)
      raw = text(value, 36)
      raise ReadResponse::Invalid, "invalid read response" unless Cursors::UUID.match?(raw)

      raw.downcase
    end

    def self.text(value, maximum)
      unless value.is_a?(String) && [Encoding::UTF_8, Encoding::US_ASCII].include?(value.encoding) &&
             value.valid_encoding? && value.length <= maximum
        raise ReadResponse::Invalid, "invalid read response"
      end
      value
    end

    def self.nullable_text(value, maximum)
      value.nil? ? nil : text(value, maximum)
    end

    def self.boolean(value)
      case value
      when TrueClass, FalseClass then value
      else raise ReadResponse::Invalid, "invalid read response"
      end
    end

    def self.integer(value, maximum)
      unless value.is_a?(Integer) && value.between?(0, maximum)
        raise ReadResponse::Invalid, "invalid read response"
      end
      value
    end
  end
end
