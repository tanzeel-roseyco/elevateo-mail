# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/attachments"

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

  def test_cross_tenant_and_cross_mailbox_ids_are_not_downloadable
    id = stage.fetch("id")
    @repository.rows.fetch(id)["scan_status"] = "clean"
    assert_raises(Elevateo::Attachments::NotAvailable) { @service.download(**scope.merge(organization_id: BOX), id: id) }
    assert_raises(Elevateo::Attachments::NotAvailable) { @service.download(**scope.merge(mailbox_id: ORG), id: id) }
  end
end
