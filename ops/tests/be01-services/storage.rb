# frozen_string_literal: true

require_relative "http"

module Be01Services
  class Storage
    def initialize(key, bucket, mailbox)
      Be01Services.expect(/\Abe01-[0-9a-f]{32}\z/.match?(bucket), "fixture bucket")
      Be01Services.expect(/\A[0-9a-f-]{36}\z/.match?(mailbox), "fixture mailbox")
      @http = HTTP.new("storage")
      @key, @bucket = key, bucket
      @path = "#{mailbox}/proof.bin"
    end

    attr_reader :path

    def seed(bytes)
      @http.object("POST", "/bucket", token: @key, body: { id: @bucket, name: @bucket, public: false })
      @http.object("POST", "/object/#{@bucket}/#{@path}", token: @key, body: bytes, json: false)
    end

    def read(locator)
      Be01Services.expect(locator == @path, "server locator must match mailbox")
      status, bytes = @http.request("GET", "/object/#{@bucket}/#{locator}", token: @key)
      Be01Services.expect(status == 200, "service object read")
      bytes
    end

    def check(bytes, anon, user)
      bucket = @http.object("GET", "/bucket/#{@bucket}", token: @key)
      Be01Services.expect(bucket["public"] == false, "private bucket")
      Be01Services.expect(read(@path) == bytes, "Storage exact bytes")
      [nil, anon, user].each do |token|
        status, body = @http.request("GET", "/object/#{@bucket}/#{@path}", token: token)
        # AIDEV-NOTE: Storage masks private misses as 400/404; positive control above disambiguates existence.
        Be01Services.expect([400, 401, 403, 404].include?(status) && body != bytes, "direct object denial")
      end
      status, body = @http.request("GET", "/object/public/#{@bucket}/#{@path}")
      Be01Services.expect([400, 401, 403, 404].include?(status) && body != bytes, "public object denial")
    end
  end
end
