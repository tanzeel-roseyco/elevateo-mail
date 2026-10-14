# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/outreach_sequence/schedule"

class OutreachSequenceScheduleTest < Minitest::Test
  Schedule = Elevateo::OutreachSequence::Schedule
  CAMPAIGN = "11111111-1111-4111-8111-111111111111"
  LEAD = "22222222-2222-4222-8222-222222222222"
  STEP = "33333333-3333-4333-8333-333333333333"

  def test_valid_local_time_resolves_to_utc
    assert_equal Time.utc(2026, 3, 29, 1, 30),
      Schedule.due_utc(local_at: "2026-03-29T03:30:00", timezone: "Europe/Berlin")
  end

  def test_spring_gap_and_autumn_fold_have_no_due_instant
    assert_nil Schedule.due_utc(local_at: "2026-03-29T02:30:00", timezone: "Europe/Berlin")
    assert_nil Schedule.due_utc(local_at: "2026-10-25T02:30:00", timezone: "Europe/Berlin")
  end

  def test_invalid_local_and_zone_are_rejected
    assert_raises(ArgumentError) { Schedule.due_utc(local_at: "2026-02-30T12:00:00", timezone: "Europe/Berlin") }
    assert_raises(ArgumentError) { Schedule.due_utc(local_at: "2026-03-29T03:30:00Z", timezone: "Europe/Berlin") }
    assert_raises(ArgumentError) { Schedule.due_utc(local_at: "2026-03-29T03:30:00", timezone: "No/SuchZone") }
    assert_raises(ArgumentError) { Schedule.due_utc(local_at: "\xFF".b, timezone: "Europe/Berlin") }
  end

  def test_due_after_uses_explicit_anchor_and_next_local_day
    anchor = Time.utc(2026, 3, 28, 23, 0)
    assert_equal Time.utc(2026, 3, 29, 1, 30),
      Schedule.due_after(anchor_utc: anchor, delay_seconds: 0, local_time: "03:30:00", timezone: "Europe/Berlin")
    assert_equal Time.utc(2026, 3, 30, 1, 30),
      Schedule.due_after(anchor_utc: Time.utc(2026, 3, 29, 2, 0), delay_seconds: 0,
        local_time: "03:30:00", timezone: "Europe/Berlin")
  end

  def test_due_after_holds_dst_gap_and_rejects_invalid_bounds
    assert_nil Schedule.due_after(anchor_utc: Time.utc(2026, 3, 29, 0), delay_seconds: 0,
      local_time: "02:30:00", timezone: "Europe/Berlin")
    assert_raises(ArgumentError) { Schedule.due_after(anchor_utc: Time.utc(2026, 3, 29),
      delay_seconds: 2_592_001, local_time: "03:30:00", timezone: "Europe/Berlin") }
    assert_raises(ArgumentError) { Schedule.due_after(anchor_utc: Time.utc(2026, 3, 29),
      delay_seconds: 0, local_time: "24:00:00", timezone: "Europe/Berlin") }
  end

  def test_occurrence_key_is_stable_and_changes_with_step_or_version
    first = Schedule.occurrence_key(campaign_id: CAMPAIGN, lead_id: LEAD, step_id: STEP, draft_version: 1)
    assert_equal first, Schedule.occurrence_key(campaign_id: CAMPAIGN, lead_id: LEAD, step_id: STEP, draft_version: 1)
    refute_equal first, Schedule.occurrence_key(campaign_id: CAMPAIGN, lead_id: LEAD, step_id: STEP, draft_version: 2)
    refute_equal first, Schedule.occurrence_key(campaign_id: CAMPAIGN, lead_id: STEP, step_id: LEAD, draft_version: 1)
    assert_raises(ArgumentError) { Schedule.occurrence_key(campaign_id: CAMPAIGN, lead_id: LEAD, step_id: "bad", draft_version: 1) }
  end

  def test_exact_reply_or_unsubscribe_cancels_and_ambiguous_signal_holds
    now = Time.utc(2026, 10, 14)
    exact = { "kind" => "reply", "campaign_id" => CAMPAIGN, "lead_id" => LEAD,
      "correlation" => "exact", "occurred_at" => now }
    assert_equal :cancel, Schedule.stop_decision(campaign_id: CAMPAIGN, lead_id: LEAD, events: [exact])
    assert_equal :cancel, Schedule.stop_decision(campaign_id: CAMPAIGN, lead_id: LEAD,
      events: [exact.merge("kind" => "unsubscribe")])
    assert_equal :hold, Schedule.stop_decision(campaign_id: CAMPAIGN, lead_id: LEAD,
      events: [exact.merge("correlation" => "ambiguous", "lead_id" => nil)])
    assert_equal :candidate, Schedule.stop_decision(campaign_id: CAMPAIGN, lead_id: LEAD,
      events: [exact.merge("lead_id" => STEP)])
    assert_raises(ArgumentError) { Schedule.stop_decision(campaign_id: CAMPAIGN, lead_id: LEAD,
      events: [exact.merge("kind" => "open")]) }
  end

  def test_reply_or_unsubscribe_stops_candidate_without_granting_send
    now = Time.utc(2026, 10, 14)
    refute Schedule.stop_required?(reply_at: nil, unsubscribe_at: nil)
    assert Schedule.stop_required?(reply_at: now, unsubscribe_at: nil)
    assert Schedule.stop_required?(reply_at: nil, unsubscribe_at: now)
    assert_raises(ArgumentError) { Schedule.stop_required?(reply_at: "yesterday", unsubscribe_at: nil) }
  end
end
