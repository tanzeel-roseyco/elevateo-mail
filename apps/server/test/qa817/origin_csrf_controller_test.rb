# frozen_string_literal: true

require_relative "../be_02/collaboration_controller_helper"

# AIDEV-NOTE: Real controller boundary must reject forged browser context before Auth or business SQL.
class QA817OriginCsrfControllerTest < Minitest::Test
  include AuthFixtures
  include CollaborationControllerHarness

  def setup
    @service, @store, @client, @cookie = harness
    @connection = CollaborationControllerHarness::Connection.new(metadata)
  end

  def teardown
    refute @connection.transaction_open?
    assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
  end

  def test_same_origin_valid_csrf_writes_literal_untrusted_plaintext
    plaintext = "<script>secret-looking content</script>"
    @connection.rows = [[{ "id" => THREAD }], [note_row(plaintext)]]
    status, headers, body = dispatch_collaboration(NotesController, "create",
      payload: { "mailbox_id" => BOX, "note_id" => NOTE, "body_text" => plaintext })
    assert_equal 201, status
    assert_equal plaintext, body.fetch("note").fetch("body_text")
    assert_equal "no-store", headers.fetch("cache-control")
  end

  def test_cross_origin_and_absent_origin_fail_before_auth_or_sql
    ["https://app.test.evil", nil].each do |origin|
      assert_rejected({ "HTTP_ORIGIN" => origin })
    end
  end

  def test_malformed_csrf_and_body_secret_injection_fail_closed
    assert_rejected({ "HTTP_X_CSRF_TOKEN" => "forged" })
    payload = { "mailbox_id" => BOX, "note_id" => NOTE, "body_text" => "hello", "access_token" => "secret" }
    status, _, body = dispatch_collaboration(NotesController, "create", payload: payload)
    assert_equal [400, "request_invalid"], [status, body.fetch("code")]
    refute_includes JSON.generate(body), "secret"
    assert_empty @client.calls
    assert_empty @connection.events
  end

  private

  def assert_rejected(headers)
    status, _, body = dispatch_collaboration(NotesController, "create",
      payload: { "mailbox_id" => BOX, "note_id" => NOTE, "body_text" => "hello" }, headers: headers)
    assert_equal [400, "request_invalid"], [status, body.fetch("code")]
    assert_empty @client.calls
    assert_empty @connection.events
  end
end
