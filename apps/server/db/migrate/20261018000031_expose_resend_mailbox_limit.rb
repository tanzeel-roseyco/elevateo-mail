# frozen_string_literal: true

class ExposeResendMailboxLimit < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      -- AIDEV-NOTE: The worker can validate the pilot ceiling without receiving SELECT on private budget rows.
      CREATE FUNCTION app.resend_mailbox_limit_valid(p_max integer) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
        SELECT p_max BETWEEN 1 AND 1000000 AND NOT EXISTS (
          SELECT 1 FROM app_send_private.budget_limits
          WHERE kind='mailbox' AND enabled AND ceiling>p_max)
      $$;
      REVOKE ALL ON FUNCTION app.resend_mailbox_limit_valid(integer) FROM PUBLIC,elevateo_api,elevateo_app_read;
      GRANT EXECUTE ON FUNCTION app.resend_mailbox_limit_valid(integer) TO elevateo_worker;
    SQL
  end

  def down
    execute "DROP FUNCTION app.resend_mailbox_limit_valid(integer)"
  end
end
