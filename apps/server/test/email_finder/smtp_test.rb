# frozen_string_literal: true
require "minitest/autorun"
require "minitest/mock"
require_relative "../../lib/elevateo/email_finder/smtp"

class EmailFinderSmtpTest < Minitest::Test
  def with_server(code, message, greeting: "220 fake SMTP ready", ehlo: "250 OK", sender: "250 OK", reset: "250 OK", quit: "221 goodbye", tls_context: nil)
    server = TCPServer.new("127.0.0.1", 0)
    commands = []
    thread = Thread.new do
      client = server.accept
      client.write("#{greeting}\r\n")
      while (line = client.gets)
        commands << line.strip
        verb = line.split.first
        reply = case verb
        when "EHLO" then client.is_a?(OpenSSL::SSL::SSLSocket) ? "250 TLS ready" : ehlo
        when "MAIL" then sender
        when "RCPT" then "#{code} #{message}"
        when "RSET" then reset
        when "QUIT" then quit
        when "STARTTLS" then tls_context ? "220 begin TLS" : "454 TLS unavailable"
        else "250 OK"
        end
        break if reply.nil?
        client.write("#{reply}\r\n")
        if verb == "STARTTLS" && tls_context
          client = OpenSSL::SSL::SSLSocket.new(client, tls_context)
          client.sync_close = true
          client.accept
        end
        break if verb == "QUIT"
      end
    ensure
      client&.close
    end
    connector = ->(*_args, **_options) { TCPSocket.new("127.0.0.1", server.addr[1]) }
    result = Elevateo::EmailFinder::DNS.stub(:address, "127.0.0.1") do
      Socket.stub(:tcp, connector) do
        Elevateo::EmailFinder::Smtp.new(hostname: "probe.example.com").probe(host: "mx.example.com", email: "jane@example.com")
      end
    end
    thread.join(2)
    yield result, commands
  ensure
    thread&.kill
    server&.close
  end

  def test_valid_and_no_data_command
    with_server(250, "recipient accepted") do |result, commands|
      assert_equal "valid", result.fetch("status")
      assert_equal ["EHLO probe.example.com", "MAIL FROM:<probe@probe.example.com>", "RCPT TO:<jane@example.com>", "RSET", "QUIT"], commands
    end
  end

  def test_invalid_and_greylisted_replies
    with_server(550, "no mailbox") { |result, _| assert_equal "invalid", result.fetch("status") }
    with_server(421, "try later") do |result, _|
      assert_equal "unknown", result.fetch("status")
      assert result.fetch("temporary")
    end
  end

  def test_catch_all_and_blocklist_signal
    with_server(250, "any recipient accepted") { |result, _| assert_equal 250, result.fetch("code") }
    [250, 550].each do |code|
      with_server(code, "Spamhaus blocked") do |result, _|
        assert result.fetch("blocklisted")
        assert_equal "unknown", result.fetch("status")
      end
    end
  end

  def test_private_network_and_injection_rejected
    %w[127.0.0.1 10.1.2.3 169.254.169.254 ::1 ::ffff:127.0.0.1].each do |ip|
      refute Elevateo::EmailFinder::DNS.public_ip?(ip)
    end
    assert_raises(ArgumentError) { Elevateo::EmailFinder::Smtp.new(hostname: "bad\r\nDATA") }
  end

  def test_only_recipient_acceptance_counts
    with_server(250, "OK", greeting: "250 wrong greeting") do |result, commands|
      assert_equal "unknown", result.fetch("status")
      assert_empty commands
    end
    with_server(250, "OK", sender: "550 sender denied") do |result, commands|
      assert_equal "unknown", result.fetch("status")
      refute(commands.any? { |command| command.start_with?("RCPT") })
    end
  end

  def test_blocklist_success_phase_and_cleanup_disconnect_are_preserved
    with_server(250, "OK", ehlo: "250 poor reputation") { |result, _| assert result.fetch("blocklisted") }
    with_server(250, "OK", reset: "421 Spamhaus blocked", quit: nil) do |result, _|
      assert result.fetch("blocklisted")
      assert result.fetch("temporary")
      assert_equal "unknown", result.fetch("status")
    end
  end

  def test_truncated_or_malformed_multiline_keeps_backoff_evidence
    ["421-Spamhaus blocked\r\nmalformed", "421-Spamhaus blocked\r\n250 inconsistent"].each do |reply|
      with_server(250, "OK", ehlo: reply) do |result, _|
        assert result.fetch("blocklisted")
        assert result.fetch("temporary")
        assert_equal "unknown", result.fetch("status")
      end
    end
  end

  def test_successful_starttls_repeats_ehlo_before_recipient
    key = OpenSSL::PKey::RSA.new(2048)
    certificate = OpenSSL::X509::Certificate.new
    certificate.version = 2
    certificate.serial = 1
    certificate.subject = certificate.issuer = OpenSSL::X509::Name.parse("/CN=mx.example.com")
    certificate.public_key = key.public_key
    certificate.not_before = Time.now - 60
    certificate.not_after = Time.now + 3600
    extensions = OpenSSL::X509::ExtensionFactory.new
    extensions.subject_certificate = extensions.issuer_certificate = certificate
    certificate.add_extension(extensions.create_extension("basicConstraints", "CA:TRUE", true))
    certificate.add_extension(extensions.create_extension("subjectAltName", "DNS:mx.example.com"))
    certificate.sign(key, OpenSSL::Digest.new("SHA256"))
    server_context = OpenSSL::SSL::SSLContext.new
    server_context.cert = certificate
    server_context.key = key
    client_context = OpenSSL::SSL::SSLContext.new
    client_context.cert_store = OpenSSL::X509::Store.new
    client_context.cert_store.add_cert(certificate)
    OpenSSL::SSL::SSLContext.stub(:new, client_context) do
      with_server(250, "accepted", ehlo: "250-fake\r\n250 STARTTLS", tls_context: server_context) do |result, commands|
        assert_equal "valid", result.fetch("status")
        assert_equal ["EHLO probe.example.com", "STARTTLS", "EHLO probe.example.com",
          "MAIL FROM:<probe@probe.example.com>", "RCPT TO:<jane@example.com>", "RSET", "QUIT"], commands
      end
    end
  end

  def test_starttls_is_attempted_and_failure_is_unknown
    with_server(250, "OK", ehlo: "250-fake\r\n250 STARTTLS") do |result, commands|
      assert_includes commands, "STARTTLS"
      assert result.fetch("temporary")
      assert_equal "unknown", result.fetch("status")
      refute(commands.any? { |command| command.start_with?("RCPT") })
    end
  end
end
