# frozen_string_literal: true

# AIDEV-NOTE: Preference identity comes from a protected session; this table never grants a mailbox capability.
class CreateUserDisplayPreferences < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      SET LOCAL ROLE elevateo_owner;
      CREATE TABLE app.user_display_preferences (
        organization_id uuid NOT NULL,
        user_id uuid NOT NULL,
        display_name text,
        revision integer NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 2147483647),
        PRIMARY KEY (organization_id, user_id),
        FOREIGN KEY (organization_id, user_id)
          REFERENCES app.organization_memberships (organization_id, user_id) ON DELETE CASCADE,
        CHECK (display_name IS NULL OR
          (char_length(display_name) BETWEEN 1 AND 256 AND display_name !~ '[[:cntrl:]]'
            AND btrim(display_name) <> ''))
      );
      ALTER TABLE app.user_display_preferences ENABLE ROW LEVEL SECURITY;
      ALTER TABLE app.user_display_preferences FORCE ROW LEVEL SECURITY;
      CREATE POLICY preference_owner_routine ON app.user_display_preferences TO elevateo_owner
        USING (true) WITH CHECK (true);
      REVOKE ALL ON app.user_display_preferences FROM PUBLIC, elevateo_api, elevateo_worker, elevateo_app_read;

      -- AIDEV-NOTE: A digest proof and matching transaction-local claims are both required for every read.
      CREATE FUNCTION app.read_user_display_preference(p_digest text)
      RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE proof jsonb; org uuid; actor uuid; name text; rev integer;
      BEGIN
        proof := app_auth.resolve_session(p_digest);
        IF proof->>'status' <> 'ok' THEN RETURN jsonb_build_object('status', proof->>'status'); END IF;
        org := (proof->>'organization_id')::uuid;
        actor := (proof->>'user_id')::uuid;
        IF org IS NULL OR actor IS NULL
          OR app.context_uuid('app.org_id') IS DISTINCT FROM org
          OR app.context_uuid('app.user_id') IS DISTINCT FROM actor
          OR NOT EXISTS (SELECT 1 FROM app.organization_memberships
            WHERE organization_id = org AND user_id = actor) THEN
          RETURN '{"status":"not_found"}'::jsonb;
        END IF;
        SELECT display_name, revision INTO name, rev FROM app.user_display_preferences
          WHERE organization_id = org AND user_id = actor;
        RETURN jsonb_build_object('status', 'ok', 'display_name', name, 'revision', COALESCE(rev, 0));
      END $$;
      REVOKE ALL ON FUNCTION app.read_user_display_preference(text)
        FROM PUBLIC, elevateo_api, elevateo_worker, elevateo_app_read;
      GRANT EXECUTE ON FUNCTION app.read_user_display_preference(text) TO elevateo_api;

      -- AIDEV-NOTE: The organization row serializes first writes without trusting a caller-supplied user ID.
      CREATE FUNCTION app.write_user_display_preference(p_digest text, p_expected integer, p_name text)
      RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE proof jsonb; org uuid; actor uuid; current_revision integer; new_revision integer;
      BEGIN
        IF p_expected IS NULL OR p_expected NOT BETWEEN 0 AND 2147483646
          OR (p_name IS NOT NULL AND (char_length(p_name) NOT BETWEEN 1 AND 256
            OR p_name ~ '[[:cntrl:]]' OR btrim(p_name) = '')) THEN
          RAISE EXCEPTION 'invalid preference input' USING ERRCODE = '22023';
        END IF;
        proof := app_auth.assert_protected_write(p_digest, app.context_uuid('app.user_id'));
        IF proof->>'status' <> 'ok' THEN RETURN proof; END IF;
        org := (proof->>'organization_id')::uuid;
        actor := (proof->>'user_id')::uuid;
        IF org IS NULL OR actor IS NULL
          OR app.context_uuid('app.org_id') IS DISTINCT FROM org
          OR app.context_uuid('app.user_id') IS DISTINCT FROM actor THEN
          RETURN '{"status":"not_found"}'::jsonb;
        END IF;
        PERFORM 1 FROM app.organizations WHERE id = org FOR UPDATE;
        PERFORM 1 FROM app.organization_memberships
          WHERE organization_id = org AND user_id = actor FOR KEY SHARE;
        IF NOT FOUND THEN RETURN '{"status":"not_found"}'::jsonb; END IF;
        SELECT revision INTO current_revision FROM app.user_display_preferences
          WHERE organization_id = org AND user_id = actor FOR UPDATE;
        IF COALESCE(current_revision, 0) <> p_expected THEN
          RETURN '{"status":"preference_conflict"}'::jsonb;
        END IF;
        new_revision := p_expected + 1;
        INSERT INTO app.user_display_preferences(organization_id, user_id, display_name, revision)
          VALUES (org, actor, p_name, new_revision)
          ON CONFLICT (organization_id, user_id) DO UPDATE
          SET display_name = EXCLUDED.display_name, revision = EXCLUDED.revision;
        proof := app_auth.assert_protected_write(p_digest, actor);
        IF proof->>'status' <> 'ok' THEN RETURN proof; END IF;
        RETURN jsonb_build_object('status', 'ok', 'metadata', proof,
          'display_name', p_name, 'revision', new_revision);
      END $$;
      REVOKE ALL ON FUNCTION app.write_user_display_preference(text,integer,text)
        FROM PUBLIC, elevateo_api, elevateo_worker, elevateo_app_read;
      GRANT EXECUTE ON FUNCTION app.write_user_display_preference(text,integer,text) TO elevateo_api;
    SQL
  end

  def down
    execute <<~SQL
      SET LOCAL ROLE elevateo_owner;
      DROP FUNCTION app.write_user_display_preference(text,integer,text);
      DROP FUNCTION app.read_user_display_preference(text);
      DROP TABLE app.user_display_preferences;
    SQL
  end
end
