# frozen_string_literal: true

require_relative "draft_database_test_helper"
require_relative "../../lib/elevateo/drafts"

class DraftDatabaseTest < DraftDatabaseTestCase
  def test_equal_timestamp_seek_uses_descending_id_without_skipping_lookahead
    ids = Array.new(3) { SecureRandom.uuid }.sort.reverse
    ids.each { |id| save(payload({ "operation_id" => SecureRandom.uuid }, draft: id)) }
    stamp = "2026-10-12T00:00:00.000000Z"
    @admin.exec_params("UPDATE app.drafts SET updated_at=$1 WHERE organization_id=$2", [stamp, @org])
    begin_write
    # AIDEV-NOTE: Execute production pagination SQL to cover tuple ordering beyond the unit adapter's fake rows.
    first = @api.exec_params(Elevateo::Drafts::LIST_SQL, [@org, @user, @box, nil, nil, 2]).to_a
    assert_equal ids.first(2), first.map { |entry| entry.fetch("id") }
    second = @api.exec_params(Elevateo::Drafts::LIST_SQL, [@org, @user, @box, first.first.fetch("id"), stamp, 3]).to_a
    assert_equal ids.drop(1), second.map { |entry| entry.fetch("id") }
    assert_equal ids, [first.first, *second].map { |entry| entry.fetch("id") }
  ensure
    @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
  end

  def test_full_replacement_and_replayed_a_after_b_consumption_and_reply_deletion
    reply = SecureRandom.uuid
    @admin.exec_params("INSERT INTO app.threads(id, organization_id, mailbox_id) VALUES ($1, $2, $3)", [reply, @org, @box])
    original = payload("subject" => "A", "reply_to_thread_id" => reply,
      "to" => [{ "display_name" => nil, "address" => "" }])
    first = save(original)
    retained = ledger
    assert_retention(retained.first)
    assert_equal 1, first.fetch("version")
    second = payload("operation_id" => SecureRandom.uuid, "expected_version" => 1, "body_text" => "B")
    assert_equal 2, save(second).fetch("version")
    assert_equal "", draft_row.fetch("subject")
    assert_equal "[]", draft_row.fetch("recipients")
    @admin.exec_params("UPDATE app.drafts SET state = 'consumed' WHERE id = $1", [@draft])
    @admin.exec_params("DELETE FROM app.threads WHERE id = $1", [reply])
    assert_equal first, save(original)
    assert_equal retained.first, ledger.find { |entry| entry.fetch("operation_id") == @operation }
    assert_equal "B", draft_row.fetch("body_text")
    assert_equal "2", draft_row.fetch("version")
    result = lookup
    assert_equal "applied", result.fetch("outcome")
    assert_equal 1, result.fetch("version")
    assert_equal "editable", result.fetch("state")
    refute result.key?("payload_digest")
    refute result.key?("body_text")
  end

  def test_terminal_conflict_commits_original_metadata_and_cannot_be_repurposed
    conflict = payload("expected_version" => 9)
    assert_equal({ "code" => "draft_conflict" }, save(conflict))
    original = lookup
    retained = ledger.first
    assert_retention(retained)
    assert_equal ["conflict", 9, 0, nil], original.values_at("outcome", "expected_version", "current_version", "state")
    assert_nil draft_row
    assert_equal 1, save(payload("operation_id" => SecureRandom.uuid)).fetch("version")
    assert_equal({ "code" => "draft_conflict" }, save(conflict))
    assert_equal original, lookup
    assert_equal retained, ledger.find { |entry| entry.fetch("operation_id") == @operation }
    assert_equal({ "code" => "operation_mismatch" }, save(payload))
    assert_equal 2, ledger.length
    assert_equal "1", draft_row.fetch("version")
  end

  def test_consumed_precedes_stale_version_and_new_reply_validation_precedes_both
    save
    @admin.exec_params("UPDATE app.drafts SET state = 'consumed' WHERE id = $1", [@draft])
    attempt = payload("operation_id" => SecureRandom.uuid, "expected_version" => 0)
    assert_equal({ "code" => "draft_consumed" }, save(attempt))
    decision = lookup(operation: attempt.operation_id)
    assert_equal [1, "consumed"], decision.values_at("current_version", "state")
    invalid = payload("operation_id" => SecureRandom.uuid, "reply_to_thread_id" => SecureRandom.uuid)
    assert_equal({ "code" => "not_available" }, save(invalid))
    assert_equal "unknown", lookup(operation: invalid.operation_id).fetch("outcome")
  end

  def test_past_expiry_and_worker_compaction_preserve_permanent_binding
    save
    assert_retention(ledger.first)
    @admin.exec_params(<<~SQL, [@org, @operation])
      UPDATE app_drafts_private.operations SET recorded_at = statement_timestamp() - interval '604800 seconds',
        detail_expires_at = statement_timestamp() WHERE organization_id = $1 AND operation_id = $2
    SQL
    assert_equal "expired", lookup.fetch("outcome")
    assert_equal({ "code" => "operation_mismatch" }, save)
    aged = ledger.first
    assert_equal "1", @worker.exec("SELECT app.compact_draft_operations(1)").getvalue(0, 0)
    assert_nil ledger.first.fetch("detail")
    assert_equal aged.merge("detail" => nil), ledger.first
    assert_equal "0", @worker.exec("SELECT app.compact_draft_operations(1)").getvalue(0, 0)
    assert_equal aged.merge("detail" => nil), ledger.first
    assert_equal "expired", lookup.fetch("outcome")
    assert_equal({ "code" => "operation_mismatch" }, save)
    assert_equal "1", draft_row.fetch("version")
    assert_raises(PG::InvalidParameterValue) { @worker.exec("SELECT app.compact_draft_operations(1001)") }
  end

  def test_reversed_recipient_order_cannot_repurpose_an_operation
    recipients = [{ "display_name" => "A", "address" => "a@example.invalid" },
                  { "display_name" => nil, "address" => "b@example.invalid" }]
    save(payload("to" => recipients))
    original, draft = ledger, draft_row
    assert_equal({ "code" => "operation_mismatch" }, save(payload("to" => recipients.reverse)))
    assert_equal original, ledger
    assert_equal draft, draft_row
  end

  def assert_retention(entry)
    # AIDEV-NOTE: Check the originally recorded interval before fixture aging can hide a retention regression.
    assert_equal 604_800, Time.parse(entry.fetch("detail_expires_at")) - Time.parse(entry.fetch("recorded_at"))
  end

  def test_operation_binding_is_org_actor_scoped_and_lookup_unknown_is_metadata_only
    assert_equal({ "operation_id" => @operation, "mailbox_id" => @box, "draft_id" => @draft, "outcome" => "unknown" }, lookup)
    save
    another = SecureRandom.uuid
    assert_equal({ "code" => "operation_mismatch" }, save(payload({}, draft: another)))
    assert_equal({ "code" => "not_available" }, lookup(draft: another))
    assert_equal 1, ledger.length
  end

  def test_version_exhaustion_has_no_ledger_or_draft_mutation
    save
    @admin.exec_params("UPDATE app.drafts SET version = 2147483647 WHERE id = $1", [@draft])
    maximum = payload("operation_id" => SecureRandom.uuid, "expected_version" => 2_147_483_647)
    assert_equal({ "code" => "temporarily_unavailable" }, save(maximum))
    assert_equal "unknown", lookup(operation: maximum.operation_id).fetch("outcome")
    assert_equal "2147483647", draft_row.fetch("version")
    assert_equal 1, ledger.length
  end
end
