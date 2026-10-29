# frozen_string_literal: true

# AIDEV-NOTE: Reply authority is mailbox-scoped metadata; existing receipt and lease fences remain authoritative.
class PreserveMailReplyIdentity < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path("mail_reply_identity/up.sql", __dir__))
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute File.read(File.expand_path("mail_reply_identity/snapshot.sql", __dir__))
    approval = File.read(File.expand_path("../be03_send/production_mox/approval.sql", __dir__))
    before = "IF p_outbound_mode='mox' AND jsonb_array_length(convert_from(p_snapshot_bytes,'UTF8')::jsonb->12)<>0 THEN"
    after = "IF p_outbound_mode='mox' AND (jsonb_array_length(convert_from(p_snapshot_bytes,'UTF8')::jsonb->12)<>0 OR (binding->>'reply_to_thread_id' IS NOT NULL AND convert_from(p_snapshot_bytes,'UTF8')::jsonb->>0<>'elevateo.send.snapshot.v3')) THEN"
    raise "production approval source changed" unless approval.scan(before).length == 1
    # AIDEV-NOTE: Preserve reviewed replay/lock ordering; add only the Mox wire-identity readiness condition.
    format_before = "p_snapshot_bytes,'elevateo.send.snapshot.v1',p_outbound_mode"
    raise "production snapshot metadata source changed" unless approval.scan(format_before).length == 1
    execute approval.sub(before, after).sub(format_before,
      "p_snapshot_bytes,convert_from(p_snapshot_bytes,'UTF8')::jsonb->>0,p_outbound_mode")
    execute "RESET ROLE"
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end

  def down
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    execute "SET LOCAL ROLE elevateo_send_owner"
    if select_value("SELECT EXISTS(SELECT 1 FROM app_send_private.intents WHERE convert_from(snapshot_bytes,'UTF8')::jsonb->>0='elevateo.send.snapshot.v3')")
      raise ActiveRecord::IrreversibleMigration, "approved reply identities exist; preserve immutable send history"
    end
    execute File.read(File.expand_path("../be03_send/production_mox/approval.sql", __dir__))
    execute File.read(File.expand_path("mail_reply_identity/snapshot_down.sql", __dir__))
    execute "RESET ROLE"
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
    execute File.read(File.expand_path("mail_reply_identity/down.sql", __dir__))
  end
end
