# frozen_string_literal: true

class InstallVersionedResendAuthority < ActiveRecord::Migration[8.1]
  def up
    # AIDEV-NOTE: These versioned files are additive migration inputs; historical migrations keep their original SQL.
    execute File.read(Rails.root.join("db/be03_send/scope_resend_v1.sql"))
    execute File.read(Rails.root.join("db/be03_send/budget_authority_resend_v1.sql"))
    sql = File.read(Rails.root.join("db/be03_send/mox_test_receipt_resend_v1.sql"))
    execute sql[sql.index("CREATE OR REPLACE FUNCTION app_send_private.record_observation_v2")..]
  end

  def down
    execute File.read(Rails.root.join("db/be03_send/scope.sql"))
    execute File.read(Rails.root.join("db/be03_send/budget_authority.sql"))
    sql = File.read(Rails.root.join("db/be03_send/mox_test_receipt.sql"))
    execute sql[sql.index("CREATE OR REPLACE FUNCTION app_send_private.record_observation_v2")..]
  end
end
