# frozen_string_literal: true

require_relative "../schema_integrity/concurrent_indexes"

# AIDEV-NOTE: Composite references preserve tenant/account identity; build their indexes without blocking writes.
class IndexIntegrityReferences < ActiveRecord::Migration[8.1]
  include SchemaIntegrityConcurrentIndexes

  disable_ddl_transaction!

  INDEXES = {
    "app.inbound_imap_accounts" => ["imap_account_identity", "organization_id,mailbox_id,id", true],
    "app.inbound_imap_receipts" => ["imap_receipt_account_identity", "organization_id,mailbox_id,account_id", false],
    "app.inbound_imap_rejections" => ["imap_rejection_account_identity", "organization_id,mailbox_id,account_id", false],
    "app.drafts" => ["draft_organization_identity", "organization_id,id", true],
    "app.marketing_enrollments" => ["enrollment_draft_identity", "organization_id,draft_id,send_id", false],
    "app_send_private.intents" => ["intent_enrollment_identity", "organization_id,draft_id,send_id", true],
    "app_send_private.attempts" => ["attempt_send_identity", "send_id,attempt_id", true]
  }.freeze

  def up
    each_index do |table, name, columns, unique|
      ensure_index(table, name, columns, unique: unique)
    end
    execute "SET ROLE elevateo_send_owner"
    execute "ALTER TABLE app_send_private.resend_events DROP CONSTRAINT IF EXISTS resend_events_event_id_event_type_provider_id_key"
  ensure
    execute "RESET ROLE"
  end

  def down
    execute "SET ROLE elevateo_send_owner"
    ensure_index("app_send_private.resend_events", "resend_events_event_id_event_type_provider_id_key", "event_id,event_type,provider_id", unique: true)
    unless select_value("SELECT 1 FROM pg_constraint WHERE conrelid='app_send_private.resend_events'::regclass AND conname='resend_events_event_id_event_type_provider_id_key'")
      execute "ALTER TABLE app_send_private.resend_events ADD CONSTRAINT resend_events_event_id_event_type_provider_id_key UNIQUE USING INDEX resend_events_event_id_event_type_provider_id_key"
    end
    each_index { |table, name, _columns, _unique| drop_index(table, name) }
  ensure
    execute "RESET ROLE"
  end

  private

  def each_index
    INDEXES.each do |table, (name, columns, unique)|
      execute "SET ROLE #{table.start_with?('app_send_private.') ? 'elevateo_send_owner' : 'elevateo_owner'}"
      yield table, name, columns, unique
    end
  end
end
