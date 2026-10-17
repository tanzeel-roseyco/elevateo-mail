# frozen_string_literal: true

require "json"
require "uri"
require "ipaddr"
require_relative "auth_error"

module Elevateo
  module AuthInput
    UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i
    # AIDEV-NOTE: JSON's usual last-key-wins behavior would erase evidence before boundary validation.
    class UniqueObject < Hash
      def []=(key, value)
        raise AuthError.invalid if key?(key)
        super
      end
    end

    def self.object(raw, maximum: 8192)
      raise AuthError.invalid unless raw.is_a?(String) && raw.bytesize <= maximum && raw.valid_encoding?
      parsed = JSON.parse(raw, object_class: UniqueObject, max_nesting: 8, allow_nan: false)
      raise AuthError.invalid unless parsed.is_a?(Hash)
      parsed
    rescue JSON::ParserError, EncodingError
      raise AuthError.invalid
    end

    def self.body(raw, required:, optional: [])
      parsed = object(raw)
      raise AuthError.invalid unless (required - parsed.keys).empty? && (parsed.keys - required - optional).empty?
      parsed
    end

    def self.query(raw, allowed: [])
      raise AuthError.invalid if raw.bytesize > 8192 || /%(?![0-9a-f]{2})/i.match?(raw)
      result = {}
      URI.decode_www_form(raw, Encoding::UTF_8).each do |key, value|
        raise AuthError.invalid if !allowed.include?(key) || result.key?(key) || !value.valid_encoding?
        result[key] = value
      end
      result
    rescue ArgumentError
      raise AuthError.invalid
    end

    def self.text(value, maximum:, minimum: 1)
      raise AuthError.invalid unless value.is_a?(String) && value.valid_encoding? &&
        value.length >= minimum && value.bytesize <= maximum && !value.include?("\u0000")
      value
    end

    def self.email(value)
      email = text(value, maximum: 1280).strip.downcase
      raise AuthError.invalid unless email.length <= 320 && /\A[^\s@]+@[^\s@]+\.[^\s@]+\z/.match?(email)
      email
    end

    def self.password(value, minimum: 1) = text(value, maximum: 1024, minimum: minimum)

    def self.uuid(value)
      raise AuthError.invalid unless value.is_a?(String) && UUID.match?(value)
      value.downcase
    end

    def self.ip(value)
      IPAddr.new(text(value, maximum: 64)).to_s
    rescue IPAddr::Error
      raise AuthError.invalid
    end
  end
end
