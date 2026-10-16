# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/inbound/imap_sync"
require_relative "../support/mail_binding"

class ImapRejectionSyncTest < Minitest::Test
  ACCOUNT = "11111111-1111-4111-8111-111111111111"
  MIME = "From: sender@example.invalid\r\nTo: inbox@example.invalid\r\nContent-Type: text/plain\r\n\r\nhello".freeze
  # AIDEV-NOTE: Minimal independent doubles avoid importing another executable test suite.
  class Session
    attr_reader :closed
    def initialize(validity:, events:)
      @validity, @events = validity, events
    end
    def verified_tls? = true
    def uidvalidity = @validity
    def fetch_after(cursor, limit:) = @events.select { |event| event.fetch(:uid) > cursor }.first(limit)
    def close = (@closed = true)
  end
  Transport = Struct.new(:session) do
    def open(binding:)
      raise "wrong binding" unless binding.account_id == ACCOUNT
      session
    end
  end
  def sync_session(session)
    Elevateo::Inbound::ImapSync.new(store: @store, transport: Transport.new(session)).run(
      account_id: ACCOUNT, credential_version: 1)
  end
  class RejectionStore
    include MailBindingFixture
    attr_reader :last_uid, :records
    attr_accessor :reject_failure, :storage_failure
    attr_reader :rejections
    def initialize
      @last_uid, @records, @rejections = 0, {}, []
    end
    def claim(**)
      { "binding" => mail_binding, "uidvalidity" => 42, "last_uid" => @last_uid }
    end
    def reject_once(uid:, **record)
      raise Elevateo::Inbound::Rejected, "store_unavailable" if @reject_failure
      @rejections << record.merge(uid: uid)
      @last_uid = uid
      { "result" => "rejected" }
    end
    def insert_once(**record)
      raise Elevateo::Inbound::Rejected, "attachment_storage_unavailable" if @storage_failure
      @records[[record.fetch(:account_id), record.fetch(:uidvalidity), record.fetch(:uid)]] = record.fetch(:content_sha256)
      @last_uid = record.fetch(:uid)
      { "result" => "created" }
    end
  end

  def setup = (@store = RejectionStore.new)

  def events
    [{ uid: 1, raw_mime: MIME.sub("text/plain", "application/octet-stream") }, { uid: 2, raw_mime: MIME }]
  end

  def test_poison_receipt_commits_before_following_valid_mail_and_restart_is_idempotent
    session = Session.new(validity: 42, events: events)
    assert_equal 2, sync_session(session)
    assert session.closed
    assert_equal [2], @store.records.keys.map(&:last)
    assert_equal 1, @store.rejections.length
    receipt = @store.rejections.first
    assert_equal "unsupported_mime", receipt.fetch(:reason)
    assert_equal Digest::SHA256.hexdigest(events.first.fetch(:raw_mime).b), receipt.fetch(:content_sha256)
    assert_equal ACCOUNT, receipt.fetch(:account_id)
    assert_equal 42, receipt.fetch(:uidvalidity)
    refute receipt.key?(:raw_mime)
    assert_equal 2, sync_session(Session.new(validity: 42, events: events))
    assert_equal 1, @store.rejections.length
  end

  def test_rejection_store_failure_keeps_cursor_and_stops_before_valid_tail
    @store.reject_failure = true
    session = Session.new(validity: 42, events: events)
    assert_raises(Elevateo::Inbound::Rejected) { sync_session(session) }
    assert session.closed
    assert_equal 0, @store.last_uid
    assert_empty @store.records
    assert_empty @store.rejections
    @store.reject_failure = false
    assert_equal 2, sync_session(Session.new(validity: 42, events: events))
  end

  def test_non_parser_failure_never_becomes_rejection_evidence
    @store.storage_failure = true
    session = Session.new(validity: 42, events: [{ uid: 1, raw_mime: MIME }])
    assert_equal "attachment_storage_unavailable", assert_raises(Elevateo::Inbound::Rejected) { sync_session(session) }.code
    assert_equal 0, @store.last_uid
    assert_empty @store.rejections
    assert session.closed
  end
end
