# frozen_string_literal: true

# AIDEV-NOTE: Validate historical rows explicitly; malformed data aborts migration rather than being discarded.
class EnforceSchemaValues < ActiveRecord::Migration[8.1]
  CHECKS = {
    "app.inbound_imap_accounts" => { "imap_account_uid_range" => "uidvalidity <= 4294967295 AND last_uid <= 4294967295" },
    "app.inbound_imap_receipts" => { "imap_receipt_uid_range" => "uidvalidity <= 4294967295 AND uid <= 4294967295" },
    "app.resend_webhook_events" => {
      "webhook_digest_shape" => "body_digest ~ '^[0-9a-f]{64}$'",
      "webhook_payload_shape" => "jsonb_typeof(payload)='object' AND (payload->>'type' ~ '^email[.][a-z_]{1,40}$') IS TRUE AND (payload#>>'{data,email_id}' ~ '^[A-Za-z0-9_-]{1,128}$') IS TRUE",
      "webhook_lease_state" => "(lease IS NULL)=(lease_until IS NULL) AND (status='pending' OR lease IS NULL) AND (status='pending')=(completed_at IS NULL)",
      "webhook_attempt_range" => "attempts >= 0"
    },
    "app_send_private.resend_events" => { "resend_state_matches_type" => "delivery_state=substring(event_type FROM 7)" },
    "app_send_private.resend_delivery" => {
      "resend_delivery_severity" => "severity=CASE kind WHEN 'email.sent' THEN 1 WHEN 'email.delivery_delayed' THEN 2 WHEN 'email.delivered' THEN 3 WHEN 'email.failed' THEN 4 WHEN 'email.bounced' THEN 5 WHEN 'email.suppressed' THEN 6 WHEN 'email.complained' THEN 7 ELSE 0 END AND severity BETWEEN 1 AND 7"
    },
    "app_send_private.resend_acceptance" => { "resend_acceptance_receipt_shape" => "receipt_ref ~ '^resend:[A-Za-z0-9_-]{1,128}$'" },
    "app_send_private.attempts" => {
      "attempt_sender_shape" => "smtp_sender IS NULL OR (octet_length(smtp_sender) BETWEEN 1 AND 254 AND app_send_private.canonical_address(smtp_sender) IS NOT NULL AND smtp_sender=app_send_private.canonical_address(smtp_sender))"
    },
    "app_send_private.mox_domains" => {
      "mox_domain_labels" => "domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$' AND octet_length(domain)<=253",
      "mox_evidence_shape" => "evidence_ref IS NULL OR evidence_ref ~ '^[0-9a-f]{64}$'"
    },
    "app_connector_private.grants" => {
      "connector_scope_set" => "CASE WHEN array_ndims(scopes)=1 THEN array_position(scopes,NULL) IS NULL AND cardinality(scopes)=(CASE WHEN 'search'=ANY(scopes) THEN 1 ELSE 0 END + CASE WHEN 'read'=ANY(scopes) THEN 1 ELSE 0 END + CASE WHEN 'draft'=ANY(scopes) THEN 1 ELSE 0 END) ELSE false END"
    },
    "app_auth.revocation_intents" => {
      "revocation_generation_range" => "credential_generation >= 0",
      "revocation_claim_pair" => "(claim_id IS NULL)=(claim_deadline IS NULL) AND (state<>'claimed' OR claim_id IS NOT NULL)"
    },
    "app_auth.pending_entries" => {
      "pending_claim_pair" => "(claim_id IS NULL)=(claim_deadline IS NULL)",
      "pending_access_ciphertext_bound" => "access_token_ciphertext IS NULL OR octet_length(access_token_ciphertext) BETWEEN 1 AND 16384",
      "pending_refresh_ciphertext_bound" => "refresh_token_ciphertext IS NULL OR octet_length(refresh_token_ciphertext) BETWEEN 1 AND 16384"
    },
    "app.organization_role_audit" => {
      "audit_old_role_value" => "old_role IN ('owner','admin','operator','sales_manager','sales','auditor','associate')",
      "audit_new_role_value" => "new_role IN ('owner','admin','operator','sales_manager','sales','auditor','associate')"
    },
    "app.organization_enrollment_receipts" => {
      "enrollment_role_value" => "role IN ('owner','admin','operator','sales_manager','sales','auditor','associate')",
      "enrollment_receipt_shape" => "receipt_ref ~ '^[A-Za-z0-9._:/-]+$'"
    },
    "app.mailbox_policy_receipts" => { "mailbox_receipt_shape" => "receipt_ref ~ '^[A-Za-z0-9._:/-]+$'" }
  }.freeze

  FINITE_TIMES = {
    "app.resend_webhook_events" => %w[lease_until next_attempt_at received_at completed_at],
    "app.inbound_imap_rejections" => %w[recorded_at],
    "app.marketing_runs" => %w[created_at],
    "app_send_private.resend_events" => %w[recorded_at],
    "app_send_private.resend_delivery" => %w[occurred_at],
    "app_send_private.mox_domains" => %w[verified_at],
    "app_connector_private.grants" => %w[created_at],
    "app_auth.sessions" => %w[created_at absolute_expires_at idle_expires_at refresh_claim_deadline revoked_at],
    "app_auth.revocation_intents" => %w[claim_deadline next_attempt_at created_at],
    "app_auth.pending_entries" => %w[expires_at claim_deadline access_expires_at],
    "app_auth.rate_limits" => %w[window_start],
    "app.organization_role_audit" => %w[occurred_at],
    "app.organization_enrollment_receipts" => %w[recorded_at],
    "app.mailbox_policy_receipts" => %w[recorded_at]
  }.freeze

  REFERENCES = {
    "app.inbound_imap_receipts" => ["imap_receipt_account_identity_fk", "organization_id,mailbox_id,account_id", "app.inbound_imap_accounts(organization_id,mailbox_id,id)"],
    "app.inbound_imap_rejections" => ["imap_rejection_account_identity_fk", "organization_id,mailbox_id,account_id", "app.inbound_imap_accounts(organization_id,mailbox_id,id)"],
    "app_send_private.reconciliation_checks" => ["reconciliation_attempt_identity_fk", "send_id,attempt_id", "app_send_private.attempts(send_id,attempt_id)"],
    "app.marketing_enrollments" => ["enrollment_intent_identity_fk", "organization_id,draft_id,send_id", "app_send_private.intents(organization_id,draft_id,send_id)"]
  }.freeze

  def up
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute "GRANT REFERENCES ON app_send_private.intents TO elevateo_owner"
    CHECKS.each { |table, checks| checks.each { |name, expression| add_validated(table, name, "CHECK (#{expression})") } }
    FINITE_TIMES.each { |table, columns| columns.each { |column| add_validated(table, "integrity_finite_#{column}", "CHECK (isfinite(#{column}))") } }
    REFERENCES.each { |table, (name, columns, target)| add_validated(table, name, "FOREIGN KEY (#{columns}) REFERENCES #{target}") }
    add_validated("app.marketing_enrollments", "enrollment_draft_identity_fk", "FOREIGN KEY (organization_id,draft_id) REFERENCES app.drafts(organization_id,id)")
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute "REVOKE REFERENCES ON app_send_private.intents FROM elevateo_owner"
    execute "RESET ROLE"
  end

  def down
    execute "SET LOCAL ROLE elevateo_owner"
    execute "ALTER TABLE app.marketing_enrollments DROP CONSTRAINT enrollment_draft_identity_fk"
    REFERENCES.each { |table, (name, _columns, _target)| drop_constraint(table, name) }
    FINITE_TIMES.each { |table, columns| columns.each { |column| drop_constraint(table, "integrity_finite_#{column}") } }
    CHECKS.each { |table, checks| checks.each_key { |name| drop_constraint(table, name) } }
  end

  private

  def assume_owner(table)
    role = if table.start_with?("app_send_private.")
      "elevateo_send_owner"
    elsif table.start_with?("app_auth.")
      "elevateo_session_owner"
    else
      "elevateo_owner"
    end
    execute "SET LOCAL ROLE #{role}"
  end

  def drop_constraint(table, name)
    assume_owner(table)
    execute "ALTER TABLE #{table} DROP CONSTRAINT #{name}"
  end

  def add_validated(table, name, definition)
    assume_owner(table)
    execute "ALTER TABLE #{table} ADD CONSTRAINT #{name} #{definition} NOT VALID"
    execute "ALTER TABLE #{table} VALIDATE CONSTRAINT #{name}"
  end
end
