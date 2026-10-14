# frozen_string_literal: true

# AIDEV-NOTE: Separate bridge preserves Rowan's reviewed authority functions and grant boundary.
class AddSendWorkerBridge < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path('../be03_send/worker_bridge.sql', __dir__))
  end

  def down
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute <<~SQL
      DROP FUNCTION app_send_private.reconciliation_binding(uuid,uuid,bigint),
        app_send_private.final_submission_check(uuid,uuid,bigint,uuid,uuid),
        app_send_private.authorize_and_read(uuid,uuid,bigint,uuid,uuid,text,integer),
        app_send_private.next_due_send()
    SQL
    execute "SET LOCAL ROLE elevateo_owner"
    execute "DROP FUNCTION app.send_membership_capability(uuid,uuid,uuid)"
  end
end
