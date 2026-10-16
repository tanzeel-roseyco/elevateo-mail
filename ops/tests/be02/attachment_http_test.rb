# frozen_string_literal: true

require_relative "attachment_support"

class AttachmentHttpTest < AttachmentFixture
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
    refute(list.any? { |item| item.key?("storage_key") || item.key?("sha256") })
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
    # AIDEV-NOTE: Prove public drift blocks bytes; restore the shared fixture bucket even when the assertion fails.
    begin
      expect(@storage_http.request("put", "/bucket/be02-attachments", body: { public: true }, headers: @storage_headers), 200)
      expect(download(clean), 503)
    ensure
      expect(@storage_http.request("put", "/bucket/be02-attachments", body: { public: false }, headers: @storage_headers), 200)
    end
    assert_equal CLEAN, expect(download(clean), 200).body.b
    cookie = @client.cookies.fetch("elevateo_session")
    expect(@client.request("post", "/v1/auth/logout", body: { scope: "local" }, headers: @client.challenge), 200)
    @client.cookies["elevateo_session"] = cookie
    expect(download(clean), 401)
  end
end
