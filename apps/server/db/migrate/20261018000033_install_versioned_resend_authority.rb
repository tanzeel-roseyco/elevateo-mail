# frozen_string_literal: true

class InstallVersionedResendAuthority < ActiveRecord::Migration[8.1]
  def up
    # AIDEV-NOTE: These versioned files are additive migration inputs; historical migrations keep their original SQL.
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    execute <<~SQL
      SET LOCAL ROLE elevateo_send_owner;
      ALTER TABLE app_send_private.attempts DROP CONSTRAINT send_attempt_profile_v3;
      ALTER TABLE app_send_private.attempts ADD CONSTRAINT send_attempt_profile_v4
        CHECK (profile IN ('none','synthetic-v1','mailpit-smtp-test-v1','mox-smtp-test-v1','resend-v1'));
      ALTER TABLE app_send_private.observations DROP CONSTRAINT send_observation_source_v3;
      ALTER TABLE app_send_private.observations DROP CONSTRAINT send_observation_receipt_source_v3;
      ALTER TABLE app_send_private.observations ADD CONSTRAINT send_observation_source_v4
        CHECK (source IN ('local_failure_driver','mailpit_smtp_test_v1','mox_smtp_test_v1','resend_v1'));
      ALTER TABLE app_send_private.observations ADD CONSTRAINT send_observation_receipt_source_v4 CHECK
        ((source='local_failure_driver' AND (receipt_ref IS NULL OR receipt_ref ~ '^local:[0-9a-f]{64}$'))
        OR (source='mailpit_smtp_test_v1' AND (receipt_ref IS NULL OR receipt_ref ~ '^mailpit-test-v1:[0-9a-f]{64}$'))
        OR (source='mox_smtp_test_v1' AND (receipt_ref IS NULL OR receipt_ref ~ '^mox-test-v1:[0-9a-f]{64}$'))
        OR (source='resend_v1' AND (receipt_ref IS NULL OR receipt_ref ~ '^resend:[A-Za-z0-9_-]{1,128}$')));
    SQL
    execute File.read(Rails.root.join("db/be03_send/scope_resend_v1.sql"))
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute File.read(Rails.root.join("db/be03_send/budget_authority_resend_v1.sql"))
    execute "SET LOCAL ROLE elevateo_send_owner"
    sql = File.read(Rails.root.join("db/be03_send/mox_test_receipt_resend_v1.sql"))
    execute sql[sql.index("CREATE OR REPLACE FUNCTION app_send_private.record_observation_v2")..]
    execute "RESET ROLE"
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end

  def down
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute File.read(Rails.root.join("db/be03_send/scope.sql")).gsub("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute File.read(Rails.root.join("db/be03_send/budget_authority.sql"))
    execute "SET LOCAL ROLE elevateo_send_owner"
    sql = File.read(Rails.root.join("db/be03_send/mox_test_receipt.sql"))
    execute sql[sql.index("CREATE OR REPLACE FUNCTION app_send_private.record_observation_v2")..]
    execute <<~SQL
      SET LOCAL ROLE elevateo_send_owner;
      ALTER TABLE app_send_private.attempts DROP CONSTRAINT send_attempt_profile_v4;
      ALTER TABLE app_send_private.attempts ADD CONSTRAINT send_attempt_profile_v3
        CHECK (profile IN ('none','synthetic-v1','mailpit-smtp-test-v1','mox-smtp-test-v1'));
      ALTER TABLE app_send_private.observations DROP CONSTRAINT send_observation_source_v4;
      ALTER TABLE app_send_private.observations DROP CONSTRAINT send_observation_receipt_source_v4;
      ALTER TABLE app_send_private.observations ADD CONSTRAINT send_observation_source_v3
        CHECK (source IN ('local_failure_driver','mailpit_smtp_test_v1','mox_smtp_test_v1'));
      ALTER TABLE app_send_private.observations ADD CONSTRAINT send_observation_receipt_source_v3 CHECK
        ((source='local_failure_driver' AND (receipt_ref IS NULL OR receipt_ref ~ '^local:[0-9a-f]{64}$'))
        OR (source='mailpit_smtp_test_v1' AND (receipt_ref IS NULL OR receipt_ref ~ '^mailpit-test-v1:[0-9a-f]{64}$'))
        OR (source='mox_smtp_test_v1' AND (receipt_ref IS NULL OR receipt_ref ~ '^mox-test-v1:[0-9a-f]{64}$')));
      RESET ROLE;
    SQL
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end
end
