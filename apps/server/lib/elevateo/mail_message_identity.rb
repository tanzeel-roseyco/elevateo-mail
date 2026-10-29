# frozen_string_literal: true

module Elevateo
  # AIDEV-NOTE: Conservative RFC identifiers cross the MIME/SQL/snapshot boundary without header rewriting.
  module MailMessageIdentity
    PATTERN = /\A<[A-Za-z0-9.!\#$%&'*+\/=\?^_`{|}~-]+@[A-Za-z0-9.-]+>\z/

    def self.valid?(value)
      value.is_a?(String) && value.bytesize.between?(5, 998) && PATTERN.match?(value)
    end

    def self.from_mime(raw)
      headers = raw.split(/\r?\n\r?\n/, 2).first.to_s.gsub(/\r?\n[ \t]+/, " ")
      values = headers.split(/\r?\n/).filter_map do |line|
        name, value = line.split(":", 2)
        value&.strip if name&.casecmp?("Message-ID")
      end
      # Unsupported or ambiguous identifiers leave the message readable but unavailable for threaded sending.
      values.length == 1 && valid?(values.first) ? values.first : nil
    end
  end
end
