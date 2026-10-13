# frozen_string_literal: true

# AIDEV-NOTE: Fixed SQL files keep each security boundary reviewable; no runtime SQL or caller-chosen file paths.
class CreatePrivateSessions < ActiveRecord::Migration[8.1]
  PARTS = %w[tables helpers generations entry read refresh revocation pending rate_limits grants].freeze

  def up
    execute <<~SQL
      -- AIDEV-NOTE: Display metadata follows the product contract; address remains the transport identity.
      ALTER TABLE app.mailboxes
        ADD COLUMN display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 256),
        ADD COLUMN display_address text CHECK (char_length(display_address) <= 256);
      ALTER TABLE app.mailbox_memberships
        ADD COLUMN compose boolean NOT NULL DEFAULT false,
        ADD COLUMN approve_send boolean NOT NULL DEFAULT false,
        ADD COLUMN manage_members boolean NOT NULL DEFAULT false;
      GRANT USAGE ON SCHEMA app TO elevateo_session_owner;
      GRANT SELECT ON app.organization_memberships TO elevateo_session_owner;
      GRANT SELECT (id, name) ON app.organizations TO elevateo_session_owner;
      CREATE POLICY verified_session_membership ON app.organization_memberships
        FOR SELECT TO elevateo_session_owner USING (
          user_id = NULLIF(current_setting('app_auth.verified_user_id', true), '')::uuid);
      CREATE POLICY verified_session_organization ON app.organizations
        FOR SELECT TO elevateo_session_owner USING (EXISTS (
          SELECT 1 FROM app.organization_memberships m WHERE m.organization_id = organizations.id
            AND m.user_id = NULLIF(current_setting('app_auth.verified_user_id', true), '')::uuid));
      SET LOCAL ROLE elevateo_session_owner;
    SQL
    PARTS.each { |part| execute File.read(File.expand_path("../be02/#{part}.sql", __dir__)) }
    execute "SET LOCAL ROLE elevateo_owner"
    execute File.read(File.expand_path("../be02/triggers.sql", __dir__))
  end

  def down
    execute File.read(File.expand_path("../be02/down.sql", __dir__))
  end
end
