# frozen_string_literal: true

class EnableLiveResendLedger < ActiveRecord::Migration[8.1]
  FILES = %w[scope_resend_live_v2.sql approve_resend_live_v2.sql mailbox_rotation_resend_live_v2.sql
             worker_resend_live_v2.sql status_resend_live_v2.sql cancel_resend_live_v2.sql].freeze

  def up
    # AIDEV-NOTE: New migration-owned definitions avoid changing SQL read by any historical migration.
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute "ALTER TABLE app_send_private.intents DROP CONSTRAINT intents_simulated_check"
    execute "ALTER TABLE app_send_private.intents ADD CONSTRAINT intents_simulated_mode_check CHECK (simulated IN (true,false))"
    FILES.each do |name|
      execute "SET LOCAL ROLE elevateo_send_owner"
      execute File.read(Rails.root.join("db/be03_send", name))
    end
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute "ALTER FUNCTION app_send_private.authorize_attempt(uuid,uuid,bigint,uuid,uuid,bytea,text,integer) RENAME TO authorize_attempt_legacy_v1"
    execute "ALTER FUNCTION app_send_private.final_attempt_check(uuid,uuid,bigint,uuid,uuid) RENAME TO final_attempt_check_legacy_v1"
    execute File.read(Rails.root.join("db/be03_send/resend_authority_guard_v2.sql"))
    execute "REVOKE ALL ON FUNCTION app.approve_draft_send(text,uuid,uuid,uuid,integer,text,bytea,uuid,text) FROM PUBLIC,elevateo_worker,elevateo_app_read"
    execute "GRANT EXECUTE ON FUNCTION app.approve_draft_send(text,uuid,uuid,uuid,integer,text,bytea,uuid,text) TO elevateo_api"
    execute "RESET ROLE"
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end

  def down
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute "DROP FUNCTION app_send_private.authorize_attempt(uuid,uuid,bigint,uuid,uuid,bytea,text,integer)"
    execute "DROP FUNCTION app_send_private.final_attempt_check(uuid,uuid,bigint,uuid,uuid)"
    execute "ALTER FUNCTION app_send_private.authorize_attempt_legacy_v1(uuid,uuid,bigint,uuid,uuid,bytea,text,integer) RENAME TO authorize_attempt"
    execute "ALTER FUNCTION app_send_private.final_attempt_check_legacy_v1(uuid,uuid,bigint,uuid,uuid) RENAME TO final_attempt_check"
    execute "DROP FUNCTION app.approve_draft_send(text,uuid,uuid,uuid,integer,text,bytea,uuid,text)"
    execute File.read(Rails.root.join("db/be03_send/scope_resend_live_v2_down.sql"))
    execute File.read(Rails.root.join("db/be03_send/status.sql")).sub("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
    execute File.read(Rails.root.join("db/be03_send/cancel.sql")).sub("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
    execute "ALTER TABLE app_send_private.intents DROP CONSTRAINT intents_simulated_mode_check"
    execute "ALTER TABLE app_send_private.intents ADD CONSTRAINT intents_simulated_check CHECK (simulated)"
    execute "RESET ROLE"
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end
end
