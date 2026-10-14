# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/attachments"
require_relative "../../lib/elevateo/attachments_scan"
require_relative "../../lib/elevateo/attachments_storage"

class AttachmentServiceTest < Minitest::Test
  ORG = "11111111-1111-4111-8111-111111111111"
  BOX = "22222222-2222-4222-8222-222222222222"
  THREAD = "33333333-3333-4333-8333-333333333333"
  MESSAGE = "44444444-4444-4444-8444-444444444444"

  class Storage
    attr_reader :objects
    def initialize = @objects = {}
    def put(key, bytes, content_type:) = @objects[key] = [bytes, content_type]
    def get(key) = @objects.fetch(key).first
    def delete(key) = @objects.delete(key)
  end

  class Repository
    attr_reader :rows
    def initialize = @rows = {}
    def create(**attributes) = @rows[attributes.fetch(:id)] = attributes.transform_keys(&:to_s)
    def page(cursor:, limit:, **scope)
      @rows.values.select do |row|
        %i[organization_id mailbox_id thread_id message_id].all? { |key| row.fetch(key.to_s) == scope.fetch(key) } &&
          (cursor.nil? || row.fetch("id") > cursor)
      end.sort_by { |row| row.fetch("id") }.first(limit)
    end
    def pending_scan(id:)
      row = @rows[id]
      row if row && row.fetch("scan_status") == "pending_scan"
    end
    def record_scan(id:, sha256:, verdict:)
      row = pending_scan(id: id)
      raise Elevateo::Attachments::NotAvailable unless row && row.fetch("sha256") == sha256
      row["scan_status"] = verdict
    end
    def find(**scope)
      row = @rows[scope.fetch(:id)]
      return nil unless row
      row if %i[organization_id mailbox_id thread_id message_id].all? { |key| row.fetch(key.to_s) == scope.fetch(key) }
    end
  end

  def setup
    @storage = Storage.new
    @repository = Repository.new
    @allowed = true
    @checks = []
    @service = Elevateo::Attachments::Service.new(repository: @repository, storage: @storage,
      authorize: ->(**scope) { @checks << scope; raise Elevateo::Attachments::NotAvailable unless @allowed })
  end

  def scope = { organization_id: ORG, mailbox_id: BOX, thread_id: THREAD, message_id: MESSAGE }
  def stage(bytes: "safe text")
    @service.stage(**scope, filename: "note.txt", content_type: "text/plain", bytes: bytes)
  end

  def test_stage_is_held_until_independent_clean_verdict_and_authorization_is_rechecked
    id = stage.fetch("id")
    assert_equal "pending_scan", @repository.rows.fetch(id).fetch("scan_status")
    assert_raises(Elevateo::Attachments::Held) { @service.download(**scope, id: id) }
    @repository.rows.fetch(id)["scan_status"] = "clean" # Simulated scanner verdict; service has no scan transition.
    assert_equal "safe text", @service.download(**scope, id: id).first
    @allowed = false
    assert_raises(Elevateo::Attachments::NotAvailable) { @service.download(**scope, id: id) }
    assert_equal [:write, :write, :read, :read, :read], @checks.map { |item| item.fetch(:capability) }
  end

  def test_list_exposes_only_safe_fields_and_fresh_authorization
    id = stage.fetch("id")
    item = @service.list(**scope).fetch("items").fetch(0)
    assert_equal id, item.fetch("id")
    assert_equal false, item.fetch("downloadable")
    refute item.key?("storage_key")
    refute item.key?("sha256")
    assert_nil @service.list(**scope).fetch("next_cursor")
    @allowed = false
    assert_raises(Elevateo::Attachments::NotAvailable) { @service.list(**scope) }
  end

  def test_list_paginates_and_rejects_invalid_cursor_and_limit
    first = stage.fetch("id")
    second = stage(bytes: "second").fetch("id")
    page = @service.list(**scope, limit: 1)
    assert_equal 1, page.fetch("items").length
    assert_equal [first, second].min, page.fetch("items").first.fetch("id")
    assert_equal [first, second].min, page.fetch("next_cursor")
    last = @service.list(**scope, limit: 1, cursor: page.fetch("next_cursor"))
    assert_equal [first, second].max, last.fetch("items").first.fetch("id")
    assert_nil last.fetch("next_cursor")
    [0, 51, "1"].each do |bad|
      assert_raises(Elevateo::Attachments::Invalid) { @service.list(**scope, limit: bad) }
    end
    assert_raises(Elevateo::Attachments::Invalid) { @service.list(**scope, cursor: "bad") }
  end

  def test_default_scanner_holds_and_simulated_scanner_records_verified_clean
    id = stage.fetch("id")
    unavailable = Elevateo::Attachments::ScanService.new(repository: @repository, storage: @storage)
    assert_raises(Elevateo::Attachments::ScanService::Unavailable) { unavailable.inspect(id: id) }
    assert_equal "pending_scan", @repository.rows.fetch(id).fetch("scan_status")
    scanner = Object.new
    def scanner.scan(_bytes) = "clean" # Fixture-only verdict; no installed scanner is implied.
    service = Elevateo::Attachments::ScanService.new(repository: @repository, storage: @storage, scanner: scanner)
    assert_equal "clean", service.inspect(id: id)
    assert_equal "clean", @service.list(**scope).fetch("items").fetch(0).fetch("scan_status")
  end

  def test_scanner_rejects_modified_bytes_and_invalid_verdict
    id = stage.fetch("id")
    key = @repository.rows.fetch(id).fetch("storage_key")
    @storage.objects[key][0] = "tampered"
    scanner = Object.new
    def scanner.scan(_bytes) = "clean"
    service = Elevateo::Attachments::ScanService.new(repository: @repository, storage: @storage, scanner: scanner)
    assert_raises(Elevateo::Attachments::ScanService::Unavailable) { service.inspect(id: id) }
    assert_equal "pending_scan", @repository.rows.fetch(id).fetch("scan_status")
    @storage.objects[key][0] = "safe text"
    def scanner.scan(_bytes) = "unknown"
    assert_raises(Elevateo::Attachments::ScanService::Unavailable) { service.inspect(id: id) }
    assert_equal "pending_scan", @repository.rows.fetch(id).fetch("scan_status")
  end

  def test_malware_and_scan_failure_never_download
    id = stage.fetch("id")
    %w[malware scan_failed pending_scan].each do |status|
      @repository.rows.fetch(id)["scan_status"] = status
      assert_raises(Elevateo::Attachments::Held) { @service.download(**scope, id: id) }
    end
  end

  def test_oversize_bad_type_filename_and_signature_do_not_write
    invalid = [ { bytes: "x" * (Elevateo::Attachments::MAX_BYTES + 1) },
      { filename: "../secret.txt" }, { content_type: "application/x-msdownload" },
      { filename: "doc.pdf", content_type: "application/pdf" } ]
    invalid.each do |change|
      assert_raises(Elevateo::Attachments::Invalid) do
        @service.stage(**scope, filename: "note.txt", content_type: "text/plain", bytes: "safe", **change)
      end
    end
    assert_empty @storage.objects
    assert_empty @repository.rows
  end


  def test_private_storage_rejects_api_process_and_changed_inbound_retry
    constructor = { base_url: "http://storage:5000", bucket: "inbox-private", service_token: "x" * 32 }
    assert_raises(ArgumentError) { Elevateo::Attachments::PrivateStorage.new(**constructor, process: "api") }
    klass = Class.new(Elevateo::Attachments::PrivateStorage) do
      attr_accessor :existing
      private
      def private_bucket? = true
      def request(_method, _key, bytes: nil, expected:)
        raise "unexpected status" unless expected.include?(409)
        bytes
      end
      public
      def get(_key) = existing
    end
    adapter = klass.new(**constructor, process: "worker")
    key = "quarantine/imap/#{ORG}/1/2/0"
    adapter.existing = "same"
    assert_nil adapter.put_once(key, "same")
    adapter.existing = "different"
    assert_raises(Elevateo::Attachments::PrivateStorage::Unavailable) { adapter.put_once(key, "same") }
    assert_raises(ArgumentError) { adapter.delete(key) }
  end

  def test_cross_tenant_and_cross_mailbox_ids_are_not_downloadable
    id = stage.fetch("id")
    @repository.rows.fetch(id)["scan_status"] = "clean"
    assert_raises(Elevateo::Attachments::NotAvailable) { @service.download(**scope.merge(organization_id: BOX), id: id) }
    assert_raises(Elevateo::Attachments::NotAvailable) { @service.download(**scope.merge(mailbox_id: ORG), id: id) }
  end
end
