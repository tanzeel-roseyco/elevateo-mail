# frozen_string_literal: true

require "net/imap"
require "openssl"
require_relative "fake_ingress"

module Elevateo
  module Inbound
    # AIDEV-NOTE: Only a server-side resolver sees synthetic credentials; every connection requires verified TLS.
    class TlsImapTransport
      MAX_DISCOVERED_UIDS = 10_000

      class Session
        def initialize(client)
          @client = client
        end

        def verified_tls? = true

        def uidvalidity
          response = @client.responses.fetch("UIDVALIDITY", []).last
          value = response.respond_to?(:data) ? response.data : response
          raise Rejected, "invalid_imap_identity" unless value.is_a?(Integer) && value.positive?

          value
        end

        def fetch_after(cursor, limit:)
          raise Rejected, "invalid_imap_batch" unless cursor.is_a?(Integer) && cursor >= 0 &&
            limit.is_a?(Integer) && limit.between?(1, 50)

          ids = @client.uid_search(["UID", "#{cursor + 1}:*"])
          raise Rejected, "invalid_imap_batch" unless ids.is_a?(Array) && ids.length <= MAX_DISCOVERED_UIDS &&
            ids.all? { |id| id.is_a?(Integer) && id.positive? }

          remaining = ids.select { |id| id > cursor }.sort
          raise Rejected, "invalid_imap_batch" unless remaining.uniq.length == remaining.length

          # AIDEV-NOTE: Fetch the smallest pending UIDs first; committing only that prefix preserves the next scan.
          remaining.first(limit).map do |uid|
            rows = @client.uid_fetch(uid, ["BODY.PEEK[]<0.#{FakeIngress::MAX_RAW + 1}>"])
            raise Rejected, "invalid_imap_batch" unless rows.is_a?(Array) && rows.length == 1

            attributes = rows.first.attr
            pair = attributes.find { |key, value| key.start_with?("BODY[") && value.is_a?(String) }
            raw = pair&.last
            raise Rejected, "invalid_mime" unless raw.is_a?(String) && raw.bytesize.between?(1, FakeIngress::MAX_RAW)

            { uid: uid, raw_mime: raw }
          end
        end

        def close
          @client.disconnect
        end
      end

      def initialize(host:, credential_resolver:, port: 993, mailbox: "INBOX", ca_file: nil, client_factory: Net::IMAP)
        raise Rejected, "invalid_imap_host" unless host.is_a?(String) &&
          /\A[a-z0-9][a-z0-9.-]{0,252}\z/i.match?(host) &&
          port.is_a?(Integer) && port.between?(1, 65_535) && mailbox == "INBOX" &&
          (ca_file.nil? || (ca_file.is_a?(String) && ca_file.start_with?("/") && !ca_file.include?("\0")))

        @host, @port, @mailbox, @ca_file = host, port, mailbox, ca_file
        @resolver, @factory = credential_resolver, client_factory
      end

      def open(credential_ref:)
        raise Rejected, "account_unavailable" unless credential_ref.is_a?(String) &&
          /\Atest:[A-Za-z0-9_.:-]{1,120}\z/.match?(credential_ref)

        credentials = @resolver.call(credential_ref)
        raise Rejected, "account_unavailable" unless credentials.is_a?(Array) && credentials.length == 2 &&
          credentials.all? { |value| value.is_a?(String) && !value.empty? }

        ssl_options = { verify_mode: OpenSSL::SSL::VERIFY_PEER, verify_hostname: true }
        ssl_options[:ca_file] = @ca_file if @ca_file
        client = @factory.new(@host, port: @port, ssl: ssl_options)
        client.login(*credentials)
        client.select(@mailbox)
        Session.new(client)
      rescue StandardError
        client&.disconnect
        raise
      end
    end
  end
end
