# frozen_string_literal: true

# AIDEV-NOTE: Isolated additive cancellation function leaves the frozen BE03 baseline migration untouched.
class AddSendCancellation < ActiveRecord::Migration[8.1]
  def up
    # AIDEV-NOTE: The owner creates one app facade; transient CREATE is revoked in the same migration transaction.
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute File.read(File.expand_path("../be03_send/cancel.sql", __dir__))
    execute "SET LOCAL ROLE elevateo_owner"
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end

  def down
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute "DROP FUNCTION app.cancel_send(text,uuid,uuid,uuid)"
    execute "SET LOCAL ROLE elevateo_owner"
  end
end
