# frozen_string_literal: true

require "minitest/autorun"
require "digest"
require "active_record"
require_relative "http_support"
require_relative "../../../apps/server/lib/elevateo/attachments_repository"
require_relative "../../../apps/server/lib/elevateo/attachments_scan"
require_relative "../../../apps/server/lib/elevateo/attachments_storage"

# AIDEV-NOTE: Reusable isolated Auth/Storage/scanner fixture; mail arrives via admin SQL or real private Mox.
class AttachmentFixture < Minitest::Test
  CLEAN = "Private attachment integration\n\x00\xff".b.freeze
  EICAR = ('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*').b.freeze

  def expect(response, code)
    assert_equal code.to_s, response.code, "HTTP status differs; private response body omitted"
    response
  end

  def setup
    @storage_http = Be02Http.new("http://storage:5000")
    @storage_headers = { "Authorization" => "Bearer #{ENV.fetch('BE02_STORAGE_SERVICE')}" }
    @scanner = Elevateo::Attachments::ClamdScanner.new
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 100
    loop do
      begin
        break if @storage_http.request("get", "/status").code == "200" && @scanner.scan(CLEAN) == "clean" &&
          Be02Http.new("http://attachment-gateway:4708").request("get", "/").code == "404"
      rescue IOError, SocketError, SystemCallError, Timeout::Error, Elevateo::Attachments::ClamdScanner::Error
        # AIDEV-NOTE: Only startup is retried; assertions and scan/download failures never retry.
      end
      raise "private service startup deadline exceeded" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
      sleep 1
    end
    # AIDEV-NOTE: List first: pinned Storage returns HTTP400 for a missing bucket; never accept arbitrary errors.
    buckets = JSON.parse(expect(@storage_http.request("get", "/bucket", headers: @storage_headers), 200).body)
    assert_kind_of Array, buckets
    matching = buckets.select { |bucket| bucket.fetch("id") == "be02-attachments" }
    assert_operator matching.length, :<=, 1
    if matching.empty?
      expect(@storage_http.request("post", "/bucket", body: { id: "be02-attachments", name: "be02-attachments", public: false },
        headers: @storage_headers), 200)
    else
      # AIDEV-NOTE: Combined jobs reuse this bucket; public drift must fail rather than be silently repaired.
      assert_equal false, matching.first.fetch("public")
    end
    @storage = Elevateo::Attachments::PrivateStorage.new(base_url: "http://storage:5000", bucket: "be02-attachments",
      service_token: ENV.fetch("BE02_STORAGE_SERVICE"), process: "worker")
    @fixture, @client = Be02Fixture.new, Be02Http.new
    login(@fixture, @client)
    current = @client.json(expect(@client.request("get", "/v1/session"), 200))
    @hints = { "X-Session-Context" => current.fetch("context_id"),
               "X-Authorization-Version" => current.fetch("authorization_version") }
    @admin = PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
    assert_equal "supabase_admin", @admin.exec("SELECT session_user").getvalue(0, 0)
    ActiveRecord::Base.establish_connection(ENV.fetch("BE02_WORKER_DATABASE_URL"))
    @connection = ActiveRecord::Base.connection
    assert_equal "elevateo_worker", @connection.select_value("SELECT session_user")
    @scans = Elevateo::Attachments::ScanService.new(
      repository: Elevateo::Attachments::Repository.new(connection: @connection), storage: @storage, scanner: @scanner)
  end

  def teardown
    @admin&.close
    ActiveRecord::Base.connection_pool.disconnect! if ActiveRecord::Base.connected?
  end

  def login(fixture, client)
    expect(client.request("get", fixture.invite), 303)
    expect(client.request("post", "/v1/auth/accept", body: { password: fixture.password }, headers: client.challenge), 200)
  end

  # AIDEV-NOTE: Keep Minitest::Assertions#message intact; every assertion uses its two-argument formatter.
  def attachment_message_id(fixture)
    @admin.exec_params("SELECT id FROM app.messages WHERE thread_id=$1", [fixture.thread]).getvalue(0, 0)
  end

  def stage(fixture, bytes, rejected: false)
    id = SecureRandom.uuid
    key = "quarantine/#{fixture.organization}/#{id}"
    @storage.put(key, bytes, content_type: "application/octet-stream") unless rejected
    values = [id, fixture.organization, fixture.mailbox, fixture.thread, attachment_message_id(fixture),
              rejected ? nil : key, rejected ? 0 : bytes.bytesize, rejected ? nil : Digest::SHA256.hexdigest(bytes),
              rejected ? "rejected" : "pending_scan", rejected ? "invalid_signature" : nil]
    @admin.exec_params(<<~SQL, values)
      INSERT INTO app.inbox_attachments(id,organization_id,mailbox_id,thread_id,message_id,storage_key,
        filename,content_type,byte_size,sha256,scan_status,rejection_reason)
      VALUES ($1,$2,$3,$4,$5,$6,'integration.bin','text/plain',$7,$8,$9,$10)
    SQL
    @admin.exec_params("UPDATE app.messages SET attachment_count=attachment_count+1 WHERE id=$1", [attachment_message_id(fixture)])
    { id: id, key: key, path: "/v2/mailboxes/#{fixture.mailbox}/threads/#{fixture.thread}/messages/#{attachment_message_id(fixture)}/attachments/#{id}/content" }
  end

  def download(item, client: @client, hints: @hints)
    client.request("get", item.fetch(:path), headers: hints)
  end

  def scan(item, expected)
    assert_equal expected, @scans.inspect(id: item.fetch(:id))
    # AIDEV-NOTE: Independent privileged connection witnesses the committed verdict, not worker return values alone.
    row = @admin.exec_params("SELECT scan_status,scan_attempt FROM app.inbox_attachments WHERE id=$1", [item.fetch(:id)]).first
    assert_equal expected, row.fetch("scan_status")
    assert_equal "1", row.fetch("scan_attempt")
  end

end
