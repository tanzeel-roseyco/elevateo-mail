# frozen_string_literal: true

require "minitest/autorun"
require "active_record"
require_relative "../../lib/elevateo/inbound/imap_poller"
require_relative "../support/mail_binding"

# AIDEV-NOTE: Exercise real poller, sync and SQL adapters together; only database/network boundaries are replaced.
class ImapPollerTest < Minitest::Test
  include MailBindingFixture
  TOKEN = "22222222-2222-4222-8222-222222222222"
  MIME = "From: sender@example.invalid\r\nTo: inbox@example.invalid\r\nContent-Type: text/plain\r\n\r\nhello"

  class Connection
    include MailBindingFixture
    attr_accessor :idle, :finish_error
    attr_reader :queries
    def initialize = (@queries = [])
    def exec_query(sql, _, binds)
      values = binds.map(&:value_for_database)
      @queries << [sql, values]
      result = case sql
      when /lease_due_imap_account/
        @idle ? nil : JSON.generate(account_id: mail_binding.account_id, credential_version: 1, lease_token: TOKEN)
      when /leased_claim_imap_account/
        JSON.generate(account_id: mail_binding.account_id, organization_id: mail_binding.organization_id,
          mailbox_id: mail_binding.mailbox_id, credential_version: 1, credential_ref: "test:synthetic",
          uidvalidity: 42, last_uid: 0)
      when /leased_ingest_imap_mail/ then '{"result":"created"}'
      when /finish_imap_poll/
        raise @finish_error if @finish_error
        true
      else raise "unexpected or unfenced SQL: #{sql}"
      end
      [{ "result" => result }]
    end
  end

  class Session
    attr_accessor :error
    attr_reader :closed
    def initialize(count) = (@count = count)
    def verified_tls? = true
    def uidvalidity = 42
    def fetch_after(cursor, limit:)
      raise @error if @error
      raise "wrong cursor or page bound" unless cursor.zero? && limit == 50
      (1..@count).map { |uid| { uid: uid, raw_mime: MIME } }
    end
    def close = (@closed = true)
  end

  class Transport
    attr_reader :bindings
    def initialize(session) = (@session, @bindings = session, [])
    def open(binding:)
      @bindings << binding
      @session
    end
  end

  def setup
    @connection = Connection.new
  end

  def run_poll(session)
    @transport = Transport.new(session)
    Elevateo::Inbound::ImapPoller.new(connection: @connection, transport: @transport).run_once
  end

  def test_idle_does_not_open_transport_or_finish
    @connection.idle = true
    assert_equal :idle, run_poll(Session.new(0))
    assert_empty @transport.bindings
    assert_equal 1, @connection.queries.length
  end

  def test_empty_partial_and_full_pages_choose_schedule_and_fence_every_call
    [0, 1, 50].each do |count|
      @connection = Connection.new
      session = Session.new(count)
      assert_equal :polled, run_poll(session)
      assert session.closed
      assert_equal [mail_binding.key(protocol: "imap")], (@transport.bindings.map { |b| b.key(protocol: "imap") })
      @connection.queries[1...-1].each do |sql, values|
        assert_includes sql, "app.leased_"
        assert_equal TOKEN, values.last
      end
      assert_equal [mail_binding.account_id, "1", TOKEN, count == 50 ? "full" : "success"], @connection.queries.last.last
      assert_equal count + 3, @connection.queries.length
    end
  end

  def test_failure_closes_session_persists_backoff_and_preserves_error
    session = Session.new(1)
    original = IOError.new("synthetic fetch failure")
    session.error = original
    assert_same original, assert_raises(IOError) { run_poll(session) }
    assert session.closed
    assert_equal "failure", @connection.queries.last.last.last
    assert_equal 3, @connection.queries.length
  end

  def test_lost_ownership_during_failure_preserves_both_errors
    session = Session.new(1)
    original = IOError.new("synthetic fetch failure")
    session.error = original
    lost = Elevateo::Inbound::Rejected.new("poll_unavailable")
    @connection.finish_error = lost
    assert_same lost, assert_raises(Elevateo::Inbound::Rejected) { run_poll(session) }
    assert_same original, lost.cause
    assert session.closed
  end

  def test_failure_to_finish_success_is_not_reported_as_polled
    session = Session.new(0)
    @connection.finish_error = Elevateo::Inbound::Rejected.new("poll_unavailable")
    assert_raises(Elevateo::Inbound::Rejected) { run_poll(session) }
    assert session.closed
    assert_equal 3, @connection.queries.length
    assert_equal "success", @connection.queries.last.last.last
  end
end
