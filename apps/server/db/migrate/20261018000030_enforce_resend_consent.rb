# frozen_string_literal: true

class EnforceResendConsent < ActiveRecord::Migration[8.1]
  def up
    execute File.read(Rails.root.join("db/be03_send/scope.sql"))
  end

  def down
    execute <<~SQL
      CREATE OR REPLACE FUNCTION app_send_private.review_policy(p_binding jsonb) RETURNS jsonb
      LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
        SELECT p_binding || jsonb_build_object(
          'policy_revision',(SELECT revision::text FROM app_send_private.organization_policy
            WHERE organization_id=(p_binding->>'organization_id')::uuid),
          'mailbox_enabled',COALESCE((SELECT enabled FROM app_send_private.mailbox_policy
            WHERE organization_id=(p_binding->>'organization_id')::uuid
              AND mailbox_id=(p_binding->>'mailbox_id')::uuid),false),
          'suppressed_addresses',COALESCE((SELECT jsonb_agg(canonical_address ORDER BY canonical_address)
            FROM app_send_private.recipient_suppressions WHERE organization_id=(p_binding->>'organization_id')::uuid
              AND canonical_address IN (SELECT app_send_private.canonical_address(value->>'address')
                FROM jsonb_array_elements(p_binding->'recipients'))),'[]'::jsonb))
      $$;
    SQL
  end
end
