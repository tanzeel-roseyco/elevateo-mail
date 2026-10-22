# frozen_string_literal: true

# AIDEV-NOTE: Forward-only source inputs preserve prior migrations; rollback refuses any production binding/history.
class EnableProductionMoxTransport < ActiveRecord::Migration[8.1]
  def up
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    %w[schema authority approval observation reconcile].each do |name|
      execute "SET LOCAL ROLE elevateo_send_owner"
      execute File.read(Rails.root.join("db/be03_send/production_mox/#{name}.sql"))
    end
    execute "RESET ROLE"
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end

  def down
    # AIDEV-NOTE: Migrator intentionally lacks private-table ACLs; inspect each schema under its owning role.
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute "LOCK TABLE app_send_private.mox_domains, app_send_private.attempts, app_send_private.smtp_accounts IN ACCESS EXCLUSIVE MODE"
    production_smtp = select_value("SELECT EXISTS(SELECT 1 FROM app_send_private.mox_domains) OR EXISTS(SELECT 1 FROM app_send_private.attempts WHERE profile='mox-smtp-v1') OR EXISTS(SELECT 1 FROM app_send_private.smtp_accounts WHERE credential_ref LIKE 'secret:%')")
    execute "RESET ROLE"
    execute "LOCK TABLE app.inbound_imap_accounts IN ACCESS EXCLUSIVE MODE"
    if production_smtp || select_value("SELECT EXISTS(SELECT 1 FROM app.inbound_imap_accounts WHERE credential_ref LIKE 'secret:%')")
      raise ActiveRecord::IrreversibleMigration, "production Mox authority exists; retain history and rotate bindings before rollback"
    end
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    %w[marketing_authority_v1 approve_resend_live_v2].each { |name| restore(name) }
    restore("mox_test_receipt_resend_v1", "record_observation_v2")
    restore("worker_resend_live_v2", "reconcile_no_evidence")
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute "DROP FUNCTION app_send_private.mox_dispatch_allowed(app_send_private.intents)"
    execute "DROP TABLE app_send_private.mox_domains"
    execute <<~SQL
      ALTER TABLE app_send_private.smtp_accounts DROP CONSTRAINT smtp_accounts_credential_ref_check;
      ALTER TABLE app_send_private.smtp_accounts ADD CONSTRAINT smtp_accounts_credential_ref_check CHECK(credential_ref ~ '^test:[A-Za-z0-9_.:-]{1,120}$');
      ALTER TABLE app_send_private.attempts DROP CONSTRAINT attempts_smtp_credential_ref_check;
      ALTER TABLE app_send_private.attempts ADD CONSTRAINT attempts_smtp_credential_ref_check CHECK(smtp_credential_ref ~ '^test:[A-Za-z0-9_.:-]{1,120}$');
      ALTER TABLE app_send_private.attempts DROP CONSTRAINT send_attempt_smtp_binding;
      ALTER TABLE app_send_private.attempts ADD CONSTRAINT send_attempt_smtp_binding CHECK(num_nonnulls(smtp_account_id,smtp_credential_version,smtp_credential_ref,smtp_sender)=0 OR (profile='mox-smtp-test-v1' AND num_nonnulls(smtp_account_id,smtp_credential_version,smtp_credential_ref,smtp_sender)=4));
      ALTER TABLE app_send_private.attempts DROP CONSTRAINT send_attempt_profile_v5;
      ALTER TABLE app_send_private.attempts ADD CONSTRAINT send_attempt_profile_v4 CHECK(profile IN ('none','synthetic-v1','mailpit-smtp-test-v1','mox-smtp-test-v1','resend-v1'));
      ALTER TABLE app_send_private.observations DROP CONSTRAINT send_observation_source_v5;
      ALTER TABLE app_send_private.observations DROP CONSTRAINT send_observation_receipt_source_v5;
      ALTER TABLE app_send_private.observations ADD CONSTRAINT send_observation_source_v4 CHECK(source IN ('local_failure_driver','mailpit_smtp_test_v1','mox_smtp_test_v1','resend_v1'));
      ALTER TABLE app_send_private.observations ADD CONSTRAINT send_observation_receipt_source_v4 CHECK(
        (source='local_failure_driver' AND (receipt_ref IS NULL OR receipt_ref ~ '^local:[0-9a-f]{64}$'))
        OR (source='mailpit_smtp_test_v1' AND (receipt_ref IS NULL OR receipt_ref ~ '^mailpit-test-v1:[0-9a-f]{64}$'))
        OR (source='mox_smtp_test_v1' AND (receipt_ref IS NULL OR receipt_ref ~ '^mox-test-v1:[0-9a-f]{64}$'))
        OR (source='resend_v1' AND (receipt_ref IS NULL OR receipt_ref ~ '^resend:[A-Za-z0-9_-]{1,128}$')));
      RESET ROLE;
      ALTER TABLE app.inbound_imap_accounts DROP CONSTRAINT inbound_imap_accounts_credential_ref_check;
      ALTER TABLE app.inbound_imap_accounts ADD CONSTRAINT inbound_imap_accounts_credential_ref_check CHECK(credential_ref ~ '^test:[A-Za-z0-9_.:-]{1,120}$');
    SQL
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end

  private

  def restore(name, function = nil)
    execute "SET LOCAL ROLE elevateo_send_owner"
    sql = File.read(Rails.root.join("db/be03_send/#{name}.sql"))
    sql = sql[/CREATE OR REPLACE FUNCTION app_send_private\.#{function}\(.*?\nEND \$\$;/m] if function
    raise "missing rollback source" unless sql
    execute sql
  end
end
