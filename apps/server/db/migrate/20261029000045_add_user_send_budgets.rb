# frozen_string_literal: true

# AIDEV-NOTE: User quotas join existing sorted locks and all-or-nothing recipient reservations for every real transport.
class AddUserSendBudgets < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path("user_send_budget/up.sql", __dir__))
    # AIDEV-NOTE: Restore migration authority before Rails writes app_meta.schema_migrations.
    execute "RESET ROLE"
  end

  def down
    # AIDEV-NOTE: Never erase quota history to roll back; an operator must explicitly migrate any retained user limits.
    execute <<~SQL
      SET LOCAL ROLE elevateo_send_owner;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM app_send_private.budget_limits WHERE kind='user') THEN
          RAISE EXCEPTION 'user quota configuration prevents rollback' USING ERRCODE='55000';
        END IF;
      END $$;
      DROP FUNCTION app_send_private.budget_requirements(uuid);
      ALTER FUNCTION app_send_private.route_budget_requirements(uuid) RENAME TO budget_requirements;
    SQL
    original = File.read(File.expand_path("../be03_send/budget_schema.sql", __dir__))
    execute original.split("CREATE TABLE", 2).first.sub("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
    execute "RESET ROLE"
  end
end
