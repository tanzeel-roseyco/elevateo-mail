# frozen_string_literal: true

require "minitest/autorun"
require "minitest/mock"
require_relative "../../lib/elevateo/attachments_storage"

# AIDEV-NOTE: Duplicate HTTP status alone proves nothing; replay must verify exact private bytes without upsert.
class PrivateStorageReplayTest < Minitest::Test
  KEY = "quarantine/imap/11111111-1111-4111-8111-111111111111/42/1/0"
  class Exchange
    attr_accessor :max_retries, :open_timeout, :read_timeout, :write_timeout, :ignore_eof
    attr_reader :requests
    def initialize(status:, stored:, get_status: "200")
      @status, @stored, @get_status, @requests = status, stored, get_status, []
    end
    def start = yield self
    def request(request)
      @requests << request
      code, body = if request.path.start_with?("/bucket/")
        ["200", '{"public":false}']
      elsif request.is_a?(Net::HTTP::Post)
        [@status, '{"error":"Duplicate"}']
      else
        [@get_status, @stored]
      end
      response = Net::HTTPResponse.new("1.1", code, "fixture")
      response.define_singleton_method(:read_body) { |&block| block.call(body) }
      yield response
    end
  end

  def adapter
    Elevateo::Attachments::PrivateStorage.new(base_url: "http://storage:5000", bucket: "inbox-private",
      service_token: "x" * 32, process: "worker")
  end

  def test_duplicate_status_requires_identical_bytes_and_never_overwrites
    %w[400 409].each do |status|
      exchange = Exchange.new(status: status, stored: "same")
      Net::HTTP.stub(:new, ->(*_args) { exchange }) { assert_nil adapter.put_once(KEY, "same") }
      writes = exchange.requests.select { |request| request.is_a?(Net::HTTP::Post) }
      assert_equal 1, writes.length
      assert_nil writes.first["x-upsert"]
      assert_equal "same", writes.first.body
      assert_equal 4, exchange.requests.length
    end
  end

  def test_duplicate_with_changed_or_unreadable_bytes_is_held
    %w[400 409].each do |status|
      [["different", "200"], ["same", "403"], ["missing", "404"]].each do |stored, get_status|
        exchange = Exchange.new(status: status, stored: stored, get_status: get_status)
        Net::HTTP.stub(:new, ->(*_args) { exchange }) do
          assert_raises(Elevateo::Attachments::PrivateStorage::Unavailable) { adapter.put_once(KEY, "same") }
        end
      end
    end
  end

  def test_other_upload_denials_never_read_back
    %w[401 403 500].each do |status|
      exchange = Exchange.new(status: status, stored: "same")
      Net::HTTP.stub(:new, ->(*_args) { exchange }) do
        assert_raises(Elevateo::Attachments::PrivateStorage::Unavailable) { adapter.put_once(KEY, "same") }
      end
      assert_equal 2, exchange.requests.length
    end
  end
end
