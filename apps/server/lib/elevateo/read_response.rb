# frozen_string_literal: true

require "json"

module Elevateo
  # AIDEV-NOTE: Return these bytes unchanged from the controller; rendering JSON again changes the enforced budget.
  module ReadResponse
    class Overflow < StandardError; end
    class Invalid < Overflow; end

    MAILBOX_BYTES = 128 * 1024
    THREAD_BYTES = 256 * 1024
    MESSAGE_BYTES = 2 * 1024 * 1024

    def self.page(items:, limit:, envelope:, cursor_for:, budget:, items_key: "items")
      maximum = items_key == "messages" ? 20 : 50
      unless %w[items messages].include?(items_key) && limit.is_a?(Integer) && limit.between?(1, maximum) &&
             items.length <= limit + 1 && budget.is_a?(Integer) && budget.positive? &&
             (envelope.keys & %w[items messages next_cursor]).empty?
        raise Invalid, "invalid read response"
      end
      prefix = dump(envelope).delete_suffix("}")
      prefix += "," unless envelope.empty?
      encoded = items.map { |item| dump(item) }
      count = [limit, items.length].min
      # AIDEV-NOTE: Sum serialized fragments and separators so shrinking a page never recopies megabytes per trial.
      item_bytes = encoded.first(count).sum(&:bytesize) + [count - 1, 0].max

      loop do
        # AIDEV-NOTE: The lookahead row proves more visible data exists; the cursor uses the last INCLUDED row.
        cursor = count.positive? && count < items.length ? cursor_for.call(items.fetch(count - 1)) : nil
        unless cursor.nil? || (cursor.is_a?(String) && cursor.length.between?(1, 2048))
          raise Invalid, "invalid read response"
        end
        header = "#{prefix}\"next_cursor\":#{dump(cursor)},#{dump(items_key)}:["
        if header.bytesize + item_bytes + 2 <= budget
          return "#{header}#{encoded.first(count).join(',')}]}"
        end

        # AIDEV-NOTE: A legal item must fit alone; never emit an empty continuation that cannot make progress.
        raise Overflow, "read response exceeds byte budget" if count <= 1

        item_bytes -= encoded.fetch(count - 1).bytesize + 1
        count -= 1
      end
    end

    # AIDEV-NOTE: One-message permalink responses use the same validated JSON and a fixed byte ceiling as pages.
    def self.single(item:, budget: MESSAGE_BYTES)
      raise Invalid, "invalid read response" unless item.is_a?(Hash) && budget.is_a?(Integer) &&
        budget.between?(1, MESSAGE_BYTES)

      body = dump(item)
      raise Overflow, "read response exceeds byte budget" if body.bytesize > budget

      body
    end

    def self.dump(value)
      validate_json(value, 0)
      JSON.generate(value, allow_nan: false, max_nesting: 32)
    rescue JSON::GeneratorError, JSON::NestingError, EncodingError
      raise Invalid, "invalid read response"
    end

    def self.validate_json(value, depth)
      raise Invalid, "invalid read response" if depth > 30

      case value
      when String
        unless [Encoding::UTF_8, Encoding::US_ASCII].include?(value.encoding) && value.valid_encoding?
          raise Invalid, "invalid read response"
        end
      when Hash
        value.each do |key, child|
          raise Invalid, "invalid read response" unless key.is_a?(String)

          validate_json(key, depth + 1)
          validate_json(child, depth + 1)
        end
      when Array
        value.each { |child| validate_json(child, depth + 1) }
      when Float
        raise Invalid, "invalid read response" unless value.finite?
      when Integer, NilClass, TrueClass, FalseClass
        nil
      else
        raise Invalid, "invalid read response"
      end
      nil
    end
    private_class_method :dump, :validate_json
  end
end
