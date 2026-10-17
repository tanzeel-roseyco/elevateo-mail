-- AIDEV-NOTE: The existing session_* trigger alone bumps generations; zz_* then updates the mailbox revision once.
CREATE FUNCTION app.bump_mailbox_membership_revision() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE prior_box uuid; next_box uuid; box uuid; org uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN prior_box := OLD.mailbox_id; END IF;
  IF TG_OP <> 'DELETE' THEN next_box := NEW.mailbox_id; END IF;
  IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN RETURN NULL; END IF;
  FOR box IN SELECT DISTINCT id FROM unnest(ARRAY[prior_box, next_box]) ids(id) WHERE id IS NOT NULL ORDER BY id LOOP
    SELECT organization_id INTO org FROM app.mailboxes WHERE id = box;
    -- A mailbox deletion cascades its revision too; do not recreate a dangling guard during that cascade.
    IF NOT FOUND THEN CONTINUE; END IF;
    INSERT INTO app.mailbox_membership_revisions(organization_id, mailbox_id)
      VALUES (org, box) ON CONFLICT (mailbox_id) DO NOTHING;
    UPDATE app.mailbox_membership_revisions SET membership_version = membership_version + 1
      WHERE mailbox_id = box AND organization_id = org AND membership_version < 2147483647;
    IF NOT FOUND THEN RAISE EXCEPTION 'membership revision exhausted' USING ERRCODE = '22003'; END IF;
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER zz_mailbox_membership_revision AFTER INSERT OR UPDATE OR DELETE ON app.mailbox_memberships
  FOR EACH ROW EXECUTE FUNCTION app.bump_mailbox_membership_revision();
REVOKE ALL ON FUNCTION app.bump_mailbox_membership_revision() FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
