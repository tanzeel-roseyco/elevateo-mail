# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/inbound/fake_ingress"

class FakeIngressTest < Minitest::Test
  ORG = "11111111-1111-4111-8111-111111111111"
  MAILBOX = "22222222-2222-4222-8222-222222222222"
  OTHER = "33333333-3333-4333-8333-333333333333"
  MIME = "From: sender@example.invalid\r\nTo: inbox@example.invalid\r\nSubject: hello\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nhello there".freeze

  class Store
    attr_reader :records

    def initialize
      @records = {}
    end

    def insert_once(record)
      key = record.values_at(:organization_id, :mailbox_id, :provider, :provider_event_id)
      return :duplicate if @records.key?(key)

      @records[key] = record
      :created
    end
  end

  def setup
    @store = Store.new
    @ingress = Elevateo::Inbound::FakeIngress.new(store: @store)
  end

  def test_plaintext_ingress_and_scoped_dedup
    assert_equal :created, ingest
    assert_equal :duplicate, ingest
    assert_equal "hello there", @store.records.values.first.fetch(:text)
    assert_equal ORG, @store.records.values.first.fetch(:organization_id)
    assert_equal :created, ingest(mailbox_id: OTHER, authorized_mailbox_ids: [OTHER])
    assert_equal 2, @store.records.length
  end

  def test_unauthorized_and_invalid_event_are_rejected_before_store
    assert_code "forbidden" do
      ingest(mailbox_id: OTHER)
    end
    assert_code "invalid_event_id" do
      ingest(provider_event_id: "bad\nkey")
    end
    assert_empty @store.records
  end

  def test_oversized_and_html_ingress_are_rejected
    assert_code "invalid_mime" do
      ingest(raw_mime: MIME + ("x" * Elevateo::Inbound::FakeIngress::MAX_RAW))
    end
    assert_code "unsupported_mime" do
      ingest(raw_mime: MIME.sub("text/plain", "text/html"))
    end
    assert_empty @store.records
  end

  def test_unsupported_provider_is_explicit
    assert_equal "isolated_only", @ingress.capability("fake")
    assert_equal "unsupported_provider", @ingress.capability("resend")
  end

  private

  def ingest(**changes)
    @ingress.ingest(**{ organization_id: ORG, mailbox_id: MAILBOX,
                       authorized_mailbox_ids: [MAILBOX], provider_event_id: "event-1", raw_mime: MIME }.merge(changes))
  end

  def assert_code(code)
    assert_equal code, assert_raises(Elevateo::Inbound::Rejected) { yield }.code
  end
end
