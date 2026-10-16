# frozen_string_literal: true

require_relative "draft_staging_database_helper"

# AIDEV-NOTE: These role-level tests prove metadata fencing; scanner byte validation has separate transport tests.
class DraftScanDatabaseTest < DraftStagingDatabaseTestCase
  def setup
    super
    reserve
    finalize
  end

  def due(limit = 25)
    @worker.exec_params("SELECT id FROM app.due_draft_attachment_scans($1::integer)", [limit]).column_values(0)
  end

  def expire_claim
    @admin.exec_params("UPDATE app.draft_attachments SET scan_started_at=clock_timestamp()-interval '3 minutes' WHERE id=$1", [@attachment])
  end

  def test_claim_and_verdict_require_current_token_attempt_and_original_bytes
    assert_equal [@attachment], due
    token, rows = claim
    assert_equal [{"storage_key" => "drafts/#{@org}/#{@attachment}", "byte_size" => "12",
                   "sha256" => @bytes_digest, "scan_attempt" => "1"}], rows
    assert_empty due
    assert_empty claim.last
    before = scan_row
    assert_equal "f", verdict(SecureRandom.uuid, 1, "clean")
    assert_equal "f", verdict(token, 2, "clean")
    assert_equal "f", verdict(token, 1, "clean", digest: "a" * 64)
    assert_equal before, scan_row
    assert_equal "t", verdict(token, 1, "clean")
    assert_equal "clean", attachment_list.fetch("items").fetch(0).fetch("status")
    assert_equal "f", verdict(token, 1, "malware")
    assert_empty due
    assert_empty claim.last
  end

  def test_malware_is_terminal_and_reservation_replay_does_not_reset_it
    token, = claim
    assert_equal "t", verdict(token, 1, "malware")
    before = scan_row
    assert_equal "committed", finalize.fetch("stage_state")
    assert_equal "committed", reserve.fetch("stage_state")
    assert_equal before, scan_row
    assert_equal "malware", attachment_list.fetch("items").fetch(0).fetch("status")
    assert_empty due
    assert_empty claim.last
  end

  def test_failures_back_off_and_exhaust_after_three_attempts
    3.times do |index|
      token, rows = claim
      attempt = index + 1
      assert_equal attempt.to_s, rows.fetch(0).fetch("scan_attempt")
      assert_equal "t", verdict(token, attempt, "scan_failed")
      assert_empty due
      assert_empty claim.last
      row = scan_row
      assert_equal "scan_failed", row.fetch("scan_status")
      if attempt < 3
        assert_operator Time.parse(row.fetch("scan_next_at")), :>, Time.parse(row.fetch("scan_updated_at"))
        @admin.exec_params("UPDATE app.draft_attachments SET scan_next_at=clock_timestamp()-interval '1 second' WHERE id=$1", [@attachment])
        assert_equal [@attachment], due
      else
        assert_nil row.fetch("scan_next_at")
      end
    end
  end

  def test_expired_final_claim_settles_and_late_results_cannot_resurrect_it
    first, = claim
    expire_claim
    second, rows = claim
    assert_equal "2", rows.fetch(0).fetch("scan_attempt")
    assert_equal "f", verdict(first, 1, "clean")
    expire_claim
    third, rows = claim
    assert_equal "3", rows.fetch(0).fetch("scan_attempt")
    assert_empty due
    assert_equal "pending_scan", scan_row.fetch("scan_status")
    expire_claim
    assert_empty due(1)
    settled = scan_row
    assert_equal "scan_failed", settled.fetch("scan_status")
    assert_nil settled.fetch("scan_token")
    assert_nil settled.fetch("scan_started_at")
    assert_nil settled.fetch("scan_next_at")
    assert_equal "f", verdict(second, 2, "clean")
    assert_equal "f", verdict(third, 3, "clean")
    assert_empty claim.last
    assert_empty due
    assert_equal settled, scan_row
  end

  def test_null_and_out_of_bound_worker_inputs_fail_without_changes
    before = scan_row
    [nil, 0, 26].each { |limit| assert_raises(PG::InsufficientPrivilege) { due(limit) } }
    assert_raises(PG::InsufficientPrivilege) { claim(nil) }
    [nil, 0, 4].each { |attempt| assert_raises(PG::InsufficientPrivilege) { verdict(SecureRandom.uuid, attempt, "clean") } }
    [nil, "pending_scan", "CLEAN"].each { |status| assert_raises(PG::InsufficientPrivilege) { verdict(SecureRandom.uuid, 1, status) } }
    [nil, "E" * 64].each { |digest| assert_raises(PG::InsufficientPrivilege) { verdict(SecureRandom.uuid, 1, "clean", digest: digest) } }
    assert_equal before, scan_row
  end
end
