# frozen_string_literal: true

require "csv"
require_relative "../write_input"

module Elevateo
  module EmailFinder
    # AIDEV-NOTE: CSV and single lookups enter the same boundary; no queued row bypasses validation.
    module Input
      KINDS = %w[person verify company decision_maker].freeze
      LIMITS = { "name" => 200, "company" => 250, "domain" => 253, "email" => 254, "role" => 200 }.freeze

      def self.text(value, maximum)
        WriteInput.invalid! unless value.is_a?(String) && value.valid_encoding? &&
          value.bytesize <= maximum && !value.match?(/[\x00-\x1f\x7f]/)
        value.strip
      end

      def self.domain(value)
        result = text(value, 253).downcase.delete_suffix(".")
        WriteInput.invalid! unless result.include?(".") && result.split(".", -1).all? do |part|
          /\A[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\z/.match?(part)
        end
        result
      end

      def self.email(value)
        result = text(value, 254).downcase
        local, host = result.split("@", -1)
        WriteInput.invalid! unless local && host && result.count("@") == 1 &&
          /\A[a-z0-9][a-z0-9.!#$%&'*+\/=?^_`{|}~-]{0,63}\z/.match?(local) &&
          !local.include?(" ") && !local.include?("..") && !local.end_with?(".")
        "#{local}@#{domain(host)}"
      end

      def self.row(kind, raw)
        WriteInput.invalid! unless KINDS.include?(kind) && raw.is_a?(Hash) && (raw.keys - LIMITS.keys).empty?
        result = {} # @type var result: Hash[String, String]
        raw.each { |key, value| result[key] = text(value, LIMITS.fetch(key)) unless value.nil? || value == "" }
        result["domain"] = domain(result.fetch("domain")) if result.key?("domain")
        result["email"] = email(result.fetch("email")) if result.key?("email")
        # @type var required: Array[String]
        required = case kind
        when "person" then %w[name]
        when "verify" then %w[email]
        when "decision_maker" then %w[role]
        else []
        end
        WriteInput.invalid! unless required.all? { |key| !result.fetch(key, "").empty? }
        if kind != "verify" && result.fetch("domain", "").empty? && result.fetch("company", "").empty?
          WriteInput.invalid!
        end
        result
      end

      def self.rows(kind, rows, csv)
        WriteInput.invalid! unless KINDS.include?(kind) && (rows.nil? != csv.nil?)
        if csv
          WriteInput.invalid! if kind == "company" || !csv.is_a?(String) || csv.bytesize > 2_097_152 || !csv.valid_encoding?
          parsed_rows = [] # @type var parsed_rows: Array[Hash[String?, String?]]
          # AIDEV-NOTE: Parse raw rows so the typed CSV stream and header validation share one bounded path.
          headers = nil # @type var headers: Array[String?]?
          CSV.parse(csv.delete_prefix("\uFEFF"), headers: false, liberal_parsing: false) do |entry|
            if headers.nil?
              WriteInput.invalid! unless entry.all? { |header| header.is_a?(String) && LIMITS.key?(header) } && entry.uniq == entry
              headers = entry
              next
            end
            WriteInput.invalid! if parsed_rows.length >= 5000 || entry.length > headers.length
            parsed_rows << headers.zip(entry).to_h
          end
          rows = parsed_rows
        end
        WriteInput.invalid! unless rows.is_a?(Array) && rows.length.between?(1, kind == "company" ? 1 : 5000)
        rows.map { |value| row(kind, value) }
      rescue CSV::MalformedCSVError, ArgumentError
        WriteInput.invalid!
      end

      def self.suppression(kind, value)
        case kind
        when "domain" then domain(value)
        when "email" then email(value)
        when "person"
          normalized = text(value, 200).unicode_normalize(:nfkd).gsub(/\p{Mn}/, "").downcase.gsub(/\s+/, " ")
          WriteInput.invalid! if normalized.empty?
          normalized
        else WriteInput.invalid!
        end
      end
    end
  end
end
