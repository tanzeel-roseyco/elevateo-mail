# frozen_string_literal: true

require "minitest/autorun"
require "socket"
require "tempfile"
require_relative "../../lib/elevateo/inbound/tls_imap_transport"
require_relative "../support/mail_binding"

class ImapDeadlineIoTest < Minitest::Test
  include MailBindingFixture
  Deadline = Elevateo::Inbound::ImapDeadline
  Owned = Elevateo::Inbound::OwnedImapClient
  Transport = Elevateo::Inbound::TlsImapTransport

  # AIDEV-NOTE: This private loopback server runs only inside fleet Docker; it never contacts a real mail provider.
  def with_server(mode)
    listener = TCPServer.new("127.0.0.1", 0)
    port = listener.addr[1]
    accepted = nil
    peer_closed = Queue.new
    cert_file = Tempfile.new("synthetic-imap-ca")
    context = tls_context
    cert_file.write(context.cert.to_pem)
    cert_file.close
    thread = Thread.new do
      raw = listener.accept
      accepted = raw
      socket = raw
      if mode != :tls_stall
        socket = OpenSSL::SSL::SSLSocket.new(raw, context)
        socket.sync_close = true
        socket.accept
        unless mode == :greeting_stall
          socket.write("* OK [CAPABILITY IMAP4rev1] synthetic\r\n")
          while (line = socket.gets)
            tag, command = line.split(" ", 3)
            if (mode == :login_stall && command == "LOGIN") ||
                (mode == :fetch_stall && command == "UID")
              break
            end
            if mode == :oversized && command == "UID"
              socket.write("* 1 FETCH (BODY[] {2097153}\r\n")
              break
            end
            socket.write("* OK [UIDVALIDITY 42] selected\r\n") if command == "SELECT"
            socket.write("#{tag} OK synthetic\r\n")
          end
        end
      end
      # AIDEV-NOTE: EOF from client cleanup is observable independently of its own closed? bookkeeping.
      socket.read
      peer_closed << true
    rescue IOError, OpenSSL::SSL::SSLError, SystemCallError
      peer_closed << true
    ensure
      socket&.close
      raw&.close unless raw&.closed?
    end
    yield port, cert_file.path, peer_closed
  ensure
    accepted&.close unless accepted&.closed?
    listener&.close
    thread&.kill unless thread&.join(1)
    thread&.join(1)
    cert_file&.unlink
  end

  def tls_context
    key = OpenSSL::PKey::RSA.new(2048)
    cert = OpenSSL::X509::Certificate.new
    cert.version, cert.serial = 2, 1
    cert.subject = cert.issuer = OpenSSL::X509::Name.parse("/CN=localhost")
    cert.public_key = key.public_key
    cert.not_before, cert.not_after = Time.now - 60, Time.now + 600
    ext = OpenSSL::X509::ExtensionFactory.new
    ext.subject_certificate = ext.issuer_certificate = cert
    cert.add_extension(ext.create_extension("basicConstraints", "CA:TRUE", true))
    cert.add_extension(ext.create_extension("subjectAltName", "DNS:localhost"))
    cert.sign(key, OpenSSL::Digest.new("SHA256"))
    context = OpenSSL::SSL::SSLContext.new
    context.key, context.cert = key, cert
    context
  end

  def assert_no_connection_leaks
    Deadline.new.call { nil } # Start Timeout's process-owned watchdog before measuring task resources.
    descriptors = Dir.children("/proc/self/fd").length
    before = Thread.list
    yield
    leaked = (Thread.list - before).select { |t| t.backtrace&.any? { |frame| frame.include?("net/imap") } }
    assert_empty leaked
    assert_equal descriptors, Dir.children("/proc/self/fd").length
  end

  def test_tls_and_greeting_stalls_close_raw_socket_before_constructor_returns
    assert_no_connection_leaks do
      [:tls_stall, :greeting_stall].each do |mode|
        with_server(mode) do |port, ca_file, closed|
          started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
          assert_raises(Deadline::Expired) do
            Owned.new("localhost", port: port,
              ssl: { verify_mode: OpenSSL::SSL::VERIFY_PEER, verify_hostname: true, ca_file: ca_file },
              deadline: Deadline.new(seconds: 0.3), cleanup_failure: -> {})
          end
          assert_operator Process.clock_gettime(Process::CLOCK_MONOTONIC) - started, :<, 2
          assert Timeout.timeout(2) { closed.pop }
        end
      end
    end
  end

  def test_login_and_search_stalls_close_session_and_receiver_repeatedly
    assert_no_connection_leaks do
      [:login_stall, :fetch_stall, :login_stall].each do |mode|
        with_server(mode) do |port, ca_file, closed|
          transport = Transport.new(host: "localhost", port: port, ca_file: ca_file, session_timeout: 0.3,
            credential_resolver: ->(*, **) { ["synthetic", "test-password"] })
          session = nil
          assert_raises(Deadline::Expired) do
            begin
              session = transport.open(binding: mail_binding)
              session.fetch_after(0, limit: 1)
            ensure
              session&.close
            end
          end
          assert Timeout.timeout(2) { closed.pop }
        end
      end
    end
  end

  def test_explicit_client_limits_are_not_inherited_from_global_debug
    previous_debug = Net::IMAP.debug
    Net::IMAP.debug = true
    with_server(:fetch_stall) do |port, ca_file, _|
      client = Owned.new("localhost", port: port,
        ssl: { verify_mode: OpenSSL::SSL::VERIFY_PEER, verify_hostname: true, ca_file: ca_file },
        deadline: Deadline.new(seconds: 2), cleanup_failure: -> {})
      assert_equal false, client.config.debug
      assert_equal 2 * 1024 * 1024, client.config.max_response_size
      assert_equal 3, client.config.open_timeout
    ensure
      client&.disconnect
    end
  ensure
    Net::IMAP.debug = previous_debug
  end

  def test_timeout_after_receiver_creation_joins_the_captured_thread
    receivers = []
    stalled = Class.new(Owned)
    stalled.define_method(:start_receiver_thread) do
      receivers << super()
      sleep 1
      receivers.last
    end
    assert_no_connection_leaks do
      with_server(:fetch_stall) do |port, ca_file, closed|
        assert_raises(Deadline::Expired) do
          stalled.new("localhost", port: port,
            ssl: { verify_mode: OpenSSL::SSL::VERIFY_PEER, verify_hostname: true, ca_file: ca_file },
            deadline: Deadline.new(seconds: 0.3), cleanup_failure: -> {})
        end
        assert_equal 1, receivers.length
        refute receivers.fetch(0).alive?
        assert Timeout.timeout(2) { closed.pop }
      end
    end
  end

  def test_oversized_literal_is_rejected_before_reading_its_body
    assert_no_connection_leaks do
      with_server(:oversized) do |port, ca_file, closed|
        transport = Transport.new(host: "localhost", port: port, ca_file: ca_file, session_timeout: 2,
          credential_resolver: ->(*, **) { ["synthetic", "test-password"] })
        session = transport.open(binding: mail_binding)
        begin
          assert_raises(Net::IMAP::ResponseTooLargeError) { session.fetch_after(0, limit: 1) }
        ensure
          session.close
        end
        assert Timeout.timeout(2) { closed.pop }
      end
    end
  end
end
