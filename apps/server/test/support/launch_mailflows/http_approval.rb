# frozen_string_literal: true

# AIDEV-NOTE: Exercise public approval contracts; administrative SQL only changes fixture grants and observes effects.
module LaunchMailflowHttpApproval
  def review_reply_over_http(client, session)
    response = client.request("get", "/v1/drafts/#{@draft}/send-review?mailbox_id=#{@box}",
      headers: http_hints(session))
    review = client.json(http_expect(response, 200))
    assert review.fetch("ready"), review.fetch("issues").inspect
    assert_equal "mox", review.fetch("outbound_mode")
    assert_equal false, review.fetch("simulated")
    assert_equal @identities[1], review.fetch("sender").fetch("address")
    assert_equal @received.fetch("thread_id"), review.fetch("reply_to_thread_id")
    assert_match(/\A[0-9a-f]{64}\z/, review.fetch("review_digest"))
    review
  end

  def approval_request(client, session, wire)
    client.request("post", "/v1/drafts/#{@draft}/send-approvals", body: wire, headers: http_hints(session))
  end

  def assert_approval_denied(client, session, wire, status, code)
    response = http_expect(approval_request(client, session, wire.merge(operation_id: SecureRandom.uuid)), status)
    assert_equal code, client.json(response).fetch("code")
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app_send_private.intents WHERE draft_id=$1", [@draft]).getvalue(0, 0)
  end

  def approve_reply_over_http(client, session, user, stale_review)
    review = review_reply_over_http(client, session)
    assert_equal 1, stale_review.fetch("draft_version")
    assert_equal 2, review.fetch("draft_version")
    refute_equal stale_review.fetch("review_digest"), review.fetch("review_digest")
    wire = { mailbox_id: @box, operation_id: SecureRandom.uuid, expected_version: 2,
      review_digest: review.fetch("review_digest"), correspondence_confirmed: true }
    assert_approval_denied(client, session, wire.merge(review_digest: "0" * 64), 409, "review_stale")
    assert_approval_denied(client, session, wire.merge(expected_version: 1,
      review_digest: stale_review.fetch("review_digest")), 409, "draft_conflict")
    assert_approval_denied(LaunchMailflowHttpClient.new, session, wire, 401, "unauthenticated")
    invalid_csrf = session.merge("csrf_token" => "invalid" * 8)
    assert_approval_denied(client, invalid_csrf, wire, 400, "request_invalid")
    # AIDEV-NOTE: Retaining compose proves approval requires its own grant, not merely access to this actor's draft.
    set_http_approval_grant(user, false)
    session = http_session(client)
    assert_approval_denied(client, session, wire, 404, "not_available")
    set_http_approval_grant(user, true)
    session = http_session(client)
    approved = client.json(http_expect(approval_request(client, session, wire), 202))
    assert_equal @draft, approved.fetch("draft_id")
    assert_equal 2, approved.fetch("approved_version")
    assert_equal review.fetch("review_digest"), approved.fetch("review_digest")
    assert_equal false, approved.fetch("simulated")
    send_id = approved.fetch("send_id")
    replay = client.json(http_expect(approval_request(client, session, wire), 202))
    assert_equal send_id, replay.fetch("send_id")
    # AIDEV-NOTE: Count the entire draft so an extra intent with another ID cannot hide behind the replay response.
    intents = @admin.exec_params("SELECT send_id FROM app_send_private.intents WHERE draft_id=$1", [@draft])
    assert_equal 1, intents.ntuples
    assert_equal send_id, intents.getvalue(0, 0)
    send_id
  end

  def set_http_approval_grant(user, allowed)
    fixture_change do
      @admin.exec_params("SELECT app_auth.lock_authorization_generations($1,$2)", [@org, user])
      @admin.exec_params("UPDATE app.mailbox_memberships SET approve_send=$4 WHERE organization_id=$1 AND mailbox_id=$2 AND user_id=$3",
        [@org, @box, user, allowed])
    end
  end
end
