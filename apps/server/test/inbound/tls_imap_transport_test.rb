# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/inbound/tls_imap_transport"
require_relative "../support/mail_binding"

class TlsImapTransportTest < Minitest::Test
  include MailBindingFixture
  class Client
    attr_reader :options, :login_args, :selected, :disconnected, :search_criteria
    def initialize(host, **options)
      @host, @options = host, options
    end
    def login(*args) = (@login_args = args)
    def select(mailbox) = (@selected = mailbox)
    def responses = { "UIDVALIDITY" => [42] }
    def uid_search(criteria)
      @search_criteria = criteria
      [7]
    end
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
      credential_resolver: ->(binding, protocol:) {
        assert_equal mail_binding.key(protocol: "imap"), binding.key(protocol: protocol)
        ["user", "synthetic-password"]
      },
      client_factory: Client)
    session = transport.open(binding: mail_binding)
    client = session.instance_variable_get(:@client)
    assert_equal OpenSSL::SSL::VERIFY_PEER, client.options.fetch(:ssl).fetch(:verify_mode)
    assert_equal true, client.options.fetch(:ssl).fetch(:verify_hostname)
    assert_equal ["user", "synthetic-password"], client.login_args
    assert_equal "INBOX", client.selected
    assert_equal 42, session.uidvalidity
    assert_equal 7, session.fetch_after(0, limit: 50).first.fetch(:uid)
    # AIDEV-NOTE: A String looks equivalent in a mock but emits invalid quoted UID syntax on a real Mox connection.
    assert_equal "UID", client.search_criteria.first
    assert_instance_of Net::IMAP::SequenceSet, client.search_criteria.last
    assert_equal "1:*", client.search_criteria.last.to_s
    session.close
    assert client.disconnected
  end

  def test_unsupported_reference_is_denied_before_connection
    transport = Elevateo::Inbound::TlsImapTransport.new(host: "mox.test",
      credential_resolver: ->(*) { raise "resolver must not run" }, client_factory: Client)
    assert_equal "account_unavailable", assert_raises(Elevateo::Inbound::Rejected) {
      transport.open(binding: "prod:mailbox")
    }.code
  end

  def test_uid_ceiling_is_empty_without_searching_an_invalid_range
    client = Client.new("mox.test")
    session = Elevateo::Inbound::TlsImapTransport::Session.new(client)
    assert_empty session.fetch_after((2**32) - 1, limit: 50)
    assert_nil client.search_criteria
  end

  def test_server_uid_and_validity_must_fit_unsigned_32_bits
    client = Client.new("mox.test")
    fetched = 0
    client.define_singleton_method(:uid_fetch) { |*_| fetched += 1 }
    session = Elevateo::Inbound::TlsImapTransport::Session.new(client)
    [0, -1, 2**32, "1", nil].each do |value|
      client.define_singleton_method(:uid_search) { |_| [value] }
      client.define_singleton_method(:responses) { { "UIDVALIDITY" => [value] } }
      assert_raises(Elevateo::Inbound::Rejected) { session.fetch_after(0, limit: 50) }
      assert_raises(Elevateo::Inbound::Rejected) { session.uidvalidity }
    end
    assert_equal 0, fetched
    client.define_singleton_method(:responses) { { "UIDVALIDITY" => [(2**32) - 1] } }
    assert_equal (2**32) - 1, session.uidvalidity
  end

  def test_invalid_uid_and_batch_boundaries_fail_before_network_access
    client = Client.new("mox.test")
    session = Elevateo::Inbound::TlsImapTransport::Session.new(client)
    [[nil, 50], [-1, 50], [2**32, 50], [0, 0], [0, 51], [0, nil]].each do |cursor, limit|
      assert_equal "invalid_imap_batch", assert_raises(Elevateo::Inbound::Rejected) {
        session.fetch_after(cursor, limit: limit)
      }.code
    end
    assert_nil client.search_criteria
  end

  def test_reordered_discovery_fetches_oldest_fifty_then_remaining_twenty_five
    transport = Elevateo::Inbound::TlsImapTransport.new(host: "mox.test",
      credential_resolver: ->(*, **) { ["user", "synthetic-password"] }, client_factory: BacklogClient)
    session = transport.open(binding: mail_binding)
    assert_equal (1..50).to_a, (session.fetch_after(0, limit: 50).map { |event| event.fetch(:uid) })
    assert_equal (51..75).to_a, (session.fetch_after(50, limit: 50).map { |event| event.fetch(:uid) })
    assert_equal (1..75).to_a, session.instance_variable_get(:@client).fetched
    session.close
  end

  def test_synthetic_mox_certificate_uses_explicit_ca_and_hostname_verification
    transport = Elevateo::Inbound::TlsImapTransport.new(host: "localhost", port: 1993,
      ca_file: "/synthetic/localserve/localhost.crt",
      credential_resolver: ->(*, **) { ["user", "synthetic-password"] }, client_factory: Client)
    session = transport.open(binding: mail_binding)
    ssl = session.instance_variable_get(:@client).options.fetch(:ssl)
    assert_equal "/synthetic/localserve/localhost.crt", ssl.fetch(:ca_file)
    assert_equal true, ssl.fetch(:verify_hostname)
    assert_equal OpenSSL::SSL::VERIFY_PEER, ssl.fetch(:verify_mode)
    session.close
  end
end
