# frozen_string_literal: true

require "minitest/autorun"
require "minitest/mock"
require_relative "../../lib/elevateo/inbound/tls_imap_transport"
require_relative "../../lib/elevateo/inbound/imap_sync"
require_relative "../support/mail_binding"

class ImapDeadlineTest < Minitest::Test
  include MailBindingFixture
  Deadline = Elevateo::Inbound::ImapDeadline
  Transport = Elevateo::Inbound::TlsImapTransport
  Owned = Elevateo::Inbound::OwnedImapClient

  class Client
    attr_accessor :pause, :failure, :close_failure
    attr_reader :closed, :deadline
    def initialize(_, deadline:, **)
      @deadline = deadline
      @pause = 0
    end
    def login(*)
      sleep @pause
      raise @failure if @failure
    end
    def select(*) = nil
    def responses = { "UIDVALIDITY" => [42] }
    def uid_search(*) = [1, 2]
    def uid_fetch(uid, *)
      sleep @pause if uid == 2
      [Struct.new(:attr).new({ "UID" => uid, "BODY[]" => "From: sender@example.invalid\r\nTo: inbox@example.invalid\r\nContent-Type: text/plain\r\n\r\nsynthetic" })]
    end
    def disconnect
      @closed = true
      raise @close_failure if @close_failure
    end
  end

  def transport(factory = Client, seconds: 0.1)
    Transport.new(host: "mox.test", session_timeout: seconds, client_factory: factory,
      credential_resolver: ->(*, **) { ["synthetic", "test-password"] })
  end

  def test_invalid_budgets_are_rejected
    [0, -1, 15.1, Float::INFINITY, Float::NAN, nil, "1"].each do |value|
      assert_raises(Elevateo::Inbound::Rejected) { Deadline.new(seconds: value) }
    end
    assert_operator Deadline.new(seconds: 15).remaining, :>, 0
  end

  def test_all_calls_share_absolute_budget_and_new_open_gets_a_new_one
    clock = 100.0
    Process.stub(:clock_gettime, ->(*) { clock }) do
      service = transport(seconds: 1)
      first = service.open(binding: mail_binding)
      first_deadline = first.instance_variable_get(:@deadline)
      clock += 0.75
      assert_in_delta 0.25, first_deadline.remaining
      assert_equal 2, first.fetch_after(0, limit: 2).length
      first.instance_variable_get(:@client).pause = 0.5
      # AIDEV-NOTE: Blocking work must get the remaining quarter-second, not a fresh one-second timer.
      assert_raises(Deadline::Expired) { first.fetch_after(0, limit: 2) }
      clock += 0.26
      assert_raises(Deadline::Expired) { first.fetch_after(0, limit: 2) }
      first.close
      second = service.open(binding: mail_binding)
      assert_operator second.instance_variable_get(:@deadline).remaining, :>, 0.9
      second.close
    end
  end

  def test_later_fetch_timeout_returns_no_partial_page
    session = transport.open(binding: mail_binding)
    client = session.instance_variable_get(:@client)
    client.pause = 0.3
    assert_raises(Deadline::Expired) { session.fetch_after(0, limit: 2) }
  ensure
    session&.close
    assert client.closed if client
  end

  def test_network_budget_does_not_interrupt_import_after_fetch
    records = []
    store = Object.new
    claim = { "binding" => mail_binding, "uidvalidity" => 42, "last_uid" => 0 }
    store.define_singleton_method(:claim) { |**| claim }
    store.define_singleton_method(:insert_once) do |**row|
      sleep 0.15
      records << row.fetch(:uid)
      { "result" => "created" }
    end
    sync = Elevateo::Inbound::ImapSync.new(store: store, transport: transport)
    assert_equal 2, sync.run(account_id: mail_binding.account_id, credential_version: 1)
    assert_equal [1, 2], records
  end

  def test_later_fetch_timeout_never_calls_durable_ingest
    records = []
    store = Object.new
    claim = { "binding" => mail_binding, "uidvalidity" => 42, "last_uid" => 0 }
    store.define_singleton_method(:claim) { |**| claim }
    store.define_singleton_method(:insert_once) { |**row| records << row }
    slow = Class.new(Client) do
      def initialize(*, **)
        super
        @pause = 0.3
      end
      def login(*) = nil
    end
    sync = Elevateo::Inbound::ImapSync.new(store: store, transport: transport(slow))
    assert_raises(Deadline::Expired) { sync.run(account_id: mail_binding.account_id, credential_version: 1) }
    assert_empty records
  end

  def test_login_failure_and_disconnect_failure_preserve_primary_and_quarantine
    primary = Deadline::Expired.new("synthetic timeout")
    cleanup = IOError.new("synthetic cleanup")
    client = nil
    factory = Object.new
    factory.define_singleton_method(:new) do |host, **options|
      client = Client.new(host, **options)
      client.failure, client.close_failure = primary, cleanup
      client
    end
    service = transport(factory)
    actual = assert_raises(Deadline::Expired) { service.open(binding: mail_binding) }
    assert_equal primary.class, actual.class
    assert_equal primary.message, actual.message
    assert_equal primary.backtrace, actual.backtrace
    assert_same cleanup, actual.cause
    assert client.closed
    assert_equal "account_unavailable", assert_raises(Elevateo::Inbound::Rejected) {
      service.open(binding: mail_binding)
    }.code
  end

  def test_session_cleanup_preserves_primary_and_is_idempotent
    service = transport
    session = service.open(binding: mail_binding)
    client = session.instance_variable_get(:@client)
    client.close_failure = IOError.new("synthetic cleanup")
    primary = RuntimeError.new("synthetic operation failure")
    actual = assert_raises(RuntimeError) do
      begin
        raise primary
      ensure
        session.close
      end
    end
    assert_equal primary.class, actual.class
    assert_equal primary.message, actual.message
    assert_equal primary.backtrace, actual.backtrace
    assert_same client.close_failure, actual.cause
    session.close
    assert_raises(Elevateo::Inbound::Rejected) { service.open(binding: mail_binding) }
  end

  def test_cleanup_preserves_error_details_without_circular_causes_or_backtrace_loss
    primary, cleanup = RuntimeError.new("primary"), IOError.new("cleanup")
    primary.set_backtrace(["primary:1"])
    cleanup.set_backtrace(["cleanup:2"])
    actual = assert_raises(RuntimeError) do
      begin
        raise primary
      rescue RuntimeError
        begin
          raise cleanup
        rescue IOError
          Elevateo::Inbound::ImapCleanup.reraise(primary, cleanup)
        end
      end
    end
    assert_equal primary.class, actual.class
    assert_equal primary.message, actual.message
    assert_equal primary.backtrace, actual.backtrace
    assert_same cleanup, actual.cause
    assert_same primary, cleanup.cause
    refute_same primary, actual
    assert_equal ["primary:1"], actual.backtrace
    assert_equal ["cleanup:2"], cleanup.backtrace
    same = assert_raises(RuntimeError) { Elevateo::Inbound::ImapCleanup.reraise(primary, primary) }
    assert_same primary, same
    assert_nil same.cause
  end

  def test_constructor_and_cleanup_failures_preserve_primary_error
    primary = Deadline::Expired.new("synthetic constructor timeout")
    cleanup = IOError.new("synthetic constructor cleanup")
    broken = Class.new(Owned)
    broken.define_method(:tcp_socket) { |*| raise primary }
    broken.define_method(:disconnect) { raise cleanup }
    actual = assert_raises(Deadline::Expired) do
      broken.new("mox.test", port: 993, ssl: {}, deadline: Deadline.new, cleanup_failure: -> {})
    end
    assert_equal primary.class, actual.class
    assert_equal primary.message, actual.message
    assert_equal primary.backtrace, actual.backtrace
    assert_same cleanup, actual.cause
  end

  def test_socket_cleanup_error_still_terminates_receiver
    receiver = Thread.new { sleep }
    quarantined = false
    client = Owned.allocate
    client.instance_variable_set(:@owned_receiver, receiver)
    client.instance_variable_set(:@cleanup_failure, -> { quarantined = true })
    client.define_singleton_method(:close_socket) { raise IOError, "synthetic shutdown failure" }
    assert_raises(IOError) { client.disconnect }
    refute receiver.alive?
    assert quarantined
  ensure
    receiver&.kill
    receiver&.join(1)
  end

  def test_failed_final_receiver_join_quarantines_and_reports_cleanup_failure
    receiver = Object.new
    calls = []
    receiver.define_singleton_method(:join) { |duration| calls << [:join, duration]; nil }
    receiver.define_singleton_method(:kill) { calls << [:kill] }
    client = Owned.allocate
    client.instance_variable_set(:@raw_socket, nil)
    client.instance_variable_set(:@owned_receiver, receiver)
    quarantined = false
    client.instance_variable_set(:@cleanup_failure, -> { quarantined = true })
    assert_raises(Owned::CleanupFailed) { client.disconnect }
    assert_equal [[:join, 0.25], [:kill], [:join, 0.25]], calls
    assert quarantined
  end
end
