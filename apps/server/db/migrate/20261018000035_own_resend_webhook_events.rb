# frozen_string_literal: true

class OwnResendWebhookEvents < ActiveRecord::Migration[8.1]
  def up
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute "CREATE INDEX observations_resend_receipt_idx ON app_send_private.observations(receipt_ref) WHERE source='resend_v1' AND kind='accepted'"
    execute File.read(Rails.root.join("db/be03_send/resend_webhook_owned_v2.sql"))
    execute "RESET ROLE"
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end

  def down
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute "DROP INDEX app_send_private.observations_resend_receipt_idx"
    execute File.read(Rails.root.join("db/be03_send/resend_webhook_legacy_v1.sql"))
    execute "RESET ROLE"
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end
end
