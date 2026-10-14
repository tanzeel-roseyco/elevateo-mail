# frozen_string_literal: true

require "minitest/autorun"
require "minitest/mock"
require_relative "../../lib/elevateo/attachments"
require_relative "../../lib/elevateo/attachments_scan"
require_relative "../../lib/elevateo/attachments_repository"
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
    def due_scan_ids(limit:)
      @rows.values.select { |row| %w[pending_scan scan_failed].include?(row.fetch("scan_status")) &&
        row.fetch("scan_attempt", 0) < 3 }.first(limit).map { |row| row.fetch("id") }
    end
    def claim_scan(id:, token:)
      row = @rows[id]
      return nil unless row && %w[pending_scan scan_failed].include?(row.fetch("scan_status")) &&
        row.fetch("scan_attempt", 0) < 3 && row["scan_token"].nil?
      row["scan_status"] = "pending_scan"
      row["scan_attempt"] = row.fetch("scan_attempt", 0) + 1
      row["scan_token"] = token
      row
    end
    def record_scan(id:, sha256:, token:, attempt:, verdict:)
      row = @rows[id]
      raise Elevateo::Attachments::NotAvailable unless row && row.fetch("sha256") == sha256 &&
        row.fetch("scan_token") == token && row.fetch("scan_attempt") == attempt &&
        row.fetch("scan_status") == "pending_scan"
      row["scan_status"] = verdict
      row["scan_token"] = nil
    end
    def find(**scope)
      row = @rows[scope.fetch(:id)]
      return nil unless row
      row if %i[organization_id mailbox_id thread_id message_id].all? { |key| row.fetch(key.to_s) == scope.fetch(key) }
    end
  end

  class IncompleteClaimRepository < Repository
    attr_accessor :missing_id, :missing_key

    def claim_scan(id:, token:)
      row = super
      return row unless row && id == missing_id
      row.reject { |key, _value| key == missing_key }
    end
  end

  class StorageHttpExchange
    attr_accessor :max_retries, :open_timeout, :read_timeout, :write_timeout
    attr_reader :paths

    def initialize(bucket_response:, object_response: nil)
      @bucket_response, @object_response, @paths = bucket_response, object_response, []
    end

    def start = yield self

    def request(request)
      @paths << request.path
      return yield @object_response if block_given?
      @bucket_response
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
    assert_raises(Elevateo::Attachments::Held) { @service.assert_downloadable(**scope, id: id) }
    @repository.rows.fetch(id)["scan_status"] = "clean" # Simulated scanner verdict; service has no scan transition.
    assert_equal id, @service.assert_downloadable(**scope, id: id).fetch("id")
    @allowed = false
    assert_raises(Elevateo::Attachments::NotAvailable) { @service.assert_downloadable(**scope, id: id) }
    assert_equal [:write, :write, :read, :read, :read], @checks.map { |item| item.fetch(:capability) }
  end

  def test_list_exposes_only_safe_fields_and_fresh_authorization
    id = stage.fetch("id")
    item = @service.list(**scope).fetch("items").fetch(0)
    assert_equal id, item.fetch("id")
    assert_equal "pending_scan", item.fetch("scan_status")
    refute item.key?("storage_key")
    refute item.key?("sha256")
    assert_nil @service.list(**scope).fetch("next_cursor")
    @allowed = false
    assert_raises(Elevateo::Attachments::NotAvailable) { @service.list(**scope) }
  end

  def test_invalid_stored_size_is_rejected_after_authorization
    id = stage.fetch("id")
    @repository.rows.fetch(id)["byte_size"] = "7"
    assert_raises(Elevateo::Attachments::Invalid) { @service.list(**scope) }
    @repository.rows.fetch(id)["scan_status"] = "clean"
    assert_raises(Elevateo::Attachments::Invalid) { @service.assert_downloadable(**scope, id: id) }
    @allowed = false
    assert_raises(Elevateo::Attachments::NotAvailable) { @service.assert_downloadable(**scope, id: id) }
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

  def test_default_scanner_marks_failure_held_then_simulated_clean_retry
    id = stage.fetch("id")
    unavailable = Elevateo::Attachments::ScanService.new(repository: @repository, storage: @storage)
    assert_raises(Elevateo::Attachments::ScanService::Unavailable) { unavailable.inspect(id: id) }
    assert_equal "scan_failed", @repository.rows.fetch(id).fetch("scan_status")
    scanner = Object.new
    def scanner.scan(_bytes) = "clean" # Fixture-only verdict; no installed scanner is implied.
    service = Elevateo::Attachments::ScanService.new(repository: @repository, storage: @storage, scanner: scanner)
    assert_equal "clean", service.inspect(id: id)
    assert_equal "clean", @service.list(**scope).fetch("items").fetch(0).fetch("scan_status")
  end

  def test_worker_batch_is_bounded_and_reports_held_without_clean
    stage
    stage(bytes: "second")
    service = Elevateo::Attachments::ScanService.new(repository: @repository, storage: @storage)
    assert_equal({ "clean" => 0, "malware" => 0, "held" => 1 }, service.run_batch(limit: 1))
    assert_raises(ArgumentError) { service.run_batch(limit: 26) }
    assert(@repository.rows.values.any? { |row| row.fetch("scan_status") == "scan_failed" })
  end

  def test_scanner_rejects_modified_bytes_and_invalid_verdict
    id = stage.fetch("id")
    key = @repository.rows.fetch(id).fetch("storage_key")
    @storage.objects[key][0] = "tampered"
    scanner = Object.new
    def scanner.scan(_bytes) = "clean"
    service = Elevateo::Attachments::ScanService.new(repository: @repository, storage: @storage, scanner: scanner)
    assert_raises(Elevateo::Attachments::ScanService::Unavailable) { service.inspect(id: id) }
    assert_equal "scan_failed", @repository.rows.fetch(id).fetch("scan_status")
    @storage.objects[key][0] = "safe text"
    def scanner.scan(_bytes) = "unknown"
    assert_raises(Elevateo::Attachments::ScanService::Unavailable) { service.inspect(id: id) }
    assert_equal "scan_failed", @repository.rows.fetch(id).fetch("scan_status")
  end

  def test_worker_rejects_malformed_claim_before_read_or_verdict
    id = stage.fetch("id")
    repository = @repository
    def repository.claim_scan(id:, token:)
      row = super
      row.merge("sha256" => nil) if row
    end
    scanner = Object.new
    def scanner.scan(_bytes) = raise "scanner must not receive malformed claim"
    service = Elevateo::Attachments::ScanService.new(repository: repository, storage: @storage, scanner: scanner)
    assert_raises(Elevateo::Attachments::ScanService::Unavailable) { service.inspect(id: id) }
    assert_equal "pending_scan", @repository.rows.fetch(id).fetch("scan_status")
  end

  def test_missing_each_claim_field_is_held_and_batch_continues
    %w[scan_attempt sha256 storage_key byte_size].each do |key|
      storage = Storage.new
      repository = IncompleteClaimRepository.new
      authorizer = ->(**_scope) { nil }
      staging = Elevateo::Attachments::Service.new(repository: repository, storage: storage, authorize: authorizer)
      malformed_id = staging.stage(**scope, filename: "first.txt", content_type: "text/plain", bytes: "first").fetch("id")
      valid_id = staging.stage(**scope, filename: "second.txt", content_type: "text/plain", bytes: "second").fetch("id")
      repository.missing_id, repository.missing_key = malformed_id, key
      scanner = Object.new
      def scanner.scan(_bytes) = "clean" # Fixture-only verdict.
      worker = Elevateo::Attachments::ScanService.new(repository: repository, storage: storage, scanner: scanner)
      assert_equal({ "clean" => 1, "malware" => 0, "held" => 1 }, worker.run_batch(limit: 2), key)
      assert_equal "pending_scan", repository.rows.fetch(malformed_id).fetch("scan_status"), key
      assert_equal "clean", repository.rows.fetch(valid_id).fetch("scan_status"), key
    end
  end

  def test_due_scan_row_without_id_has_deliberate_error
    repository = Class.new(Elevateo::Attachments::Repository) do
      private
      def rows(_sql, _values) = [{}]
    end.new(connection: nil)
    assert_raises(Elevateo::Attachments::NotAvailable) { repository.due_scan_ids(limit: 1) }
  end

  def test_late_clean_attempt_cannot_overwrite_newer_malware
    id = stage.fetch("id")
    first = @repository.claim_scan(id: id, token: ORG)
    @repository.rows.fetch(id)["scan_token"] = nil # Simulate expired lease claimed by another worker.
    second = @repository.claim_scan(id: id, token: BOX)
    @repository.record_scan(id: id, sha256: second.fetch("sha256"), token: BOX,
      attempt: second.fetch("scan_attempt"), verdict: "malware")
    assert_raises(Elevateo::Attachments::NotAvailable) do
      @repository.record_scan(id: id, sha256: first.fetch("sha256"), token: ORG,
        attempt: 1, verdict: "clean")
    end
    assert_equal "malware", @repository.rows.fetch(id).fetch("scan_status")
  end

  def test_ambiguous_metadata_commit_keeps_staged_bytes_private
    def @repository.create(**_attributes) = raise IOError, "ambiguous commit"
    assert_raises(IOError) { stage }
    assert_equal 1, @storage.objects.length
    assert(@storage.objects.keys.first.start_with?("quarantine/#{ORG}/"))
  end

  def test_malware_and_scan_failure_never_download
    id = stage.fetch("id")
    %w[malware scan_failed pending_scan].each do |status|
      @repository.rows.fetch(id)["scan_status"] = status
      assert_raises(Elevateo::Attachments::Held) { @service.assert_downloadable(**scope, id: id) }
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

  def test_private_storage_keeps_fixed_internal_transport_boundary
    constructor = { bucket: "inbox-private", service_token: "x" * 32, process: "worker" }
    ["http://other:5000", "http://storage:5000/object", "http://user@storage:5000",
      "https://storage:5000"].each do |url|
      assert_raises(ArgumentError) do
        Elevateo::Attachments::PrivateStorage.new(**constructor, base_url: url)
      end
    end
    adapter = Elevateo::Attachments::PrivateStorage.new(**constructor, base_url: "http://storage:5000")
    assert_instance_of Elevateo::Attachments::PrivateStorage, adapter
  end

  def test_private_storage_denies_missing_bucket_body_before_object_request
    response = Net::HTTPOK.new("1.1", "200", "OK")
    response.define_singleton_method(:body) { nil }
    exchange = StorageHttpExchange.new(bucket_response: response)
    adapter = Elevateo::Attachments::PrivateStorage.new(base_url: "http://storage:5000",
      bucket: "inbox-private", service_token: "x" * 32, process: "worker")
    key = "quarantine/imap/#{ORG}/1/2/0"
    Net::HTTP.stub(:new, ->(*_args) { exchange }) do
      error = assert_raises(Elevateo::Attachments::PrivateStorage::Unavailable) { adapter.get(key) }
      assert_equal "private bucket unavailable", error.message
    end
    assert_equal ["/bucket/inbox-private"], exchange.paths
  end

  def test_private_storage_rejects_status_before_read_body
    bucket = Net::HTTPOK.new("1.1", "200", "OK")
    bucket.define_singleton_method(:body) { '{"public":false}' }
    object = Net::HTTPForbidden.new("1.1", "403", "Forbidden")
    reads = []
    object.define_singleton_method(:read_body) { |&_block| reads << :read_body }
    exchange = StorageHttpExchange.new(bucket_response: bucket, object_response: object)
    adapter = Elevateo::Attachments::PrivateStorage.new(base_url: "http://storage:5000",
      bucket: "inbox-private", service_token: "x" * 32, process: "worker")
    key = "quarantine/imap/#{ORG}/1/2/0"
    Net::HTTP.stub(:new, ->(*_args) { exchange }) do
      error = assert_raises(Elevateo::Attachments::PrivateStorage::Unavailable) { adapter.get(key) }
      assert_equal "private object unavailable", error.message
    end
    assert_empty reads
    assert_equal ["/bucket/inbox-private", "/object/inbox-private/#{key}"], exchange.paths
  end

  def test_cross_tenant_and_cross_mailbox_ids_are_not_downloadable
    id = stage.fetch("id")
    @repository.rows.fetch(id)["scan_status"] = "clean"
    assert_raises(Elevateo::Attachments::NotAvailable) { @service.assert_downloadable(**scope.merge(organization_id: BOX), id: id) }
    assert_raises(Elevateo::Attachments::NotAvailable) { @service.assert_downloadable(**scope.merge(mailbox_id: ORG), id: id) }
  end
end
