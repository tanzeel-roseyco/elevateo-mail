-- AIDEV-NOTE: Role rows never confer mailbox content access; owner enrollment is a separate trusted operation.
SET LOCAL ROLE elevateo_owner;
CREATE TABLE app.organization_access (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'operator', 'sales_manager', 'sales', 'auditor', 'associate')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 2147483647),
  PRIMARY KEY (organization_id, user_id),
  FOREIGN KEY (organization_id, user_id) REFERENCES app.organization_memberships (organization_id, user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX organization_single_owner ON app.organization_access (organization_id) WHERE role = 'owner';
ALTER TABLE app.organization_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.organization_access FORCE ROW LEVEL SECURITY;
CREATE POLICY access_owner_routine ON app.organization_access TO elevateo_owner USING (true) WITH CHECK (true);
CREATE POLICY access_session_read ON app.organization_access FOR SELECT TO elevateo_session_owner
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
REVOKE ALL ON app.organization_access FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
GRANT SELECT (organization_id, user_id, role, revision) ON app.organization_access TO elevateo_session_owner;
-- AIDEV-NOTE: Metadata-only role history is runtime append-only and never stores mailbox content or addresses.
CREATE TABLE app.organization_role_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  organization_id uuid NOT NULL REFERENCES app.organizations (id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  old_role text NOT NULL,
  new_role text NOT NULL,
  revision integer NOT NULL CHECK (revision BETWEEN 1 AND 2147483647),
  operation text NOT NULL DEFAULT 'replace_organization_grant'
    CHECK (operation = 'replace_organization_grant'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX organization_role_audit_page ON app.organization_role_audit
  (organization_id, event_sequence DESC);
ALTER TABLE app.organization_role_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.organization_role_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_owner_append ON app.organization_role_audit TO elevateo_owner
  USING (true) WITH CHECK (true);
CREATE POLICY audit_session_read ON app.organization_role_audit FOR SELECT TO elevateo_session_owner
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
REVOKE ALL ON app.organization_role_audit FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
GRANT SELECT (id, event_sequence, organization_id, actor_user_id, target_user_id,
  old_role, new_role, revision, operation, occurred_at)
  ON app.organization_role_audit TO elevateo_session_owner;
-- AIDEV-NOTE: A sole owner cannot disappear through membership cascade or direct owner-role mutation.
CREATE FUNCTION app.prevent_owner_loss() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.role = 'owner' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'owner transfer required' USING ERRCODE = '23514';
    END IF;
    IF NEW.role <> 'owner' OR NEW.organization_id <> OLD.organization_id
      OR NEW.user_id <> OLD.user_id THEN
      RAISE EXCEPTION 'owner transfer required' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
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
CREATE FUNCTION app.validate_personal_mailbox_security() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.classification = 'personal' AND NOT EXISTS (
    SELECT 1 FROM app.mailboxes WHERE organization_id = NEW.organization_id
      AND id = NEW.mailbox_id AND visibility = 'private') THEN
    RAISE EXCEPTION 'personal mailbox must be private' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_personal_mailbox_security BEFORE INSERT OR UPDATE ON app.mailbox_security
  FOR EACH ROW EXECUTE FUNCTION app.validate_personal_mailbox_security();
REVOKE ALL ON FUNCTION app.validate_personal_mailbox_security()
  FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
CREATE FUNCTION app.prevent_personal_mailbox_sharing() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.visibility = 'shared' AND OLD.visibility IS DISTINCT FROM NEW.visibility
    AND EXISTS (SELECT 1 FROM app.mailbox_security WHERE mailbox_id = NEW.id AND classification = 'personal') THEN
    RAISE EXCEPTION 'personal mailbox must remain private' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_personal_mailbox_visibility BEFORE UPDATE OF visibility ON app.mailboxes
  FOR EACH ROW EXECUTE FUNCTION app.prevent_personal_mailbox_sharing();
REVOKE ALL ON FUNCTION app.prevent_personal_mailbox_sharing()
  FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
CREATE TABLE app.mailbox_grant_ceilings (
  organization_id uuid NOT NULL,
  mailbox_id uuid NOT NULL,
  user_id uuid NOT NULL,
  compose boolean NOT NULL DEFAULT false,
  approve_send boolean NOT NULL DEFAULT false,
  manage_members boolean NOT NULL DEFAULT false,
  PRIMARY KEY (mailbox_id, user_id),
  FOREIGN KEY (organization_id, mailbox_id) REFERENCES app.mailboxes (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, user_id) REFERENCES app.organization_memberships (organization_id, user_id) ON DELETE CASCADE
);
ALTER TABLE app.mailbox_grant_ceilings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mailbox_grant_ceilings FORCE ROW LEVEL SECURITY;
CREATE POLICY ceiling_owner_routine ON app.mailbox_grant_ceilings TO elevateo_owner USING (true) WITH CHECK (true);
REVOKE ALL ON app.mailbox_grant_ceilings FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
-- Ceiling changes rotate the actor generation; operational provisioning must hold its generation lock first.
CREATE TRIGGER session_ceiling_generation AFTER INSERT OR UPDATE OR DELETE ON app.mailbox_grant_ceilings
  FOR EACH ROW EXECUTE FUNCTION app_auth.bump_authorization_generation();
CREATE TABLE app.mailbox_policy_receipts (
  mailbox_id uuid PRIMARY KEY REFERENCES app.mailbox_security (mailbox_id) ON DELETE CASCADE,
  receipt_ref text NOT NULL CHECK (char_length(receipt_ref) BETWEEN 16 AND 200),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE app.mailbox_policy_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mailbox_policy_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY mailbox_receipt_owner_routine ON app.mailbox_policy_receipts TO elevateo_owner
  USING (true) WITH CHECK (true);
REVOKE ALL ON app.mailbox_policy_receipts FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;

-- AIDEV-NOTE: One verified operator transaction classifies a mailbox and bounds an existing manager's delegation.
CREATE FUNCTION app.provision_verified_mailbox_policy(p_box uuid, p_class text, p_owner uuid,
  p_manager uuid, p_compose boolean, p_approve boolean, p_manage boolean, p_receipt text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE box app.mailboxes; manager app.mailbox_memberships; manager_role text; expected_org uuid;
BEGIN
  IF session_user <> 'elevateo_migrator' OR p_box IS NULL OR p_manager IS NULL
    OR p_class NOT IN ('personal', 'team') OR p_class IS NULL
    OR (p_class = 'personal') IS DISTINCT FROM (p_owner IS NOT NULL)
    OR p_compose IS NULL OR p_approve IS NULL OR p_manage IS NULL
    OR p_receipt IS NULL OR char_length(p_receipt) NOT BETWEEN 16 AND 200
    OR p_receipt !~ '^[A-Za-z0-9._:/-]+$' THEN
    RAISE EXCEPTION 'verified mailbox policy arguments required' USING ERRCODE = '22023';
  END IF;
  SELECT organization_id INTO expected_org FROM app.mailboxes WHERE id = p_box;
  IF expected_org IS NULL THEN
    RAISE EXCEPTION 'verified mailbox required' USING ERRCODE = '23503';
  END IF;
  PERFORM app_auth.lock_authorization_generations(expected_org, p_manager);
  SELECT * INTO box FROM app.mailboxes WHERE id = p_box FOR UPDATE;
  IF box.organization_id IS DISTINCT FROM expected_org THEN
    RAISE EXCEPTION 'mailbox organization changed' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO manager FROM app.mailbox_memberships
    WHERE organization_id = box.organization_id AND mailbox_id = p_box AND user_id = p_manager;
  SELECT role INTO manager_role FROM app.organization_access
    WHERE organization_id = box.organization_id AND user_id = p_manager;
  IF box.id IS NULL OR manager.user_id IS NULL OR NOT manager.manage_members
    OR manager_role NOT IN ('owner', 'admin', 'sales_manager') OR manager_role IS NULL
    OR (p_class = 'personal' AND (box.visibility <> 'private' OR p_owner <> p_manager
      OR NOT p_manage OR EXISTS (SELECT 1 FROM app.mailbox_memberships extra
        WHERE extra.organization_id = box.organization_id AND extra.mailbox_id = p_box
          AND extra.user_id <> p_owner AND extra.manage_members)))
    OR (p_compose AND NOT manager.compose) OR (p_approve AND NOT manager.approve_send)
    OR (p_manage AND NOT manager.manage_members) THEN
    RAISE EXCEPTION 'verified mailbox policy authority required' USING ERRCODE = '23514';
  END IF;
  INSERT INTO app.mailbox_security(mailbox_id, organization_id, classification, personal_owner_id)
    VALUES (p_box, box.organization_id, p_class, p_owner);
  INSERT INTO app.mailbox_grant_ceilings(organization_id, mailbox_id, user_id,
      compose, approve_send, manage_members)
    VALUES (box.organization_id, p_box, p_manager, p_compose, p_approve, p_manage);
  INSERT INTO app.mailbox_policy_receipts(mailbox_id, receipt_ref) VALUES (p_box, p_receipt);
END $$;
REVOKE ALL ON FUNCTION app.provision_verified_mailbox_policy(uuid,text,uuid,uuid,boolean,boolean,boolean,text)
  FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
GRANT EXECUTE ON FUNCTION app.provision_verified_mailbox_policy(uuid,text,uuid,uuid,boolean,boolean,boolean,text)
  TO elevateo_migrator;
-- Existing mailboxes deliberately remain unclassified until their owner and consent are verified.

CREATE TABLE app.organization_enrollment_receipts (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  receipt_ref text NOT NULL CHECK (char_length(receipt_ref) BETWEEN 16 AND 200),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, user_id),
  FOREIGN KEY (organization_id, user_id) REFERENCES app.organization_access (organization_id, user_id) ON DELETE CASCADE
);
ALTER TABLE app.organization_enrollment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.organization_enrollment_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY enrollment_owner_routine ON app.organization_enrollment_receipts TO elevateo_owner
  USING (true) WITH CHECK (true);
REVOKE ALL ON app.organization_enrollment_receipts FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;

-- AIDEV-NOTE: Deployment operator supplies verified UUID mapping and a nonsecret receipt; no runtime can enroll.
CREATE FUNCTION app.enroll_verified_organization_grant(p_org uuid, p_user uuid, p_role text, p_receipt text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE has_owner boolean;
BEGIN
  IF session_user <> 'elevateo_migrator' OR p_org IS NULL OR p_user IS NULL
    OR p_role IS NULL OR p_role NOT IN ('owner', 'admin', 'operator', 'sales_manager', 'sales', 'auditor', 'associate')
    OR p_receipt IS NULL OR char_length(p_receipt) NOT BETWEEN 16 AND 200
    OR p_receipt !~ '^[A-Za-z0-9._:/-]+$' THEN
    RAISE EXCEPTION 'verified enrollment arguments required' USING ERRCODE = '22023';
  END IF;
  PERFORM app_auth.lock_authorization_generations(p_org, p_user);
  PERFORM 1 FROM app.organizations WHERE id = p_org FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM app.organization_memberships
      WHERE organization_id = p_org AND user_id = p_user) THEN
    RAISE EXCEPTION 'verified organization membership required' USING ERRCODE = '23503';
  END IF;
  SELECT EXISTS (SELECT 1 FROM app.organization_access WHERE organization_id = p_org AND role = 'owner')
    INTO has_owner;
  IF (p_role = 'owner') = has_owner THEN
    RAISE EXCEPTION 'owner enrollment order violated' USING ERRCODE = '23514';
  END IF;
  INSERT INTO app.organization_access(organization_id, user_id, role) VALUES (p_org, p_user, p_role);
  INSERT INTO app.organization_enrollment_receipts(organization_id, user_id, role, receipt_ref)
    VALUES (p_org, p_user, p_role, p_receipt);
END $$;
REVOKE ALL ON FUNCTION app.enroll_verified_organization_grant(uuid,uuid,text,text)
  FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
GRANT EXECUTE ON FUNCTION app.enroll_verified_organization_grant(uuid,uuid,text,text) TO elevateo_migrator;
-- AIDEV-NOTE: No owner is guessed from historical membership; enrollment must verify Allan's UUID separately.
CREATE FUNCTION app.change_organization_role(p_digest text, p_target uuid, p_expected integer, p_role text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE proof jsonb; org uuid; actor uuid; actor_role text; old_role text; current_revision integer; box_id uuid;
BEGIN
  IF p_target IS NULL OR p_expected IS NULL OR p_expected < 0
    OR p_role IS NULL OR p_role NOT IN ('admin', 'operator', 'sales_manager', 'sales', 'auditor', 'associate') THEN
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
  -- AIDEV-NOTE: Rank removal and membership removal serialize on every affected mailbox revision.
  IF old_role IN ('owner', 'admin', 'sales_manager')
    AND p_role NOT IN ('owner', 'admin', 'sales_manager') THEN
    FOR box_id IN SELECT m.mailbox_id FROM app.mailbox_memberships m
      WHERE m.organization_id = org AND m.user_id = p_target AND m.manage_members
      ORDER BY m.mailbox_id LOOP
      PERFORM 1 FROM app.mailbox_membership_revisions
        WHERE organization_id = org AND mailbox_id = box_id FOR UPDATE;
      IF EXISTS (SELECT 1 FROM app.mailbox_security
          WHERE organization_id = org AND mailbox_id = box_id AND classification = 'team')
        AND NOT EXISTS (
          SELECT 1 FROM app.mailbox_memberships m
          JOIN app.organization_memberships o ON (o.organization_id, o.user_id) =
            (m.organization_id, m.user_id)
          JOIN app.organization_access a ON (a.organization_id, a.user_id) =
            (m.organization_id, m.user_id)
          JOIN app.mailbox_grant_ceilings c ON (c.organization_id, c.mailbox_id, c.user_id) =
            (m.organization_id, m.mailbox_id, m.user_id)
          WHERE m.organization_id = org AND m.mailbox_id = box_id AND m.user_id <> p_target
            AND m.manage_members AND c.manage_members
            AND a.role IN ('owner', 'admin', 'sales_manager')
        ) THEN RETURN '{"status":"role_conflict"}'::jsonb; END IF;
    END LOOP;
  END IF;
  IF old_role <> p_role THEN
    IF current_revision = 2147483647 THEN RETURN '{"status":"temporarily_unavailable"}'::jsonb; END IF;
    UPDATE app.organization_access SET role = p_role, revision = revision + 1
      WHERE organization_id = org AND user_id = p_target;
    current_revision := current_revision + 1;
    INSERT INTO app.organization_role_audit(organization_id, actor_user_id, target_user_id,
      old_role, new_role, revision) VALUES (org, actor, p_target, old_role, p_role, current_revision);
  END IF;
  proof := app_auth.assert_protected_write(p_digest, p_target);
  IF proof->>'status' <> 'ok' THEN RETURN proof; END IF;
  RETURN jsonb_build_object('status', 'ok', 'metadata', proof, 'revision', current_revision, 'role', p_role);
END $$;
REVOKE ALL ON FUNCTION app.change_organization_role(text,uuid,integer,text)
  FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
GRANT EXECUTE ON FUNCTION app.change_organization_role(text,uuid,integer,text) TO elevateo_api;

-- AIDEV-NOTE: Outreach draft authority is rechecked inside the caller's protected write transaction.
CREATE FUNCTION app.authorize_outreach_draft_write(p_digest text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE proof jsonb; org uuid; actor uuid; current_role text; current_revision integer;
BEGIN
  proof := app_auth.assert_protected_write(p_digest, app.context_uuid('app.user_id'));
  IF proof->>'status' <> 'ok' THEN RETURN proof; END IF;
  org := (proof->>'organization_id')::uuid;
  actor := (proof->>'user_id')::uuid;
  SELECT role, revision INTO current_role, current_revision FROM app.organization_access
    WHERE organization_id = org AND user_id = actor;
  IF current_role NOT IN ('owner', 'admin', 'sales_manager', 'sales') OR current_role IS NULL THEN
    RETURN '{"status":"not_found"}'::jsonb;
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'role', current_role, 'revision', current_revision);
END $$;
REVOKE ALL ON FUNCTION app.authorize_outreach_draft_write(text)
  FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
GRANT EXECUTE ON FUNCTION app.authorize_outreach_draft_write(text) TO elevateo_api;

-- AIDEV-NOTE: A digest-backed session proof is required; caller-controlled tenant GUCs alone cannot list grants.
GRANT CREATE ON SCHEMA app TO elevateo_session_owner;
SET LOCAL ROLE elevateo_session_owner;
CREATE FUNCTION app.organization_grants_page(p_digest text, p_after uuid, p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE proof jsonb; org uuid; actor uuid; actor_role text; actor_revision integer; rows jsonb; extra uuid; cursor_id uuid;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'invalid grant page limit' USING ERRCODE = '22023';
  END IF;
  proof := app_auth.resolve_session(p_digest);
  IF proof->>'status' <> 'ok' THEN RETURN jsonb_build_object('status', proof->>'status'); END IF;
  org := (proof->>'organization_id')::uuid;
  actor := (proof->>'user_id')::uuid;
  IF org IS NULL OR NULLIF(current_setting('app.org_id', true), '') IS DISTINCT FROM org::text
    OR NULLIF(current_setting('app.user_id', true), '') IS DISTINCT FROM actor::text THEN
    RETURN '{"status":"not_found"}'::jsonb;
  END IF;
  SELECT role, revision INTO actor_role, actor_revision FROM app.organization_access
    WHERE organization_id = org AND user_id = actor;
  IF actor_role NOT IN ('owner', 'admin') OR actor_role IS NULL THEN
    RETURN '{"status":"not_found"}'::jsonb;
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', page.user_id,
      'role', page.role, 'revision', page.revision) ORDER BY page.user_id), '[]'::jsonb)
    INTO rows FROM (
      SELECT a.user_id, a.role, a.revision FROM app.organization_access a
      WHERE a.organization_id = org AND (p_after IS NULL OR a.user_id > p_after)
      ORDER BY a.user_id LIMIT p_limit
    ) page;
  SELECT (item.value->>'user_id')::uuid INTO cursor_id
    FROM jsonb_array_elements(rows) AS item(value)
    ORDER BY (item.value->>'user_id')::uuid DESC LIMIT 1;
  IF cursor_id IS NOT NULL THEN
    SELECT a.user_id INTO extra FROM app.organization_access a
      WHERE a.organization_id = org AND a.user_id > cursor_id ORDER BY a.user_id LIMIT 1;
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'actor',
    jsonb_build_object('user_id', actor, 'role', actor_role, 'revision', actor_revision), 'items', rows,
    'next_user_id', CASE WHEN extra IS NULL THEN NULL ELSE cursor_id END);
END $$;
REVOKE ALL ON FUNCTION app.organization_grants_page(text,uuid,integer)
  FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
GRANT EXECUTE ON FUNCTION app.organization_grants_page(text,uuid,integer) TO elevateo_api;

-- AIDEV-NOTE: Outreach content reads need current business role inside the authenticated snapshot.
CREATE FUNCTION app.authorize_outreach_content_read(p_digest text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE proof jsonb; org uuid; actor uuid; current_role text; current_revision integer;
BEGIN
  proof := app_auth.resolve_session(p_digest);
  IF proof->>'status' <> 'ok' THEN RETURN jsonb_build_object('status', proof->>'status'); END IF;
  org := (proof->>'organization_id')::uuid;
  actor := (proof->>'user_id')::uuid;
  IF org IS NULL OR NULLIF(current_setting('app.org_id', true), '') IS DISTINCT FROM org::text
    OR NULLIF(current_setting('app.user_id', true), '') IS DISTINCT FROM actor::text THEN
    RETURN '{"status":"not_found"}'::jsonb;
  END IF;
  SELECT role, revision INTO current_role, current_revision FROM app.organization_access
    WHERE organization_id = org AND user_id = actor;
  IF current_role NOT IN ('owner', 'admin', 'sales_manager', 'sales') OR current_role IS NULL THEN
    RETURN '{"status":"not_found"}'::jsonb;
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'role', current_role, 'revision', current_revision);
END $$;
REVOKE ALL ON FUNCTION app.authorize_outreach_content_read(text)
  FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
GRANT EXECUTE ON FUNCTION app.authorize_outreach_content_read(text) TO elevateo_api;

-- AIDEV-NOTE: UUID cursor resolves to one tenant-local sequence; page order is immutable newest-first.
CREATE FUNCTION app.organization_role_audit_page(p_digest text, p_after_id uuid, p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE proof jsonb; org uuid; actor uuid; actor_role text; after_sequence bigint;
  rows jsonb; last_id uuid; last_sequence bigint; has_more boolean;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'invalid audit page limit' USING ERRCODE = '22023';
  END IF;
  proof := app_auth.resolve_session(p_digest);
  IF proof->>'status' <> 'ok' THEN RETURN jsonb_build_object('status', proof->>'status'); END IF;
  org := (proof->>'organization_id')::uuid;
  actor := (proof->>'user_id')::uuid;
  IF org IS NULL OR NULLIF(current_setting('app.org_id', true), '') IS DISTINCT FROM org::text
    OR NULLIF(current_setting('app.user_id', true), '') IS DISTINCT FROM actor::text THEN
    RETURN '{"status":"not_found"}'::jsonb;
  END IF;
  SELECT role INTO actor_role FROM app.organization_access
    WHERE organization_id = org AND user_id = actor;
  IF actor_role NOT IN ('owner', 'admin') OR actor_role IS NULL THEN
    RETURN '{"status":"not_found"}'::jsonb;
  END IF;
  IF p_after_id IS NOT NULL THEN
    SELECT event_sequence INTO after_sequence FROM app.organization_role_audit
      WHERE organization_id = org AND id = p_after_id;
    IF NOT FOUND THEN RETURN '{"status":"cursor_invalid"}'::jsonb; END IF;
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', page.id,
      'actor_user_id', page.actor_user_id, 'target_user_id', page.target_user_id,
      'old_role', page.old_role, 'new_role', page.new_role, 'revision', page.revision,
      'operation', page.operation, 'occurred_at', page.occurred_at)
      ORDER BY page.event_sequence DESC), '[]'::jsonb)
    INTO rows FROM (
      SELECT a.* FROM app.organization_role_audit a WHERE a.organization_id = org
        AND (after_sequence IS NULL OR a.event_sequence < after_sequence)
      ORDER BY a.event_sequence DESC LIMIT p_limit
    ) page;
  SELECT id, event_sequence INTO last_id, last_sequence FROM app.organization_role_audit
    WHERE organization_id = org AND (after_sequence IS NULL OR event_sequence < after_sequence)
    ORDER BY event_sequence DESC OFFSET p_limit - 1 LIMIT 1;
  IF last_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM app.organization_role_audit
      WHERE organization_id = org AND event_sequence < last_sequence) INTO has_more;
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'items', rows,
    'next_id', CASE WHEN has_more THEN last_id ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION app.organization_role_audit_page(text,uuid,integer)
  FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
GRANT EXECUTE ON FUNCTION app.organization_role_audit_page(text,uuid,integer) TO elevateo_api;
SET LOCAL ROLE elevateo_owner;
REVOKE CREATE ON SCHEMA app FROM elevateo_session_owner;
