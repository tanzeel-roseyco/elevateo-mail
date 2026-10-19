# frozen_string_literal: true

require "minitest/autorun"
require "stringio"
require_relative "../../attachment_gateway/app"

class DraftAttachmentStageTest < Minitest::Test
  ID = "11111111-1111-4111-8111-111111111111"
  KEY = "k" * 32
  BYTES = "draft file".b
  class Authority
    attr_accessor :revoked
    attr_reader :checks
    def initialize
      @checks = 0
    end
    def draft_binding(_fields)
      @checks += 1
      raise Elevateo::AttachmentGateway::Denied if @revoked
      { "storage_key" => "drafts/#{ID}/#{ID}", "byte_size" => BYTES.bytesize.to_s,
        "sha256" => Digest::SHA256.hexdigest(BYTES), "stage_state" => "reserved" }
    end
  end
  class Storage
    attr_reader :puts, :reads
    attr_accessor :after_write
    def initialize
      @puts = @reads = 0
    end
    def put_draft(key, bytes)
      raise "wrong binding" unless key == "drafts/#{ID}/#{ID}" && bytes == BYTES
      @puts += 1
      @after_write&.call
    end
    def get(_key)
      @reads += 1
      BYTES
    end
  end
  def setup
    @authority, @storage = Authority.new, Storage.new
    @app = Elevateo::AttachmentGateway::App.new(key: KEY, authority: @authority, storage: @storage, clock: -> { 1000 })
  end
  def request(mode: "put", bytes: BYTES)
    fields = Elevateo::DraftAttachmentRequest::IDS.to_h { |name| [name, ID] }.merge(
      "operation" => "draft_attachment.stage", "audience" => "attachment_gateway.v1",
      "session_digest" => "d" * 64, "authorization_generation" => 0, "mode" => mode,
      "expires_at" => 1020, "content_base64" => Base64.strict_encode64(bytes))
    claim = Elevateo::DraftAttachmentRequest.new(fields: fields, key: KEY, now: 1000)
    { "REQUEST_METHOD" => "POST", "PATH_INFO" => Elevateo::DraftAttachmentRequest::PATH,
      "CONTENT_TYPE" => "application/json", "CONTENT_LENGTH" => claim.body.bytesize.to_s,
      "rack.input" => StringIO.new(claim.body), "HTTP_X_ELEVATEO_ATTACHMENT_SIGNATURE" => claim.signature }
  end
  def test_upload_rechecks_binding_after_storage
    assert_equal 204, @app.call(request).first
    assert_equal [1, 0, 2], [@storage.puts, @storage.reads, @authority.checks]
  end
  def test_reconciliation_never_uploads_again
    assert_equal 204, @app.call(request(mode: "reconcile")).first
    assert_equal [0, 1, 2], [@storage.puts, @storage.reads, @authority.checks]
  end
  def test_revocation_during_upload_denies_finalization
    @storage.after_write = -> { @authority.revoked = true }
    assert_equal 404, @app.call(request).first
    assert_equal 2, @authority.checks
  end
  def test_checksum_mismatch_never_uploads
    assert_equal 404, @app.call(request(bytes: "wrong file")).first
    assert_equal 0, @storage.puts
  end
  def test_forged_signature_never_checks_binding
    env = request
    env["HTTP_X_ELEVATEO_ATTACHMENT_SIGNATURE"] = "0" * 64
    assert_equal 404, @app.call(env).first
    assert_equal 0, @authority.checks
  end
end
