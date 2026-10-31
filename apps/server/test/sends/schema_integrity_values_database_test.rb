# frozen_string_literal: true

require "json"
require "pg"
require "securerandom"
require "minitest/autorun"

# AIDEV-NOTE: Read the installed CHECK expression, so these boundary probes test migrated SQL, not a Ruby copy.
class SchemaValueConstraintsDatabaseTest < Minitest::Test
  CASES = [
    ["app.inbound_imap_accounts", "imap_account_uid_range", { uidvalidity: 4_294_967_295, last_uid: 0 }, { uidvalidity: 4_294_967_296, last_uid: 0 }],
    ["app.inbound_imap_receipts", "imap_receipt_uid_range", { uidvalidity: 1, uid: 4_294_967_295 }, { uidvalidity: 1, uid: 4_294_967_296 }],
    ["app.resend_webhook_events", "webhook_digest_shape", { body_digest: "a" * 64 }, { body_digest: "bad" }],
    ["app.resend_webhook_events", "webhook_payload_shape", { payload: { type: "email.received", data: { email_id: "id_1" } } }, { payload: {} }],
    ["app.resend_webhook_events", "webhook_lease_state", { status: "pending" }, { status: "processed" }],
    ["app.resend_webhook_events", "webhook_attempt_range", { attempts: 0 }, { attempts: -1 }],
    ["app_send_private.resend_events", "resend_state_matches_type", { event_type: "email.sent", delivery_state: "sent" }, { event_type: "email.sent", delivery_state: "delivered" }],
    ["app_send_private.resend_delivery", "resend_delivery_severity", { kind: "email.complained", severity: 7 }, { kind: "email.delivered", severity: 7 }],
    ["app_send_private.resend_acceptance", "resend_acceptance_receipt_shape", { receipt_ref: "resend:id_1" }, { receipt_ref: "other:id_1" }],
    ["app_send_private.attempts", "attempt_sender_shape", { smtp_sender: "Sender@example.invalid" }, { smtp_sender: "invalid" }],
    ["app_send_private.mox_domains", "mox_domain_labels", { domain: "a-b.example.invalid" }, { domain: "a..example.invalid" }],
    ["app_send_private.mox_domains", "mox_evidence_shape", { evidence_ref: "a" * 64 }, { evidence_ref: "invalid" }],
    ["app_connector_private.grants", "connector_scope_set", { scopes: %w[search read draft] }, { scopes: %w[read read] }],
    ["app_auth.revocation_intents", "revocation_generation_range", { credential_generation: 0 }, { credential_generation: -1 }],
    ["app_auth.revocation_intents", "revocation_claim_pair", { state: "pending" }, { state: "claimed" }],
    ["app_auth.pending_entries", "pending_claim_pair", {}, { claim_id: "11111111-1111-4111-8111-111111111111" }],
    ["app_auth.pending_entries", "pending_access_ciphertext_bound", { access_token_ciphertext: "a" * 16_384 }, { access_token_ciphertext: "a" * 16_385 }],
    ["app_auth.pending_entries", "pending_refresh_ciphertext_bound", { refresh_token_ciphertext: "a" }, { refresh_token_ciphertext: "" }],
    ["app.organization_role_audit", "audit_old_role_value", { old_role: "owner" }, { old_role: "superuser" }],
    ["app.organization_role_audit", "audit_new_role_value", { new_role: "associate" }, { new_role: "superuser" }],
    ["app.organization_enrollment_receipts", "enrollment_role_value", { role: "admin" }, { role: "superuser" }],
    ["app.organization_enrollment_receipts", "enrollment_receipt_shape", { receipt_ref: "manual:approval-123" }, { receipt_ref: "bad receipt" }],
    ["app.mailbox_policy_receipts", "mailbox_receipt_shape", { receipt_ref: "manual:approval-123" }, { receipt_ref: "bad receipt" }]
  ].freeze

  def setup
    @db = PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
    identity = @db.exec("SELECT session_user, current_database()").first
    assert_equal "supabase_admin", identity.fetch("session_user")
    assert_equal ENV.fetch("BE02_TASK_DATABASE_NAME"), identity.fetch("current_database")
    @db.exec("BEGIN")
  end

  def teardown
    @db&.exec("ROLLBACK") unless @db&.finished?
    @db&.close
  end

  CASES.each do |table, name, valid, invalid|
    define_method("test_#{name}") do
      assert_equal "t", check_result(table, name, valid), "valid #{name}"
      assert_equal "f", check_result(table, name, invalid), "invalid #{name}"
    end
  end

  def test_unknown_delivery_kind_cannot_pass_null_case_result
    assert_equal "f", check_result("app_send_private.resend_delivery", "resend_delivery_severity", kind: "email.unknown", severity: 1)
  end

  def test_domain_label_length_and_hyphen_boundaries
    table, name = "app_send_private.mox_domains", "mox_domain_labels"
    assert_equal "t", check_result(table, name, domain: "#{'a' * 63}.invalid")
    ["#{'a' * 64}.invalid", "-a.invalid", "a-.invalid"].each do |domain|
      assert_equal "f", check_result(table, name, domain: domain)
    end
  end

  def test_scopes_reject_null_members_and_multidimensional_arrays
    table, name = "app_connector_private.grants", "connector_scope_set"
    assert_equal "f", check_result(table, name, scopes: ["read", nil])
    assert_equal "f", check_result(table, name, scopes: [["read"]])
  end

  def test_finite_timestamp_constraints_reject_both_infinities
    constraints = @db.exec(<<~SQL)
      SELECT conrelid::regclass::text AS relation, conname, pg_get_expr(conbin,conrelid) AS expression
      FROM pg_constraint WHERE conname LIKE 'integrity_finite_%'
    SQL
    refute_empty constraints.to_a
    constraints.each do |row|
      column = row.fetch("conname").delete_prefix("integrity_finite_")
      ["infinity", "-infinity"].each do |value|
        assert_equal "f", check_result(row.fetch("relation"), row.fetch("conname"), column => value)
      end
      assert_equal "t", check_result(row.fetch("relation"), row.fetch("conname"), column => "2026-11-01T00:00:00Z")
    end
  end

  def test_webhook_invalid_update_is_rejected_by_table
    id = "msg_#{SecureRandom.hex(12)}"
    @db.exec_params(<<~SQL, [id])
      INSERT INTO app.resend_webhook_events(event_id,body_digest,payload)
      VALUES($1,repeat('a',64),'{"type":"email.sent","data":{"email_id":"id_1"}}')
    SQL
    @db.exec("SAVEPOINT invalid_webhook")
    error = assert_raises(PG::CheckViolation) do
      @db.exec_params("UPDATE app.resend_webhook_events SET attempts=-1 WHERE event_id=$1", [id])
    end
    assert_equal "webhook_attempt_range", error.result.error_field(PG::Result::PG_DIAG_CONSTRAINT_NAME)
    @db.exec("ROLLBACK TO SAVEPOINT invalid_webhook")
    assert_equal "0", @db.exec_params("SELECT attempts FROM app.resend_webhook_events WHERE event_id=$1", [id]).getvalue(0, 0)
  end

  private

  def check_result(table, name, values)
    row = @db.exec_params(<<~SQL, [table, name]).first
      SELECT pg_get_expr(conbin,conrelid) AS expression, convalidated
      FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2 AND contype='c'
    SQL
    refute_nil row, "missing #{table}.#{name}"
    assert_equal "t", row.fetch("convalidated")
    @db.exec_params("SELECT (#{row.fetch('expression')}) FROM jsonb_populate_record(NULL::#{table},$1::jsonb)", [JSON.generate(values)]).getvalue(0, 0)
  end
end
