# frozen_string_literal: true

module Elevateo
  module SendAPI
    # AIDEV-NOTE: This product grammar folds only domains; unsent drafts retain their original spelling.
    module Address
      LOCAL = /\A[A-Za-z0-9!#$%&'*+\-\/=?^_`{|}~]+(?:\.[A-Za-z0-9!#$%&'*+\-\/=?^_`{|}~]+)*\z/
      LABEL = /\A[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\z/

      def self.canonical(value)
        return nil unless value.is_a?(String) && value.ascii_only? && value.bytesize <= 254
        parts = value.split("@", -1)
        return nil unless parts.length == 2
        local, domain = parts
        return nil unless local && domain && local.bytesize.between?(1, 64) && LOCAL.match?(local)
        labels = domain.split(".", -1)
        return nil unless labels.length >= 2 && labels.all? { |label| LABEL.match?(label) }
        "#{local}@#{domain.downcase}"
      end

      def self.header?(value)
        value.is_a?(String) && value.valid_encoding? && !/[\x00-\x1f\x7f]/.match?(value)
      end
    end
  end
end
