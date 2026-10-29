-- AIDEV-NOTE: Operator transaction provisions held mailboxes; quota rows reuse the worker's ordered-lock ledger.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(62817,45);
CREATE TEMP TABLE approved_assignments(org uuid,usr uuid,box uuid,address text) ON COMMIT DROP;
INSERT INTO approved_assignments VALUES __ASSIGNMENTS__;
DO $$ DECLARE row record; BEGIN
 IF current_user <> 'supabase_admin' THEN RAISE EXCEPTION 'operator identity required'; END IF;
 FOR row IN SELECT DISTINCT org,usr FROM approved_assignments ORDER BY org,usr LOOP
  PERFORM app_auth.lock_authorization_generations(row.org,row.usr);
 END LOOP;
 -- Lock enrollment through commit: a concurrent removal must not leave a newly provisioned orphan grant.
 LOCK TABLE app.organization_memberships IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM approved_assignments a WHERE NOT EXISTS(
  SELECT 1 FROM app.organization_memberships m JOIN auth.users u ON u.id=m.user_id
  WHERE m.organization_id=a.org AND m.user_id=a.usr AND u.email_confirmed_at IS NOT NULL
  AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())))
 THEN RAISE EXCEPTION 'existing active enrolled identity required'; END IF;
 LOCK TABLE app.mailboxes,app.mailbox_memberships IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM approved_assignments a JOIN app.mailboxes m
  ON m.id=a.box OR m.address=a.address
  WHERE m.id<>a.box OR m.organization_id<>a.org OR m.address<>a.address)
 OR EXISTS(SELECT 1 FROM approved_assignments a JOIN app.mailbox_memberships m
  ON m.organization_id=a.org AND m.mailbox_id=a.box WHERE m.user_id<>a.usr)
 THEN RAISE EXCEPTION 'existing mailbox assignment conflict'; END IF;
 IF EXISTS(SELECT 1 FROM approved_assignments a JOIN app.mailbox_security s ON s.mailbox_id=a.box
  WHERE s.classification<>'personal' OR s.personal_owner_id IS DISTINCT FROM a.usr)
 THEN RAISE EXCEPTION 'existing mailbox security conflict'; END IF;
 IF EXISTS(SELECT 1 FROM approved_assignments a JOIN app_send_private.budget_routes r
  ON r.organization_id=a.org AND r.mailbox_id=a.box
  WHERE r.egress_id<>'__EGRESS__'::uuid OR r.group_name<>'personal')
 THEN RAISE EXCEPTION 'existing mailbox route conflict'; END IF;
END $$;
INSERT INTO app.mailboxes(id,organization_id,address,visibility)
 SELECT box,org,address,'private' FROM approved_assignments ON CONFLICT DO NOTHING;
INSERT INTO app.mailbox_memberships(organization_id,mailbox_id,user_id,compose,approve_send)
 SELECT org,box,usr,true,true FROM approved_assignments ON CONFLICT DO NOTHING;
INSERT INTO app.mailbox_security(organization_id,mailbox_id,classification,personal_owner_id)
 SELECT org,box,'personal',usr FROM approved_assignments ON CONFLICT DO NOTHING;
INSERT INTO app.mailbox_grant_ceilings(organization_id,mailbox_id,user_id,compose,approve_send,manage_members)
 SELECT org,box,usr,true,true,false FROM approved_assignments ON CONFLICT DO NOTHING;
INSERT INTO app_send_private.organization_policy(organization_id,revision,updated_at)
 SELECT DISTINCT org,1,clock_timestamp() FROM approved_assignments ON CONFLICT DO NOTHING;
INSERT INTO app_send_private.mailbox_policy(organization_id,mailbox_id,enabled)
 SELECT org,box,false FROM approved_assignments ON CONFLICT DO NOTHING;
INSERT INTO app_send_private.budget_routes(id,organization_id,mailbox_id,group_name,egress_id,version,enabled)
 SELECT md5('route:'||box::text)::uuid,org,box,'personal','__EGRESS__',1,true
 FROM approved_assignments ON CONFLICT DO NOTHING;
CREATE TEMP TABLE desired_limits(kind text,scope jsonb,ceiling integer,PRIMARY KEY(kind,scope)) ON COMMIT DROP;
INSERT INTO desired_limits
 SELECT 'mailbox',jsonb_build_array(org,box),__MAILBOX_LIMIT__ FROM approved_assignments
 UNION SELECT 'user',jsonb_build_array(usr),__USER_LIMIT__ FROM approved_assignments
 UNION SELECT 'organization',jsonb_build_array(org),__USER_LIMIT__ FROM approved_assignments
 UNION SELECT 'group',jsonb_build_array(org,'personal'),__USER_LIMIT__ FROM approved_assignments
 UNION SELECT 'sender_domain',jsonb_build_array(split_part(address,'@',2)),__USER_LIMIT__ FROM approved_assignments
 UNION SELECT 'egress',jsonb_build_array('__EGRESS__'::text),__USER_LIMIT__;
-- AIDEV-NOTE: Destination domains remain explicit operator policy; no wildcard quota bypass is created.
-- Acquire existing ledger rows in the worker's UUID order before inserts or updates can take row locks.
SELECT 1 FROM app_send_private.budget_limits l JOIN desired_limits d USING(kind,scope) ORDER BY l.id FOR UPDATE OF l;
INSERT INTO app_send_private.budget_limits(id,kind,scope,version,ceiling,enabled)
 SELECT md5('limit:'||kind||':'||scope::text)::uuid,kind,scope,1,ceiling,true FROM desired_limits
 ORDER BY md5('limit:'||kind||':'||scope::text)::uuid
 ON CONFLICT(kind,scope) DO NOTHING;
UPDATE app_send_private.budget_limits l SET ceiling=d.ceiling,enabled=true,version=l.version+1
 FROM desired_limits d WHERE l.kind=d.kind AND l.scope=d.scope AND (l.ceiling<>d.ceiling OR NOT l.enabled);
COMMIT;
