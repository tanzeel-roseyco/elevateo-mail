# frozen_string_literal: true

# Runs as elevateo_migrator with session role elevateo_owner (see ops/db/bootstrap.sql).
class CreateAppFoundation < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      CREATE FUNCTION app.context_uuid(setting text) RETURNS uuid
        LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
      DECLARE raw text := current_setting(setting, true);
      BEGIN
        IF raw IS NULL OR raw = '' THEN RETURN NULL; END IF;
        RETURN raw::uuid; -- malformed values raise invalid_text_representation deliberately
      END $$;

      CREATE TABLE app.organizations (
        id uuid PRIMARY KEY,
        name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200)
      );

      CREATE TABLE app.organization_memberships (
        organization_id uuid NOT NULL REFERENCES app.organizations (id) ON DELETE CASCADE,
        user_id uuid NOT NULL,
        PRIMARY KEY (organization_id, user_id)
      );

      CREATE TABLE app.mailboxes (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL REFERENCES app.organizations (id) ON DELETE CASCADE,
        address text NOT NULL CHECK (address ~ '^[^@\\s]+@[^@\\s]+$'),
        visibility text NOT NULL CHECK (visibility IN ('shared', 'private')),
        storage_object_path text,
        UNIQUE (organization_id, id),
        UNIQUE (organization_id, address)
      );

      CREATE TABLE app.mailbox_memberships (
        organization_id uuid NOT NULL,
        mailbox_id uuid NOT NULL,
        user_id uuid NOT NULL,
        PRIMARY KEY (mailbox_id, user_id),
        FOREIGN KEY (organization_id, mailbox_id) REFERENCES app.mailboxes (organization_id, id) ON DELETE CASCADE,
        FOREIGN KEY (organization_id, user_id) REFERENCES app.organization_memberships (organization_id, user_id) ON DELETE CASCADE
      );
    SQL

    %w[organizations organization_memberships mailboxes mailbox_memberships].each do |table|
      execute "ALTER TABLE app.#{table} ENABLE ROW LEVEL SECURITY"
      execute "ALTER TABLE app.#{table} FORCE ROW LEVEL SECURITY"
    end

    execute <<~SQL
      CREATE POLICY own_org_membership ON app.organization_memberships FOR SELECT TO elevateo_app_read
        USING (user_id = app.context_uuid('app.user_id') AND organization_id = app.context_uuid('app.org_id'));

      CREATE POLICY member_organization ON app.organizations FOR SELECT TO elevateo_app_read
        USING (id = app.context_uuid('app.org_id') AND EXISTS (
          SELECT 1 FROM app.organization_memberships m
           WHERE m.organization_id = organizations.id AND m.user_id = app.context_uuid('app.user_id')));

      CREATE POLICY own_mailbox_membership ON app.mailbox_memberships FOR SELECT TO elevateo_app_read
        USING (user_id = app.context_uuid('app.user_id') AND organization_id = app.context_uuid('app.org_id'));

      CREATE POLICY visible_mailbox ON app.mailboxes FOR SELECT TO elevateo_app_read
        USING (organization_id = app.context_uuid('app.org_id')
          AND EXISTS (SELECT 1 FROM app.organization_memberships m
                       WHERE m.organization_id = mailboxes.organization_id AND m.user_id = app.context_uuid('app.user_id'))
          AND (visibility = 'shared' OR EXISTS (
                SELECT 1 FROM app.mailbox_memberships mm
                 WHERE mm.mailbox_id = mailboxes.id AND mm.organization_id = mailboxes.organization_id
                   AND mm.user_id = app.context_uuid('app.user_id'))));

      REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
      REVOKE ALL ON FUNCTION app.context_uuid(text) FROM PUBLIC;
      GRANT USAGE ON SCHEMA app TO elevateo_app_read;
      GRANT EXECUTE ON FUNCTION app.context_uuid(text) TO elevateo_app_read;
      GRANT SELECT ON app.organizations, app.organization_memberships, app.mailboxes, app.mailbox_memberships
        TO elevateo_app_read;
    SQL
  end

  def down
    execute "DROP TABLE app.mailbox_memberships, app.mailboxes, app.organization_memberships, app.organizations"
    execute "DROP FUNCTION app.context_uuid(text)"
  end
end
