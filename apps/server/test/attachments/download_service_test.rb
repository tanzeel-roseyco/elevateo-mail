# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/attachments_download"

class AttachmentDownloadServiceTest < Minitest::Test
  class Gateway
    attr_reader :calls
    def initialize(bytes: "clean bytes", &during_fetch)
      @bytes, @during_fetch, @calls = bytes, during_fetch, []
    end
    def download(fields:, timeout:)
      @calls << [fields, timeout]
      @during_fetch&.call
      @bytes
    end
  end

  def snapshot(size: 11)
    { fields: { "attachment_id" => "attachment", "expires_at" => 1_020 },
      binding: { "id" => "attachment", "status" => "clean", "byte_size" => size }, byte_size: size }
  end

  def service(gateway, &read)
    Elevateo::Attachments::DownloadService.new(snapshot: read, gateway: gateway, clock: -> { 1_000 })
  end

  def test_clean_bytes_require_two_equal_authorized_snapshots
    reads = 0
    gateway = Gateway.new
    bytes = service(gateway) { reads += 1; snapshot }.fetch
    assert_equal "clean bytes", bytes
    assert_equal 2, reads
    assert_equal 1, gateway.calls.length
    assert_equal 5, gateway.calls.first.last
  end

  def test_held_or_wrong_mailbox_denies_before_private_fetch
    gateway = Gateway.new
    assert_raises(Elevateo::Attachments::Held) do
      service(gateway) { raise Elevateo::Attachments::Held }.fetch
    end
    assert_raises(Elevateo::Attachments::NotAvailable) do
      service(gateway) { raise Elevateo::Attachments::NotAvailable }.fetch
    end
    assert_empty gateway.calls
  end

  def test_revocation_or_tuple_change_after_fetch_discards_bytes
    revoked = false
    gateway = Gateway.new { revoked = true }
    assert_raises(Elevateo::Attachments::NotAvailable) do
      service(gateway) { raise Elevateo::Attachments::NotAvailable if revoked; snapshot }.fetch
    end
    reads = 0
    assert_raises(Elevateo::Attachments::NotAvailable) do
      service(Gateway.new) { reads += 1; snapshot(size: reads == 1 ? 11 : 12) }.fetch
    end
  end

  def test_oversize_mismatch_and_expiry_release_nothing
    assert_raises(Elevateo::Attachments::DownloadService::Unavailable) do
      service(Gateway.new(bytes: "too short")) { snapshot }.fetch
    end
    assert_raises(Elevateo::Attachments::DownloadService::Unavailable) do
      service(Gateway.new(bytes: "x" * (Elevateo::Attachments::MAX_BYTES + 1))) { snapshot }.fetch
    end
    assert_raises(Elevateo::Attachments::NotAvailable) do
      service(Gateway.new) { snapshot.merge(fields: snapshot.fetch(:fields).merge("expires_at" => 999)) }.fetch
    end
  end

  def test_private_gateway_timeout_is_not_reclassified_as_success
    gateway = Gateway.new { raise Elevateo::Attachments::DownloadService::Unavailable }
    assert_raises(Elevateo::Attachments::DownloadService::Unavailable) { service(gateway) { snapshot }.fetch }
  end
end
