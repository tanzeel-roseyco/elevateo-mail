# frozen_string_literal: true

# AIDEV-NOTE: API owns reservations; only the restricted gateway receives object-storage credentials.
class AddDraftAttachmentGateway < ActiveRecord::Migration[8.1]
  def up
    execute "SET LOCAL ROLE elevateo_owner"
    %w[gateway remove read_recoverable].each do |name|
      execute File.read(File.expand_path("../draft_attachments/#{name}.sql", __dir__))
    end
    execute "RESET ROLE"
  end

  def down
    execute "SET LOCAL ROLE elevateo_owner"
    execute "DROP FUNCTION app_attachment_gateway.draft_binding(text,uuid,uuid,uuid,bigint,uuid,uuid,uuid,uuid,uuid)"
    execute "DROP FUNCTION app.remove_draft_attachment(text,uuid,uuid,uuid)"
    execute File.read(File.expand_path("../draft_attachments/read.sql", __dir__)).sub("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
    execute "RESET ROLE"
  end
end
