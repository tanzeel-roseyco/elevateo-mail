# frozen_string_literal: true

require_relative "../schema_integrity/concurrent_indexes"

# AIDEV-NOTE: These unused composite UNIQUEs add no invariant beyond existing id/draft_id uniqueness.
class RemoveRedundantUniqueIndexes < ActiveRecord::Migration[8.1]
  include SchemaIntegrityConcurrentIndexes
  disable_ddl_transaction!

  INDEXES = {
    "app_send_private.intents" => ["intents_organization_id_mailbox_id_draft_id_draft_version_key", "organization_id,mailbox_id,draft_id,draft_version"],
    "app.campaign_sequence_steps" => ["campaign_sequence_steps_organization_id_campaign_id_sequen_key1", "organization_id,campaign_id,sequence_id,id"],
    "app.draft_attachments" => ["draft_attachments_organization_id_mailbox_id_draft_id_id_key", "organization_id,mailbox_id,draft_id,id"]
  }.freeze

  def up
    execute "SET ROLE elevateo_send_owner"
    # AIDEV-NOTE: Preserve the draft FK probe before dropping its larger constraint-backed index.
    ensure_index("app_send_private.intents", "intent_draft_fk", "organization_id,mailbox_id,draft_id")
    each_index do |table, name, _columns|
      execute "ALTER TABLE #{table} DROP CONSTRAINT IF EXISTS #{name}"
    end
  ensure
    execute "RESET ROLE"
  end

  def down
    each_index do |table, name, columns|
      ensure_index(table, name, columns, unique: true)
      unless select_value("SELECT 1 FROM pg_constraint WHERE conrelid=#{connection.quote(table)}::regclass AND conname=#{connection.quote(name)}")
        execute "ALTER TABLE #{table} ADD CONSTRAINT #{name} UNIQUE USING INDEX #{name}"
      end
    end
    execute "SET ROLE elevateo_send_owner"
    drop_index("app_send_private.intents", "intent_draft_fk")
  ensure
    execute "RESET ROLE"
  end

  private

  def each_index
    INDEXES.each do |table, (name, columns)|
      execute "SET ROLE #{table.start_with?('app_send_private.') ? 'elevateo_send_owner' : 'elevateo_owner'}"
      yield table, name, columns
    end
  end
end
