# frozen_string_literal: true

# AIDEV-NOTE: FOR UPDATE needs SELECT and UPDATE RLS policies; only trusted migrator enrollment sees these rows.
class AllowVerifiedEnrollmentLock < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      CREATE POLICY verified_enrollment_read ON app.organizations FOR SELECT TO elevateo_owner
        USING (session_user = 'elevateo_migrator');
      CREATE POLICY verified_enrollment_lock ON app.organizations FOR UPDATE TO elevateo_owner
        USING (session_user = 'elevateo_migrator') WITH CHECK (session_user = 'elevateo_migrator');
    SQL
  end

  def down
    execute "DROP POLICY verified_enrollment_lock ON app.organizations"
    execute "DROP POLICY verified_enrollment_read ON app.organizations"
  end
end
