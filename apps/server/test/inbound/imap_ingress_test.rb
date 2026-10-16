# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/inbound/imap_ingress"
require_relative "imap_mime_fixtures"

class ImapIngressTest < Minitest::Test
  include ImapMimeFixtures
  ACCOUNT = "11111111-1111-4111-8111-111111111111"
  MIME = "From: sender@example.invalid\r\nTo: inbox@example.invalid\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nhello".freeze

  class Store
    attr_reader :calls
    def initialize(&before_insert)
      @calls = []
      @before_insert = before_insert
    end
    def insert_once(**values)
      @before_insert&.call
      @calls << values
      { "result" => "created" }
    end
  end

  class Storage
    attr_reader :staged
    def initialize(fail_at: nil)
      @staged = []
      @fail_at = fail_at
    end
    def put_once(key, bytes)
      raise IOError, "private storage failed" if @staged.length == @fail_at

      @staged << [key, bytes]
    end
  end

  def setup
    @store = Store.new
    @ingress = Elevateo::Inbound::ImapIngress.new(store: @store)
  end

  def test_valid_protocol_evidence_produces_bounded_plaintext_only
    assert_equal "created", ingest.fetch("result")
    assert_equal [ACCOUNT, 1, 42, 7], @store.calls.first.values_at(:account_id, :credential_version, :uidvalidity, :uid)
    assert_equal "hello", @store.calls.first.fetch(:text)
    assert_equal "sender@example.invalid", @store.calls.first.fetch(:from)
  end

  def test_invalid_uid_and_unsupported_body_never_reach_store
    assert_equal "invalid_imap_identity", assert_raises(Elevateo::Inbound::Rejected) { ingest(uid: 0) }.code
    assert_equal "unsupported_mime", assert_raises(Elevateo::Inbound::Rejected) {
      ingest(raw_mime: MIME.sub("text/plain", "message/rfc822"))
    }.code
    assert_empty @store.calls
  end

  def test_supported_attachment_is_rejected_until_quarantine_exists
    multipart = "From: sender@example.invalid\r\nTo: inbox@example.invalid\r\n" \
      "Content-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Type: text/plain\r\n\r\nhello\r\n" \
      "--x\r\nContent-Type: application/pdf\r\nContent-Disposition: attachment; filename=a.bin\r\n\r\na\r\n--x--\r\n"
    assert_equal "attachment_storage_unavailable", assert_raises(Elevateo::Inbound::Rejected) {
      ingest(raw_mime: multipart)
    }.code
    assert_empty @store.calls
  end

  def test_unsupported_attachment_type_never_stages_or_persists
    storage = Storage.new
    ingress = Elevateo::Inbound::ImapIngress.new(store: @store, attachment_storage: storage)
    raw = MIME.sub("Content-Type: text/plain; charset=UTF-8\r\n\r\nhello",
      "Content-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Type: text/plain\r\n\r\nhello\r\n" \
      "--x\r\nContent-Type: application/x-executable\r\nContent-Disposition: attachment; filename=a.bin\r\n\r\na\r\n--x--\r\n")
    error = assert_raises(Elevateo::Inbound::Rejected) {
      ingress.ingest(account_id: ACCOUNT, credential_version: 1, uidvalidity: 42, uid: 7, raw_mime: raw)
    }
    assert_equal "unsupported_mime", error.code
    assert_empty storage.staged
    assert_empty @store.calls
  end

  def test_supported_attachment_stages_before_atomic_store_call
    storage = Storage.new
    @store = Store.new { assert_equal 1, storage.staged.length }
    ingress = Elevateo::Inbound::ImapIngress.new(store: @store, attachment_storage: storage)
    raw = MIME.sub("Content-Type: text/plain; charset=UTF-8\r\n\r\nhello",
      "Content-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Type: text/plain\r\n\r\nhello\r\n" \
      "--x\r\nContent-Type: application/pdf\r\nContent-Disposition: attachment; filename=report.pdf\r\n\r\n%PDF-demo\r\n--x--\r\n")
    result = ingress.ingest(account_id: ACCOUNT, credential_version: 1, uidvalidity: 42, uid: 7, raw_mime: raw)
    assert_equal "created", result.fetch("result")
    assert_equal [["quarantine/imap/#{ACCOUNT}/42/7/0", "%PDF-demo"]], storage.staged
    assert_equal "report.pdf", @store.calls.first.fetch(:attachments).first.fetch(:filename)
  end

  def test_html_body_is_persisted_as_plaintext
    ingest(raw_mime: HEADER + leaf("text/html", "<p>Visible &amp; safe</p><script>hidden</script>"))
    assert_equal "Visible & safe", @store.calls.first.fetch(:text)
  end

  def test_failed_or_partial_staging_never_creates_an_inbox_record
    raw = HEADER + multi("mixed", [leaf("text/plain", "body"),
      leaf("application/pdf", "one", filename: "one.pdf"), leaf("image/png", "two", filename: "two.png")])
    [0, 1].each do |fail_at|
      storage = Storage.new(fail_at: fail_at)
      ingress = Elevateo::Inbound::ImapIngress.new(store: @store, attachment_storage: storage)
      assert_raises(IOError) {
        ingress.ingest(account_id: ACCOUNT, credential_version: 1, uidvalidity: 42, uid: 7, raw_mime: raw)
      }
      assert_equal fail_at, storage.staged.length
      assert_empty @store.calls
    end
    # AIDEV-NOTE: Successful retry uses the same keys; the storage adapter owns idempotency and orphan retention.
  end

  private

  def ingest(**changes)
    @ingress.ingest(**{ account_id: ACCOUNT, credential_version: 1, uidvalidity: 42, uid: 7,
                       raw_mime: MIME }.merge(changes))
  end
end
