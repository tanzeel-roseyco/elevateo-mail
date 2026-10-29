-- AIDEV-NOTE: A cold snapshot cannot know which later sends reached providers; all unfinished work needs reconciliation.
BEGIN;
SET LOCAL statement_timeout='60s';
UPDATE app_auth.sessions SET state='revoked',revoked_at=clock_timestamp(),revocation_scope='global',
 refresh_claim_id=NULL,refresh_claim_deadline=NULL;
UPDATE app_auth.authorization_generations SET generation=generation+1;
UPDATE app_connector_private.grants SET revoked=true;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.sessions;
UPDATE app_auth.pending_entries SET state='uncertain' WHERE state<>'completed';
UPDATE app_send_private.jobs SET state='needs_review',next_action='none',next_check_at=NULL,
 lease_id=NULL,lease_expires_at=NULL,lease_generation=lease_generation+1,
 hold_reason='restore_unreconciled',updated_at=clock_timestamp()
 WHERE state NOT IN ('accepted','rejected','cancelled');
UPDATE app_send_private.mailbox_policy SET enabled=false;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM app_auth.sessions WHERE state<>'revoked')
 OR EXISTS(SELECT 1 FROM app_connector_private.grants WHERE NOT revoked)
 OR EXISTS(SELECT 1 FROM app_send_private.jobs WHERE next_action<>'none')
 THEN RAISE EXCEPTION 'restore authority fence failed'; END IF;
END $$;
COMMIT;
