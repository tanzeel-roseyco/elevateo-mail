# frozen_string_literal: true

require_relative "owned_imap_client"
require "openssl"
require_relative "fake_ingress"
require_relative "../mail_credentials/binding"

module Elevateo
  module Inbound
    # AIDEV-NOTE: SQL-bound account identity reaches the private resolver before any connection; TLS is always verified.
    class TlsImapTransport
      MAX_DISCOVERED_UIDS = 10_000
      MAX_UID = 4_294_967_295

      class Session
        def initialize(client, deadline: ImapDeadline.new, cleanup_failure: -> {})
          @client, @deadline, @cleanup_failure = client, deadline, cleanup_failure
          @closed = false
        end

        def verified_tls? = true

        def uidvalidity
          response = @deadline.call { @client.responses.fetch("UIDVALIDITY", []).last }
          value = response.respond_to?(:data) ? response.data : response
          raise Rejected, "invalid_imap_identity" unless value.is_a?(Integer) && value.between?(1, MAX_UID)

          value
        end

        def fetch_after(cursor, limit:)
          raise Rejected, "invalid_imap_batch" unless cursor.is_a?(Integer) && cursor.between?(0, MAX_UID) &&
            limit.is_a?(Integer) && limit.between?(1, 50)
          return [] if cursor == MAX_UID

          # AIDEV-NOTE: net-imap quotes String criteria; a typed sequence set preserves the required UID wire syntax.
          ids = @deadline.call { @client.uid_search(["UID", Net::IMAP::SequenceSet.new("#{cursor + 1}:*")]) }
          raise Rejected, "invalid_imap_batch" unless ids.is_a?(Array) && ids.length <= MAX_DISCOVERED_UIDS &&
            ids.all? { |id| id.is_a?(Integer) && id.between?(1, MAX_UID) }

          remaining = ids.select { |id| id > cursor }.sort
          raise Rejected, "invalid_imap_batch" unless remaining.uniq.length == remaining.length

          # AIDEV-NOTE: Fetch the smallest pending UIDs first; committing only that prefix preserves the next scan.
          remaining.first(limit).map do |uid|
            rows = @deadline.call { @client.uid_fetch(uid, ["BODY.PEEK[]<0.#{FakeIngress::MAX_RAW + 1}>"]) }
            raise Rejected, "invalid_imap_batch" unless rows.is_a?(Array) && rows.length == 1

            attributes = rows.first.attr
            pair = attributes.find { |key, value| key.start_with?("BODY[") && value.is_a?(String) }
            raw = pair&.last
            raise Rejected, "invalid_mime" unless raw.is_a?(String) && raw.bytesize.between?(1, FakeIngress::MAX_RAW)

            { uid: uid, raw_mime: raw }
          end
        end

        def close
          primary_error = $!
          return if @closed

          @closed = true
          @client.disconnect
        rescue StandardError => cleanup_error
          @cleanup_failure.call
          ImapCleanup.reraise(primary_error, cleanup_error) if primary_error

          raise
        end
      end

      def initialize(host:, credential_resolver:, port: 993, mailbox: "INBOX", ca_file: nil,
        client_factory: OwnedImapClient, session_timeout: 15.0)
        raise Rejected, "invalid_imap_host" unless host.is_a?(String) &&
          /\A[a-z0-9][a-z0-9.-]{0,252}\z/i.match?(host) &&
          port.is_a?(Integer) && port.between?(1, 65_535) && mailbox == "INBOX" &&
          (ca_file.nil? || (ca_file.is_a?(String) && ca_file.start_with?("/") && !ca_file.include?("\0")))

        @host, @port, @mailbox, @ca_file = host, port, mailbox, ca_file
        @resolver, @factory = credential_resolver, client_factory
        ImapDeadline.new(seconds: session_timeout)
        @session_timeout = session_timeout
        @available = true
      end

      def open(binding:)
        raise Rejected, "account_unavailable" unless @available && binding.is_a?(MailCredentials::Binding)

        credentials = @resolver.call(binding, protocol: "imap")
        raise Rejected, "account_unavailable" unless credentials.is_a?(Array) && credentials.length == 2 &&
          credentials.all? { |value| value.is_a?(String) && !value.empty? }

        # @type var ssl_options: Hash[Symbol, Integer | String | bool]
        ssl_options = { verify_mode: OpenSSL::SSL::VERIFY_PEER, verify_hostname: true }
        ca_file = @ca_file
        ssl_options[:ca_file] = ca_file if ca_file
        deadline = ImapDeadline.new(seconds: @session_timeout)
        cleanup_failure = -> { @available = false }
        client = @factory.new(@host, port: @port, ssl: ssl_options,
          deadline: deadline, cleanup_failure: cleanup_failure)
        deadline.call { client.login(credentials.fetch(0), credentials.fetch(1)) }
        deadline.call { client.select(@mailbox) }
        Session.new(client, deadline: deadline, cleanup_failure: cleanup_failure)
      rescue StandardError => primary_error
        begin
          client&.disconnect
        rescue StandardError => cleanup_error
          @available = false
          ImapCleanup.reraise(primary_error, cleanup_error)
        end
        raise
      end
    end
  end
end
