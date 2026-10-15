# frozen_string_literal: true

require "net/imap"
require_relative "imap_deadline"
require_relative "imap_cleanup"

module Elevateo
  module Inbound
    # AIDEV-NOTE: net-imap 0.6.7 starts TLS in its constructor; retain raw IO even before the constructor can return.
    class OwnedImapClient < Net::IMAP
      class CleanupFailed < StandardError; end
      MAX_RESPONSE_BYTES = 2 * 1024 * 1024

      def initialize(host, port:, ssl:, deadline:, cleanup_failure:)
        @deadline, @cleanup_failure = deadline, cleanup_failure
        @raw_socket = nil
        @owned_receiver = nil
        deadline.call do
          super(host, port: port, ssl: ssl, open_timeout: 3,
            max_response_size: MAX_RESPONSE_BYTES, debug: false)
        end
      rescue StandardError => primary_error
        begin
          disconnect
        rescue StandardError => cleanup_error
          ImapCleanup.reraise(primary_error, cleanup_error)
        end
        raise
      end

      def disconnect
        begin
          close_socket
        ensure
          # AIDEV-NOTE: Socket cleanup failure must not skip the independent bounded receiver cleanup attempt.
          stop_receiver
        end
      rescue StandardError
        # AIDEV-NOTE: Only callers preserve primary errors; doing it here as well can create circular exception causes.
        @cleanup_failure.call
        raise
      end

      private

      def stop_receiver
        receiver = @owned_receiver
        return if receiver.nil? || receiver == Thread.current || receiver.join(0.25)

        receiver.kill
        raise CleanupFailed, "imap_cleanup_failed" unless receiver.join(0.25)
      end

      def close_socket
        socket = @raw_socket
        return if socket.nil? || socket.closed?

        begin
          socket.shutdown(Socket::SHUT_RDWR)
        rescue Errno::ENOTCONN, IOError
          # AIDEV-NOTE: A constructor or receiver may have already closed the connection; close remains mandatory.
        ensure
          socket.close unless socket.closed?
        end
      end

      def tcp_socket(host, port)
        stage_timeout = [3.0, @deadline.remaining / 2].min
        # AIDEV-NOTE: Native DNS/connect bounds let us register ownership atomically before delivering our timeout.
        socket = Thread.handle_interrupt(ImapDeadline::Expired => :never) do
          @raw_socket = Socket.tcp(host, port, connect_timeout: stage_timeout, resolv_timeout: stage_timeout)
        end
        @deadline.remaining
        socket.setsockopt(:SOL_SOCKET, :SO_KEEPALIVE, true)
        socket
      end

      def start_receiver_thread
        # AIDEV-NOTE: Capture before returning to the upstream assignment; timeout must not orphan a newly started thread.
        Thread.handle_interrupt(ImapDeadline::Expired => :never) { @owned_receiver = super }
      end
    end
  end
end
