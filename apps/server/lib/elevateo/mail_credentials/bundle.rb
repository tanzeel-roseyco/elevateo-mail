# frozen_string_literal: true

require_relative "binding"

module Elevateo
  module MailCredentials
    # AIDEV-NOTE: Load once per worker; rotate by replacing the private file and restarting after SQL version revocation.
    class Bundle
      MAX_BYTES = 2 * 1024 * 1024
      MAX_ENTRIES = 1424
      KEYS = %w[account_id credential_ref credential_version mailbox_id organization_id password protocol username].freeze

      def initialize(path:)
        @entries = {}
        raise Unavailable, "mail_credentials_unavailable" unless path.is_a?(String) &&
          path.start_with?("/") && !path.include?("\0")

        bytes = read_private(path)
        value = JSON.parse(bytes, object_class: UniqueObject, max_nesting: 4)
        raise Unavailable, "mail_credentials_unavailable" unless value.is_a?(Hash) &&
          value.keys.sort == %w[entries format_version] && value["format_version"].is_a?(Integer) &&
          value["format_version"] == 1

        entries = value["entries"]
        raise Unavailable, "mail_credentials_unavailable" unless entries.is_a?(Array) &&
          entries.length.between?(1, MAX_ENTRIES)

        entries.each { |entry| add(entry) }
        @entries.freeze
        freeze
      rescue SystemCallError, IOError, JSON::ParserError, ArgumentError, Unavailable
        # AIDEV-NOTE: Parser and filesystem exceptions can expose bytes or paths; discard their causes as well as messages.
        raise Unavailable, "mail_credentials_unavailable", cause: nil
      end

      def call(binding, protocol:)
        @entries.fetch(binding.key(protocol: protocol))
      rescue KeyError, Unavailable
        raise Unavailable, "mail_credentials_unavailable", cause: nil
      end

      def inspect = "#<Elevateo::MailCredentials::Bundle redacted>"
      alias to_s inspect

      private

      def read_private(path)
        File.open(path, File::RDONLY | File::NONBLOCK | File::NOFOLLOW) do |file|
          stat = file.stat
          unless stat.file? && stat.nlink == 1 && (stat.mode & 0o7777) == 0o600 &&
              [0, Process.uid].include?(stat.uid) && stat.size.between?(1, MAX_BYTES)
            raise Unavailable, "mail_credentials_unavailable"
          end
          bytes = file.read(MAX_BYTES + 1)
          raise Unavailable, "mail_credentials_unavailable" unless bytes && bytes.bytesize.between?(1, MAX_BYTES)

          bytes.force_encoding(Encoding::UTF_8)
          raise Unavailable, "mail_credentials_unavailable" unless bytes.valid_encoding?

          bytes
        end
      end

      def add(entry)
        raise Unavailable, "mail_credentials_unavailable" unless entry.is_a?(Hash) && entry.keys.sort == KEYS

        binding = Binding.new(account_id: entry["account_id"], organization_id: entry["organization_id"],
          mailbox_id: entry["mailbox_id"], credential_version: entry["credential_version"],
          credential_ref: entry["credential_ref"])
        protocol, username, password = entry["protocol"], entry["username"], entry["password"]
        raise Unavailable, "mail_credentials_unavailable" unless protocol.is_a?(String) &&
          username.is_a?(String) && username.bytesize.between?(1, 254) && !/[\r\n\0]/.match?(username) &&
          password.is_a?(String) && password.bytesize.between?(1, 4096) && !/[\r\n\0]/.match?(password)

        key = binding.key(protocol: protocol)
        raise Unavailable, "mail_credentials_unavailable" if @entries.key?(key)

        # @type var credentials: [String, String]
        credentials = [username.freeze, password.freeze]
        @entries[key] = credentials.freeze
      end

      class UniqueObject < Hash
        def []=(key, value)
          raise Unavailable, "mail_credentials_unavailable" if key?(key)

          super
        end
      end
    end
  end
end
