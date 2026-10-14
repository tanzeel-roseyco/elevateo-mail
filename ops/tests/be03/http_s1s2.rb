# frozen_string_literal: true

require_relative "http_fixture"

module Be03HTTP
  # AIDEV-NOTE: No driver is invoked; a readable held control permits durable queueing without submission.
  class Scenario
    def initialize(fixture)
      @fixture = fixture
    end

    def run
      @fixture.authenticate
      draft = SecureRandom.uuid
      @fixture.save(draft)
      review = @fixture.review(draft)
      @fixture.check(review.fetch("ready") == true && review.fetch("simulated") == true, "review_ready_required")
      body = @fixture.binding(review)
      @fixture.expect(@fixture.approval(draft, body.merge(correspondence_confirmed: false)), 400)
      @fixture.check(@fixture.counts == [0, 0, 0], "invalid_attestation_must_not_queue")
      bad_origin = @fixture.approval(draft, body, headers: { "Origin" => "http://invalid.example" })
      @fixture.check(bad_origin.code.to_i.between?(400, 499), "origin_denial_required")
      @fixture.check(@fixture.counts == [0, 0, 0], "origin_denial_must_not_queue")
      approved = @fixture.expect(@fixture.approval(draft, body), 202)
      @fixture.check(approved.fetch("draft_id") == draft &&
        approved.fetch("approved_version") == review.fetch("draft_version") &&
        approved.fetch("review_digest") == review.fetch("review_digest"), "reviewed_binding_required")
      replay = @fixture.expect(@fixture.approval(draft, body), 202)
      fields = %w[send_id draft_id approved_version review_digest approved_at simulated]
      @fixture.check(fields.all? { |key| approved.fetch(key) == replay.fetch(key) }, "immutable_replay_required")
      @fixture.check(approved.fetch("simulated") == true, "simulated_approval_required")
      @fixture.check(@fixture.counts == [1, 1, 1], "exact_one_durable_queue_required")
      state = @fixture.draft_state(draft)
      @fixture.check(!!state && state.fetch("state") == "consumed" && state.fetch("version") == "1",
        "consumed_version_unchanged_required")
      send_id = @fixture.text(approved.fetch("send_id"))
      status = @fixture.expect(@fixture.request("get", "/v1/send-intents/#{send_id}?mailbox_id=#{@fixture.seed.mailbox}"), 200)
      @fixture.check(status.fetch("state") == "queued" && status.fetch("attempts") == 0 &&
        status.fetch("simulated") == true && status.fetch("first_possible_at").nil?, "queued_without_dispatch_required")
      @fixture.check(%w[snapshot_bytes body_text access_token].none? { |key| status.key?(key) }, "private_status_required")
      stale_conflict
      @fixture.expect(@fixture.client.request("post", "/v1/auth/logout", body: { scope: "local" },
        headers: @fixture.client.challenge), 200)
      @fixture.expect(@fixture.approval(draft, body), 401)
      @fixture.check(@fixture.counts == [1, 1, 1], "logout_replay_must_not_mutate")
      @fixture.assertions
    end

    def stale_conflict
      draft = SecureRandom.uuid
      @fixture.save(draft)
      body = @fixture.binding(@fixture.review(draft))
      @fixture.save(draft, version: 1)
      conflict = @fixture.expect(@fixture.approval(draft, body), 409)
      @fixture.check(conflict.fetch("code") == "draft_conflict", "stale_version_conflict_required")
      replay = @fixture.expect(@fixture.approval(draft, body), 409)
      @fixture.check(replay.fetch("code") == conflict.fetch("code"), "conflict_replay_required")
      @fixture.check(@fixture.counts == [1, 1, 1], "conflict_must_not_queue")
      state = @fixture.draft_state(draft)
      @fixture.check(!!state && state.fetch("state") == "editable" && state.fetch("version") == "2",
        "conflict_preserves_saved_draft")
    end
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    assertions = Be03HTTP::Scenario.new(Be03HTTP::Fixture.new).run
    puts "BE03 S1S2 real HTTP/Auth/PostgreSQL PASS assertions=#{assertions}"
  rescue Be03HTTP::Failure => error
    warn "BE03 S1S2 FAIL code=#{error.message}"
    exit 1
  rescue StandardError
    # AIDEV-NOTE: Library errors can carry connection strings, invitation tokens or content; never print them.
    warn "BE03 S1S2 FAIL code=runtime_setup_or_io"
    exit 1
  end
end
