# frozen_string_literal: true
# AIDEV-NOTE: Extend newest consent/live authority without replacing delivery or legacy simulation behavior.
class BindResendAttachmentsV3 < ActiveRecord::Migration[8.1]
  def up
    execute "RESET ROLE"
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    execute File.read(File.expand_path("../be03_send/resend_attachments_v3.sql", __dir__))
    execute "RESET ROLE"
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end

  def down
    execute "RESET ROLE"
    execute "GRANT CREATE ON SCHEMA app TO elevateo_send_owner"
    execute File.read(File.expand_path("../be03_send/resend_attachments_v3_down.sql", __dir__))
    execute "RESET ROLE"
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end
end
