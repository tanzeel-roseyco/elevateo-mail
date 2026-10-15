# frozen_string_literal: true

require "minitest/autorun"
require "digest"
require "active_record"
require_relative "http_support"
require_relative "../../../apps/server/lib/elevateo/attachments_repository"
require_relative "../../../apps/server/lib/elevateo/attachments_scan"
require_relative "../../../apps/server/lib/elevateo/attachments_storage"

# AIDEV-NOTE: Admin SQL creates synthetic mail only; Auth, Storage, scanning and downloads use real services.
class AttachmentHttpTest < Minitest::Test
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
    expect(@storage_http.request("post", "/bucket", body: { id: "be02-attachments", name: "be02-attachments", public: false },
      headers: @storage_headers), 200)
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

  def test_real_private_attachment_lifecycle_and_denials
    clean = stage(@fixture, CLEAN)
    malware = stage(@fixture, EICAR)
    rejected = stage(@fixture, "".b, rejected: true)
    expect(download(clean), 423)
    expect(download(malware), 423)
    scan(clean, "clean")
    scan(malware, "malware")
    response = expect(download(clean), 200)
    assert_equal CLEAN, response.body.b
    assert_equal "application/octet-stream", response["content-type"]
    assert_equal 'attachment; filename="attachment"', response["content-disposition"]
    assert_equal "no-store", response["cache-control"]
    assert_equal "nosniff", response["x-content-type-options"]
    assert_equal CLEAN.bytesize.to_s, response["content-length"]
    expect(download(malware), 423)
    expect(download(rejected), 423)
    list_path = clean.fetch(:path).sub(%r{/[^/]+/content\z}, "")
    list = @client.json(expect(@client.request("get", list_path, headers: @hints), 200)).fetch("items")
    assert_equal [clean, malware, rejected].map { |item| item.fetch(:id) }.sort, list.map { |item| item.fetch("id") }.sort
    assert_equal 0, list.find { |item| item.fetch("id") == rejected.fetch(:id) }.fetch("byte_size")
    refute list.any? { |item| item.key?("storage_key") || item.key?("sha256") }
    # AIDEV-NOTE: Other identity really logs in; a denial is not attributed to absent authentication.
    other, other_client = Be02Fixture.new, Be02Http.new
    login(other, other_client)
    other_session = other_client.json(expect(other_client.request("get", "/v1/session"), 200))
    other_hints = { "X-Session-Context" => other_session.fetch("context_id"),
                    "X-Authorization-Version" => other_session.fetch("authorization_version") }
    expect(download(clean, client: other_client, hints: other_hints), 404)
    unauthenticated = Be02Http.new
    expect(download(clean, client: unauthenticated), 401)
    public_response = @storage_http.request("get", "/object/public/be02-attachments/#{clean.fetch(:key)}")
    refute_equal "200", public_response.code
    refute_equal CLEAN, public_response.body.b
    # AIDEV-NOTE: Public-bucket drift must block bytes even for an otherwise valid application session.
    expect(@storage_http.request("put", "/bucket/be02-attachments", body: { public: true }, headers: @storage_headers), 200)
    expect(download(clean), 503)
    expect(@storage_http.request("put", "/bucket/be02-attachments", body: { public: false }, headers: @storage_headers), 200)
    assert_equal CLEAN, expect(download(clean), 200).body.b
    cookie = @client.cookies.fetch("elevateo_session")
    expect(@client.request("post", "/v1/auth/logout", body: { scope: "local" }, headers: @client.challenge), 200)
    @client.cookies["elevateo_session"] = cookie
    expect(download(clean), 401)
  end
end
