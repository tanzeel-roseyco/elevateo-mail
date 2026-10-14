# frozen_string_literal: true

require "json"
require "bigdecimal"
require "uri"
require_relative "collaboration_error"

module Elevateo
  # AIDEV-NOTE: C/D transport is stricter than legacy AuthInput; changing it must not broaden lifecycle endpoints.
  module WriteInput
    UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i
    JSON_TYPE = /\Aapplication\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\z/i
    class UniqueObject < Hash
      def []=(key, value)
        raise CollaborationError.new("request_invalid") if key?(key)
        super
      end
    end

    # AIDEV-NOTE: Some extreme exponents bypass BigDecimal's underflow exception; nonzero tokens cannot become zero.
    class ExactDecimal
      def self.try_convert(token)
        value = BigDecimal(token)
        if value.zero? && token.sub(/[eE].*\z/, "").match?(/[1-9]/)
          raise FloatDomainError, "decimal underflow"
        end
        value
      end
    end

    def self.invalid! = raise(CollaborationError.new("request_invalid"))

    def self.transport!(origin:, expected_origin:, content_type:, content_encoding:, body:)
      invalid! unless origin.is_a?(String) && origin == expected_origin
      invalid! unless content_encoding.nil? || content_encoding == "" ||
        (content_encoding.is_a?(String) && /\Aidentity\z/i.match?(content_encoding))
      return if !body && (content_type.nil? || content_type == "")
      invalid! unless content_type.is_a?(String) && JSON_TYPE.match?(content_type)
    end

    # AIDEV-NOTE: Rack Content-Length is an untrusted hint; consume at most max+1 actual bytes, including short reads.
    def self.read(stream, maximum:)
      raise ArgumentError, "invalid input bound" unless maximum.between?(0, 2_097_152)
      result = String.new(encoding: Encoding::BINARY)
      while result.bytesize <= maximum
        chunk = stream.read(maximum + 1 - result.bytesize)
        break if chunk.nil? || chunk.empty?
        result << chunk.b
      end
      invalid! if result.bytesize > maximum
      result.force_encoding(Encoding::UTF_8)
    end

    def self.object(raw)
      invalid! unless raw.is_a?(String)
      source = raw.dup.force_encoding(Encoding::UTF_8)
      invalid! unless source.valid_encoding?
      # AIDEV-NOTE: Keep decimal tokens exact until field validation; binary Float can round fractions into versions.
      parsed = BigDecimal.save_exception_mode do
        # AIDEV-NOTE: Extreme exponents must not silently underflow to an accepted zero; restore modes on exit.
        BigDecimal.mode(BigDecimal::EXCEPTION_UNDERFLOW, true)
        JSON.parse(source, decimal_class: ExactDecimal, allow_duplicate_key: false,
          object_class: UniqueObject, max_nesting: 16, allow_nan: false)
      end
      invalid! unless parsed.is_a?(Hash)
      validate!(parsed)
      parsed
    rescue JSON::ParserError, EncodingError, ArgumentError, FloatDomainError
      invalid!
    end

    def self.body(raw, required:)
      result = object(raw)
      invalid! unless result.keys.sort == required.sort
      result
    end

    def self.query(raw, allowed:)
      invalid! unless raw.bytesize <= 8192
      result = {} # : Hash[String, String]
      return result if raw.empty?
      raw.split("&", -1).each do |pair|
        key, value = pair.split("=", 2)
        invalid! if key.nil? || key.empty?
        key = decode(key)
        value = decode(value || "")
        invalid! unless allowed.include?(key) && !result.key?(key)
        result[key] = value
      end
      result
    end

    def self.decode(value)
      invalid! if /%(?![0-9a-f]{2})/i.match?(value)
      decoded = URI.decode_www_form_component(value, Encoding::UTF_8)
      validate!(decoded)
      decoded
    rescue ArgumentError, EncodingError
      invalid!
    end

    def self.validate!(value)
      case value
      when String
        invalid! unless [Encoding::UTF_8, Encoding::US_ASCII].include?(value.encoding) && value.valid_encoding?
        invalid! if value.each_codepoint.any? { |point| point.zero? || point.between?(0xD800, 0xDFFF) }
      when Array then value.each { |item| validate!(item) }
      when Hash then value.each { |key, item| validate!(key); validate!(item) }
      when Float, BigDecimal then invalid! unless value.finite?
      when Integer, true, false, nil then nil
      else invalid!
      end
      nil
    end

    def self.uuid(value)
      invalid! unless value.is_a?(String) && UUID.match?(value)
      value.downcase
    end

    def self.text(value, maximum:, empty: false)
      invalid! unless value.is_a?(String)
      validate!(value)
      invalid! if value.length > maximum || (!empty && value.empty?)
      value
    end

    def self.integer(value, minimum:, maximum:)
      invalid! unless value.is_a?(Integer) ||
        ((value.is_a?(Float) || value.is_a?(BigDecimal)) && value.finite?)
      # AIDEV-NOTE: Check bounds before to_i so enormous exponents cannot allocate enormous integers.
      invalid! unless value.between?(minimum, maximum)
      invalid! unless value == value.to_i
      value.to_i
    end

    def self.boolean(value)
      case value
      when true, false then value
      else invalid!
      end
    end
  end
end
