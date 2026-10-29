# frozen_string_literal: true

# AIDEV-NOTE: Durable grants reuse the guarded session transaction; no API role reads private token hashes.
class CreateConnectorGrants < ActiveRecord::Migration[8.1]
  def up
    execute File.read(File.expand_path("connector_grants/up.sql", __dir__))
  end

  def down
    execute "DROP FUNCTION app.connector_grant_authorize(text,text,uuid,text), app.connector_grant_resolve(text), app.connector_grant_revoke(text,uuid), app.connector_grants(), app.connector_grant_issue(text,uuid,text,uuid,text,text[],integer)"
    execute "DROP FUNCTION app_connector_private.presentation(app_connector_private.grants), app_connector_private.visible_mailbox(uuid)"
    execute "DROP TABLE app_connector_private.grants"
  end
end
