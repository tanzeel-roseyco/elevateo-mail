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

  def test_verified_tls_and_bounded_partial_fetch
    transport = Elevateo::Inbound::TlsImapTransport.new(host: "mox.test",
      credential_resolver: ->(ref) { raise "wrong ref" unless ref == "test:synthetic"; ["user", "synthetic-password"] },
      client_factory: Client)
    session = transport.open(credential_ref: "test:synthetic")
    client = session.instance_variable_get(:@client)
    assert_equal OpenSSL::SSL::VERIFY_PEER, client.options.fetch(:ssl).fetch(:verify_mode)
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
end
