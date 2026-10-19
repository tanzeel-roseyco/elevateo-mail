# frozen_string_literal: true
require "minitest/autorun"
require_relative "../../lib/elevateo/resend_events/client"
require_relative "../../lib/elevateo/resend_events/worker"

class ResendWorkerTest < Minitest::Test
  ID = "11111111-1111-4111-8111-111111111111"
  class Store
    attr_reader :ingested, :applied
    attr_accessor :claimed
    def initialize(type)
      @claimed = { "id" => "msg_test", "lease" => ResendWorkerTest::ID,
        "payload" => { "type" => type, "data" => { "email_id" => ResendWorkerTest::ID } } }
    end
    def claim = @claimed
    def apply(**args)
      @applied = args
      { "result" => "processed" }
    end
    def ingest(**args)
      @ingested = args
      { "result" => "created" }
    end
  end
  class Client
    attr_accessor :failed
    def retrieve(id)
      raise IOError, "sensitive provider response" if @failed
      { "id" => id, "from" => "sender@example.com", "to" => ["inbox@example.com"],
        "subject" => "Hi", "text" => "Hello", "attachments" => [] }
    end
  end
  class DownloadClient < Elevateo::ResendEvents::Client
    attr_accessor :url
    attr_reader :download
    private
    def json(*) = { "id" => ResendWorkerTest::ID, "download_url" => @url }
    def request(host, path, **args)
      @download = [host, path, args]
      "bytes"
    end
  end
  def test_delivery_does_not_retrieve_body
    store = Store.new("email.delivered")
    assert_equal "processed", Elevateo::ResendEvents::Worker.new(store: store, client: Object.new).run_once
    assert_equal "msg_test", store.applied[:id]
  end
  def test_received_content_and_provider_failure_are_atomic
    store, client = Store.new("email.received"), Client.new
    worker = Elevateo::ResendEvents::Worker.new(store: store, client: client)
    client.failed = true
    assert_raises(IOError) { worker.run_once }
    assert_nil store.ingested
    client.failed = false
    assert_equal "created", worker.run_once
    assert_equal "Hello", store.ingested[:content]["text"]
  end
  def test_empty_and_invalid_lease
    store = Store.new("email.received")
    worker = Elevateo::ResendEvents::Worker.new(store: store, client: Client.new)
    store.claimed = { "result" => "empty" }
    assert_equal "empty", worker.run_once
    store.claimed = { "id" => nil }
    assert_raises(Elevateo::ResendEvents::Invalid) { worker.run_once }
  end
  def test_download_origin_is_pinned_and_bearer_not_forwarded
    client = DownloadClient.new(api_key: "re_" + "x" * 32)
    ["http://inbound-cdn.resend.com/#{ID}/attachments/#{ID}", "https://evil.example/#{ID}/attachments/#{ID}",
     "https://inbound-cdn.resend.com/other", "https://user@inbound-cdn.resend.com/#{ID}/attachments/#{ID}"].each do |url|
      client.url = url
      assert_raises(Elevateo::ResendEvents::Invalid) { client.attachment(ID, ID) }
    end
    client.url = "https://inbound-cdn.resend.com/#{ID}/attachments/#{ID}?signature=private"
    assert_equal "bytes", client.attachment(ID, ID)
    assert_equal false, client.download[2][:authorized]
    assert_equal 262_144, client.download[2][:limit]
  end
end
