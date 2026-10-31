# frozen_string_literal: true

require_relative "../schema_integrity/concurrent_indexes"

# AIDEV-NOTE: Existing relations need concurrent builds; each index also supports FK deletion checks.
class IndexSchemaRelationships < ActiveRecord::Migration[8.1]
  include SchemaIntegrityConcurrentIndexes
  disable_ddl_transaction!

  INDEXES = {
    "app.mailbox_memberships" => { "membership_user_lookup" => "user_id,organization_id", "membership_mailbox_fk" => "organization_id,mailbox_id" },
    "app.mailbox_membership_revisions" => { "membership_revision_mailbox_fk" => "organization_id,mailbox_id" },
    "app.mailbox_security" => { "security_mailbox_fk" => "organization_id,mailbox_id", "security_owner_fk" => "organization_id,personal_owner_id" },
    "app.mailbox_grant_ceilings" => { "ceiling_mailbox_fk" => "organization_id,mailbox_id", "ceiling_actor_fk" => "organization_id,user_id" },
    "app.drafts" => { "draft_reply_fk" => "organization_id,mailbox_id,reply_to_thread_id" },
    "app.campaign_consent_events" => { "consent_lead_fk" => "organization_id,campaign_id,lead_id" },
    "app.campaign_accounts" => { "campaign_account_mailbox_fk" => "organization_id,mailbox_id" },
    "app.campaign_sequence_mutations" => { "sequence_mutation_sequence_fk" => "organization_id,campaign_id,sequence_id" },
    "app.campaign_sequence_occurrences" => { "occurrence_sequence_fk" => "organization_id,campaign_id,sequence_id", "occurrence_account_fk" => "organization_id,campaign_id,account_id" },
    "app.inbound_receipts" => { "inbound_account_fk" => "organization_id,mailbox_id,provider_account_id", "inbound_message_fk" => "organization_id,mailbox_id,thread_id,message_id" },
    "app.inbound_imap_receipts" => { "imap_receipt_message_fk" => "organization_id,mailbox_id,thread_id,message_id" },
    "app.resend_inbound_routes" => { "resend_route_mailbox_fk" => "organization_id,mailbox_id" },
    "app.resend_inbound_receipts" => { "resend_receipt_message_fk" => "organization_id,mailbox_id,thread_id,message_id" },
    "app.draft_attachments" => { "attachment_stage_fk" => "organization_id,mailbox_id,draft_id,actor_id,id" },
    "app.marketing_runs" => { "marketing_run_campaign_fk" => "organization_id,campaign_id", "marketing_run_mailbox_fk" => "organization_id,mailbox_id" },
    "app.marketing_enrollments" => { "enrollment_run_fk" => "organization_id,run_id", "enrollment_lead_fk" => "organization_id,lead_id", "enrollment_send_fk" => "send_id" },
    "app.email_finder_jobs" => { "finder_owner_page" => "organization_id,user_id,created_at DESC,id DESC" },
    "app.email_finder_people" => { "finder_domain_patterns" => "organization_id,(split_part(email,'@',2))" },
    "app.inbox_attachments" => { "inbox_attachments_message_page" => "organization_id,mailbox_id,thread_id,message_id,id" },
    "app_connector_private.grants" => { "connector_mailbox_fk" => "organization_id,mailbox_id" },
    "app_send_private.approval_operations" => { "approval_send_fk" => "send_id" },
    "app_send_private.attempts" => { "attempt_smtp_fk" => "smtp_account_id" },
    "app_send_private.reconciliation_checks" => { "reconciliation_send_fk" => "send_id,attempt_id" },
    "app_send_private.attempt_budgets" => { "attempt_budget_limit_fk" => "limit_id", "attempt_budget_route_fk" => "route_id" },
    "app_send_private.resend_events" => { "resend_event_send_fk" => "send_id" }
  }.freeze

  def up
    each_index do |table, name, columns|
      ensure_index(table, name, columns)
    end
    # AIDEV-NOTE: Equal mailbox keys permit a backward scan of the existing unique index for descending IDs.
    execute "SET ROLE elevateo_owner"
    drop_index("app.threads", "threads_mailbox_order")
    drop_index("app.inbox_attachments", "inbox_attachments_message_idx")
  ensure
    execute "RESET ROLE"
  end

  def down
    execute "SET ROLE elevateo_owner"
    ensure_index("app.threads", "threads_mailbox_order", "organization_id,mailbox_id,id DESC")
    ensure_index("app.inbox_attachments", "inbox_attachments_message_idx", "organization_id,mailbox_id,thread_id,message_id")
    each_index { |table, name, _columns| drop_index(table, name) }
  ensure
    execute "RESET ROLE"
  end

  private

  def each_index
    INDEXES.each do |table, indexes|
      role = table.start_with?("app_send_private.") ? "elevateo_send_owner" : "elevateo_owner"
      execute "SET ROLE #{role}"
      indexes.each { |name, columns| yield table, name, columns }
    end
  end
end
