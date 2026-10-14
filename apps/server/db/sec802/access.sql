-- AIDEV-NOTE: Role rows never confer mailbox content access; owner enrollment is a separate trusted operation.
SET LOCAL ROLE elevateo_owner;
CREATE TABLE app.organization_access (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'operator', 'sales_manager', 'sales', 'associate')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 2147483647),
  PRIMARY KEY (organization_id, user_id),
  FOREIGN KEY (organization_id, user_id) REFERENCES app.organization_memberships (organization_id, user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX organization_single_owner ON app.organization_access (organization_id) WHERE role = 'owner';
ALTER TABLE app.organization_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.organization_access FORCE ROW LEVEL SECURITY;
CREATE POLICY access_owner_routine ON app.organization_access TO elevateo_owner USING (true) WITH CHECK (true);
REVOKE ALL ON app.organization_access FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
-- AIDEV-NOTE: A sole owner cannot disappear through membership cascade or direct owner-role mutation.
CREATE FUNCTION app.prevent_owner_loss() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.role = 'owner' AND (TG_OP = 'DELETE' OR NEW.role <> 'owner'
    OR NEW.organization_id <> OLD.organization_id OR NEW.user_id <> OLD.user_id) THEN
    RAISE EXCEPTION 'owner transfer required' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER guard_owner_loss BEFORE UPDATE OR DELETE ON app.organization_access
  FOR EACH ROW EXECUTE FUNCTION app.prevent_owner_loss();
REVOKE ALL ON FUNCTION app.prevent_owner_loss() FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
CREATE TRIGGER session_access_generation AFTER INSERT OR UPDATE OR DELETE ON app.organization_access
  FOR EACH ROW EXECUTE FUNCTION app_auth.bump_authorization_generation();

CREATE TABLE app.mailbox_security (
  mailbox_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  classification text NOT NULL CHECK (classification IN ('personal', 'team')),
  personal_owner_id uuid,
  CHECK ((classification = 'personal') = (personal_owner_id IS NOT NULL)),
  FOREIGN KEY (organization_id, mailbox_id) REFERENCES app.mailboxes (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, personal_owner_id)
    REFERENCES app.organization_memberships (organization_id, user_id)
);
ALTER TABLE app.mailbox_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mailbox_security FORCE ROW LEVEL SECURITY;
CREATE POLICY mailbox_security_owner_routine ON app.mailbox_security TO elevateo_owner USING (true) WITH CHECK (true);
REVOKE ALL ON app.mailbox_security FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
-- Existing mailboxes deliberately remain unclassified until their owner and consent are verified.

-- AIDEV-NOTE: No owner is guessed from historical membership; enrollment must verify Allan's UUID separately.
CREATE FUNCTION app.change_organization_role(p_digest text, p_target uuid, p_expected integer, p_role text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE proof jsonb; org uuid; actor uuid; actor_role text; old_role text; current_revision integer;
BEGIN
  IF p_target IS NULL OR p_expected IS NULL OR p_expected < 0
    OR p_role IS NULL OR p_role NOT IN ('admin', 'operator', 'sales_manager', 'sales', 'associate') THEN
    RAISE EXCEPTION 'invalid role arguments' USING ERRCODE = '22023';
  END IF;
  proof := app_auth.assert_protected_write(p_digest, p_target);
  IF proof->>'status' <> 'ok' THEN RETURN proof; END IF;
  org := (proof->>'organization_id')::uuid;
  actor := (proof->>'user_id')::uuid;
  -- Organization row serializes competing role changes, including authority revocation.
  PERFORM 1 FROM app.organizations WHERE id = org FOR UPDATE;
  SELECT role INTO actor_role FROM app.organization_access
    WHERE organization_id = org AND user_id = actor;
  SELECT role, revision INTO old_role, current_revision FROM app.organization_access
    WHERE organization_id = org AND user_id = p_target FOR UPDATE;
  IF actor_role IS NULL OR old_role IS NULL OR NOT EXISTS (
    SELECT 1 FROM app.organization_memberships WHERE organization_id = org AND user_id = p_target
  ) THEN RETURN '{"status":"not_found"}'::jsonb; END IF;
  IF actor = p_target OR old_role = 'owner' OR
    (actor_role <> 'owner' AND NOT (actor_role = 'admin' AND old_role NOT IN ('admin', 'owner')
      AND p_role NOT IN ('admin', 'owner'))) THEN
    RETURN '{"status":"not_found"}'::jsonb;
  END IF;
  IF current_revision <> p_expected THEN RETURN '{"status":"role_conflict"}'::jsonb; END IF;
  IF old_role <> p_role THEN
    IF current_revision = 2147483647 THEN RETURN '{"status":"temporarily_unavailable"}'::jsonb; END IF;
    UPDATE app.organization_access SET role = p_role, revision = revision + 1
      WHERE organization_id = org AND user_id = p_target;
    current_revision := current_revision + 1;
  END IF;
  proof := app_auth.assert_protected_write(p_digest, p_target);
  IF proof->>'status' <> 'ok' THEN RETURN proof; END IF;
  RETURN jsonb_build_object('status', 'ok', 'metadata', proof, 'revision', current_revision, 'role', p_role);
END $$;
REVOKE ALL ON FUNCTION app.change_organization_role(text,uuid,integer,text)
  FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
GRANT EXECUTE ON FUNCTION app.change_organization_role(text,uuid,integer,text) TO elevateo_api;
