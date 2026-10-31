# frozen_string_literal: true

# AIDEV-NOTE: Suppression identity is lowercase; immutable send snapshot canonicalization retains local-part case.
class CanonicalDeliverySuppressions < ActiveRecord::Migration[8.1]
  REVIEW_OLD = <<~SQL.strip.freeze
    COALESCE((SELECT jsonb_agg(canonical_address ORDER BY canonical_address)
          FROM app_send_private.recipient_suppressions WHERE organization_id = (p_binding->>'organization_id')::uuid
          AND canonical_address IN (SELECT app_send_private.canonical_address(value->>'address')
            FROM jsonb_array_elements(p_binding->'recipients'))),'[]'::jsonb)
  SQL
  REVIEW_NEW = <<~SQL.strip.freeze
    COALESCE((SELECT jsonb_agg(address ORDER BY address) FROM
          (SELECT DISTINCT app_send_private.canonical_address(value->>'address') AS address
           FROM jsonb_array_elements(p_binding->'recipients')) recipients
          WHERE app_send_private.delivery_suppressed((p_binding->>'organization_id')::uuid,address)),'[]'::jsonb)
  SQL
  DISPATCH_OLD = <<~SQL.strip.freeze
    EXISTS (SELECT 1 FROM app_send_private.recipient_suppressions
              WHERE organization_id=i.organization_id AND canonical_address=address)
  SQL
  DISPATCH_NEW = "app_send_private.delivery_suppressed(i.organization_id,address)"

  def up
    execute File.read(File.expand_path("../canonical_delivery_suppressions/up.sql", __dir__))
    patch_functions(false)
  end

  def down
    patch_functions(true)
    execute File.read(File.expand_path("../canonical_delivery_suppressions/down.sql", __dir__))
  end

  private

  def patch_functions(reverse)
    execute "SET LOCAL ROLE elevateo_send_owner"
    changes = {
      "review_policy" => [[REVIEW_OLD, REVIEW_NEW],
        ["lower(cs.email)=lower(campaign_leads.email)", "cs.email=lower(campaign_leads.email)"]],
      "authorize_attempt_legacy_v1" => [[DISPATCH_OLD, DISPATCH_NEW]],
      "final_attempt_check_legacy_v1" => [[DISPATCH_OLD.sub("\n          WHERE", "\n        WHERE"), DISPATCH_NEW]],
      "marketing_dispatch_allowed" => [["app_send_private.canonical_address(s.email)=snap->6->0->>1",
        "s.email=lower(snap->6->0->>1)"]]
    }
    changes.each do |name, replacements|
      definition = select_value("SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app_send_private' AND p.proname=#{connection.quote(name)}")
      replacements.each do |before, after|
        before, after = after, before if reverse
        raise "suppression migration function mismatch: #{name}" unless definition&.include?(before)

        definition = definition.sub(before, after)
      end
      # AIDEV-NOTE: CREATE OR REPLACE preserves function identity, ownership and existing worker ACLs.
      execute definition
    end
    execute "RESET ROLE"
  end
end
