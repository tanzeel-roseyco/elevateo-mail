# frozen_string_literal: true

# AIDEV-NOTE: Bootstrap provisions the owner; migration adds only isolated, simulated approval persistence.
class CreateSendIntents < ActiveRecord::Migration[8.1]
  def up
    execute sql("prerequisite")
    execute "GRANT USAGE, CREATE ON SCHEMA app TO elevateo_send_owner"
    execute "GRANT REFERENCES ON app.organizations, app.mailboxes, app.drafts TO elevateo_send_owner"
    execute sql("draft_bridge")
    execute sql("session_bridge")
    execute "SET LOCAL ROLE elevateo_send_owner"
    %w[tables constraints canonical scope approve status grants].each { |part| execute sql(part) }
    execute "SET LOCAL ROLE elevateo_owner"
    execute "REVOKE CREATE ON SCHEMA app FROM elevateo_send_owner"
  end

  def down
    execute sql("prerequisite")
    execute "SET LOCAL ROLE elevateo_send_owner"
    execute sql("down")
    execute "SET LOCAL ROLE elevateo_owner"
  end

  private

  def sql(part)
    File.read(File.expand_path("../be03_send/#{part}.sql", __dir__))
  end
end
