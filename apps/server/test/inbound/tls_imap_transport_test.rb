# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/inbound/tls_imap_transport"

class TlsImapTransportTest < Minitest::Test
  class Client
    attr_reader :options, :login_args, :selected, :disconnected
    def initialize(host, **options)
      @host, @options = host, options
    end
    def login(*args) = (@login_args = args)
    def select(mailbox) = (@selected = mailbox)
    def responses = { "UIDVALIDITY" => [42] }
    def uid_search(_) = [7]
    def uid_fetch(_, _)
      [Struct.new(:attr).new({ "BODY[]<0>" => "From: sender@example.invalid\r\nTo: inbox@example.invalid\r\nContent-Type: text/plain\r\n\r\nhello" })]
    end
    def disconnect = (@disconnected = true)
  end

  class BacklogClient < Client
    attr_reader :fetched
    def uid_search(_) = (1..75).to_a.reverse
    def uid_fetch(uid, fields)
      (@fetched ||= []) << uid
      super
    end
  end

  def test_verified_tls_and_bounded_partial_fetch
    transport = Elevateo::Inbound::TlsImapTransport.new(host: "mox.test",
      credential_resolver: ->(ref) { raise "wrong ref" unless ref == "test:synthetic"; ["user", "synthetic-password"] },
      client_factory: Client)
    session = transport.open(credential_ref: "test:synthetic")
    client = session.instance_variable_get(:@client)
    assert_equal OpenSSL::SSL::VERIFY_PEER, client.options.fetch(:ssl).fetch(:verify_mode)
    assert_equal true, client.options.fetch(:ssl).fetch(:verify_hostname)
    assert_equal ["user", "synthetic-password"], client.login_args
    assert_equal "INBOX", client.selected
    assert_equal 42, session.uidvalidity
    assert_equal 7, session.fetch_after(0, limit: 50).first.fetch(:uid)
    session.close
    assert client.disconnected
  end

  def test_unsupported_reference_is_denied_before_connection
    transport = Elevateo::Inbound::TlsImapTransport.new(host: "mox.test",
      credential_resolver: ->(_) { raise "resolver must not run" }, client_factory: Client)
    assert_equal "account_unavailable", assert_raises(Elevateo::Inbound::Rejected) {
      transport.open(credential_ref: "prod:mailbox")
    }.code
  end

  def test_reordered_discovery_fetches_oldest_fifty_then_remaining_twenty_five
    transport = Elevateo::Inbound::TlsImapTransport.new(host: "mox.test",
      credential_resolver: ->(_) { ["user", "synthetic-password"] }, client_factory: BacklogClient)
    session = transport.open(credential_ref: "test:synthetic")
    assert_equal (1..50).to_a, session.fetch_after(0, limit: 50).map { |event| event.fetch(:uid) }
    assert_equal (51..75).to_a, session.fetch_after(50, limit: 50).map { |event| event.fetch(:uid) }
    assert_equal (1..75).to_a, session.instance_variable_get(:@client).fetched
    session.close
  end

  def test_synthetic_mox_certificate_uses_explicit_ca_and_hostname_verification
    transport = Elevateo::Inbound::TlsImapTransport.new(host: "localhost", port: 1993,
      ca_file: "/synthetic/localserve/localhost.crt",
      credential_resolver: ->(_) { ["user", "synthetic-password"] }, client_factory: Client)
    session = transport.open(credential_ref: "test:synthetic")
    ssl = session.instance_variable_get(:@client).options.fetch(:ssl)
    assert_equal "/synthetic/localserve/localhost.crt", ssl.fetch(:ca_file)
    assert_equal true, ssl.fetch(:verify_hostname)
    assert_equal OpenSSL::SSL::VERIFY_PEER, ssl.fetch(:verify_mode)
    session.close
  end
end
