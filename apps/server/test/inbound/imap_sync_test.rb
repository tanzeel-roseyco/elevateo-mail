# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/inbound/imap_sync"

class ImapSyncTest < Minitest::Test
  ACCOUNT = "11111111-1111-4111-8111-111111111111"
  MIME = "From: sender@example.invalid\r\nTo: inbox@example.invalid\r\nContent-Type: text/plain\r\n\r\nhello".freeze

  class Store
    attr_accessor :validity, :last_uid, :fail_once, :fail_after_once
    attr_reader :records
    def initialize
      @validity, @last_uid, @records = 42, 0, {}
    end
    def claim(**)
      { "credential_ref" => "test:synthetic", "uidvalidity" => @validity, "last_uid" => @last_uid }
    end
    def reset_uidvalidity(expected:, replacement:, **)
      return false unless @validity == expected
      @validity, @last_uid = replacement, 0
      true
    end
    def insert_once(account_id:, uidvalidity:, uid:, content_sha256:, **)
      if @fail_once
        @fail_once = false
        raise "simulated crash before commit"
      end
      key = [account_id, uidvalidity, uid]
      if @records.key?(key)
        raise Elevateo::Inbound::Rejected, "replay_mismatch" unless @records[key] == content_sha256
        return { "result" => "duplicate" }
      end
      @records[key] = content_sha256
      @last_uid = uid
      @validity = uidvalidity
      if @fail_after_once
        @fail_after_once = false
        raise "simulated crash after commit"
      end
      { "result" => "created" }
    end
  end

  class Session
    attr_reader :closed
    def initialize(validity:, events:, verified: true)
      @validity, @events, @verified = validity, events, verified
    end
    def verified_tls? = @verified
    def uidvalidity = @validity
    def fetch_after(cursor, limit:)
      raise "unbounded" unless limit == 50
      @events.select { |event| event.fetch(:uid) > cursor }
    end
    def close = (@closed = true)
  end

  class Transport
    def initialize(session) = (@session = session)
    def open(credential_ref:)
      raise "secret leaked" unless credential_ref == "test:synthetic"
      @session
    end
  end

  def setup = (@store = Store.new)
  def sync_session(session)
    Elevateo::Inbound::ImapSync.new(store: @store, transport: Transport.new(session)).run(
      account_id: ACCOUNT, credential_version: 1)
  end

  def test_crash_before_commit_retries_without_losing_message
    event = { uid: 1, raw_mime: MIME }
    @store.fail_once = true
    assert_raises(RuntimeError) { sync_session(Session.new(validity: 42, events: [event])) }
    assert_empty @store.records
    assert_equal 1, sync_session(Session.new(validity: 42, events: [event]))
    assert_equal 1, @store.records.length
    assert_equal 1, sync_session(Session.new(validity: 42, events: [event]))
    assert_equal 1, @store.records.length
  end

  def test_uidvalidity_reset_and_unverified_tls
    assert_equal 1, sync_session(Session.new(validity: 43, events: [{ uid: 1, raw_mime: MIME }]))
    assert_equal 43, @store.validity
    denied = Session.new(validity: 43, events: [], verified: false)
    assert_equal "tls_unverified", assert_raises(Elevateo::Inbound::Rejected) { sync_session(denied) }.code
    assert denied.closed
  end

  def test_crash_after_commit_reconnects_without_duplicate_message
    event = { uid: 1, raw_mime: MIME }
    @store.fail_after_once = true
    assert_raises(RuntimeError) { sync_session(Session.new(validity: 42, events: [event])) }
    assert_equal 1, @store.records.length
    assert_equal 1, sync_session(Session.new(validity: 42, events: [event]))
    assert_equal 1, @store.records.length
  end

  def test_out_of_order_or_oversized_event_cannot_advance_cursor
    assert_equal "invalid_imap_batch", assert_raises(Elevateo::Inbound::Rejected) {
      sync_session(Session.new(validity: 42, events: [{ uid: 2, raw_mime: MIME }, { uid: 1, raw_mime: MIME }]))
    }.code
    assert_equal 2, @store.last_uid
    assert_equal "invalid_imap_batch", assert_raises(Elevateo::Inbound::Rejected) {
      sync_session(Session.new(validity: 42, events: [{ uid: 3, raw_mime: "x" * (1_048_577) }]))
    }.code
    assert_equal 2, @store.last_uid
  end
end
