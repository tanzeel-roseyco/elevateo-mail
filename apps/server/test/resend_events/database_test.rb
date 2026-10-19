# frozen_string_literal: true
require_relative "../be_02/draft_database_test_helper"

class ResendInboundDatabaseTest < DraftDatabaseTestCase
  def setup
    super
    @email, @event = SecureRandom.uuid, "msg_" + SecureRandom.hex(12)
    @events = [@event]
    @address = "#{@box}@example.invalid"
    @admin.exec_params("INSERT INTO app.resend_inbound_routes(address,organization_id,mailbox_id,active) VALUES($1,$2,$3,true)",
      [@address, @org, @box])
  end
  def teardown
    if @admin && @box
      @admin.exec_params("DELETE FROM app.resend_inbound_receipts WHERE organization_id=$1", [@org])
      @admin.exec_params("DELETE FROM app.resend_inbound_routes WHERE organization_id=$1", [@org])
      (@events || []).each { |id| @admin.exec_params("DELETE FROM app.resend_webhook_events WHERE event_id=$1", [id]) }
    end
    super
  end
  def event(type: "email.received", email: @email)
    { "type" => type, "created_at" => "2026-10-17T01:00:00Z",
      "data" => { "email_id" => email, "to" => [@address], "from" => "sender@example.invalid" } }
  end
  def receive(value = event, id: @event)
    JSON.parse(@api.exec_params("SELECT app.receive_resend_event($1,$2)", [id, JSON.generate(value)]).getvalue(0, 0))
  end
  def claim
    JSON.parse(@worker.exec_params("SELECT app.claim_resend_event($1)", [SecureRandom.uuid]).getvalue(0, 0))
  end
  def content(**changes)
    { "id" => @email, "to" => [@address], "from" => "sender@example.invalid",
      "subject" => "Reply", "text" => "Safe text", "attachments" => [], "message_id" => "<#{@email}@example.invalid>" }.merge(changes.transform_keys(&:to_s))
  end
  def ingest(lease, value = content, id: @event)
    JSON.parse(@worker.exec_params("SELECT app.ingest_resend_email($1,$2,$3)", [id, lease, JSON.generate(value)]).getvalue(0, 0))
  end
  def test_durable_intake_duplicate_conflict_and_roles
    assert_equal "stored", receive["result"]
    assert_equal "stored", receive["result"]
    assert_equal "conflict", receive(event.merge("created_at" => "2026-10-18T01:00:00Z"))["result"]
    assert_raises(PG::InsufficientPrivilege) { @worker.exec_params("SELECT app.receive_resend_event($1,$2)", [@event, JSON.generate(event)]) }
    assert_raises(PG::InsufficientPrivilege) { @api.exec_params("SELECT app.claim_resend_event($1)", [SecureRandom.uuid]) }
    assert_raises(PG::InsufficientPrivilege) { @api.exec("SELECT * FROM app.resend_webhook_events") }
  end
  def test_replay_lease_and_duplicate_email
    receive
    assert_equal "stale", ingest(nil)["result"]
    lease = claim.fetch("lease")
    assert_equal "empty", claim["result"]
    assert_equal "stale", ingest(SecureRandom.uuid)["result"]
    first = ingest(lease)
    assert_equal "created", first["result"]
    assert_equal "stale", ingest(lease)["result"]
    second_id = "msg_" + SecureRandom.hex(12)
    @events << second_id
    receive(id: second_id)
    second = ingest(claim.fetch("lease"), id: second_id)
    assert_equal "duplicate", second["result"]
    assert_equal first["message_id"], second["message_id"]
  end
  def test_unknown_route_and_unmatched_delivery_remain_pending
    receive
    @admin.exec_params("UPDATE app.resend_inbound_routes SET active=false WHERE address=$1", [@address])
    assert_equal "route_pending", ingest(claim.fetch("lease"))["result"]
    assert_equal "pending", @admin.exec_params("SELECT status FROM app.resend_webhook_events WHERE event_id=$1", [@event]).getvalue(0, 0)
  end
  def test_inbound_attachments_commit_in_quarantine_and_rollback_on_invalid_key
    receive
    lease = claim.fetch("lease")
    part = { "ordinal" => 0, "filename" => "hello.txt", "content_type" => "text/plain", "byte_size" => 5,
      "sha256" => "a" * 64, "storage_key" => "quarantine/resend/#{@email}/0", "rejection_reason" => nil }
    assert_raises(PG::InvalidParameterValue) { ingest(lease, content(attachments: [part.merge("storage_key" => "quarantine/resend/#{SecureRandom.uuid}/0")])) }
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app.resend_inbound_receipts WHERE email_id=$1", [@email]).getvalue(0, 0)
    first = ingest(lease, content(attachments: [part]))
    assert_equal "created", first["result"]
    assert_equal "pending_scan", @admin.exec_params("SELECT scan_status FROM app.inbox_attachments WHERE message_id=$1", [first["message_id"]]).getvalue(0, 0)
  end
  def test_signed_and_retrieved_recipient_must_agree
    receive
    assert_equal "route_pending", ingest(claim.fetch("lease"), content(to: ["other@example.invalid"]))["result"]
  end
  # AIDEV-NOTE: RFC references must join only the mailbox selected by the signed recipient route.
  def test_reply_reference_joins_existing_mailbox_thread
    receive
    original = ingest(claim.fetch("lease"))
    reference = content.fetch("message_id")
    @email, @event = SecureRandom.uuid, "msg_" + SecureRandom.hex(12)
    @events << @event
    receive
    reply = ingest(claim.fetch("lease"), content(in_reply_to: reference))
    assert_equal "created", reply["result"]
    assert_equal original["thread_id"], reply["thread_id"]
    refute_equal original["message_id"], reply["message_id"]
  end

  def test_reply_reference_cannot_cross_mailbox_route
    receive
    original = ingest(claim.fetch("lease"))
    reference = content.fetch("message_id")
    other_box = SecureRandom.uuid
    @address = "#{other_box}@example.invalid"
    @admin.exec_params("INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES($1,$2,$3,'private')", [other_box, @org, @address])
    @admin.exec_params("INSERT INTO app.resend_inbound_routes(address,organization_id,mailbox_id,active) VALUES($1,$2,$3,true)", [@address, @org, other_box])
    @email, @event = SecureRandom.uuid, "msg_" + SecureRandom.hex(12)
    @events << @event
    receive
    reply = ingest(claim.fetch("lease"), content(in_reply_to: reference))
    assert_equal "created", reply["result"]
    refute_equal original["thread_id"], reply["thread_id"]
    assert_equal other_box, @admin.exec_params("SELECT mailbox_id FROM app.messages WHERE id=$1", [reply["message_id"]]).getvalue(0, 0)
  end

end
