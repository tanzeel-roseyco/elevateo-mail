-- AIDEV-NOTE: One-use server proof binds approval and dispatch to the immutable receiving configuration.
ALTER TABLE send_intents ADD COLUMN sequence_proof TEXT;
DROP TRIGGER sequence_dispatch_guard;
DROP TRIGGER sequence_approval_guard;
CREATE TRIGGER sequence_activation_guard BEFORE UPDATE OF status ON send_intents
WHEN NEW.status<>OLD.status AND NEW.status IN ('pending','dispatching')
 AND EXISTS(SELECT 1 FROM sequence_steps s WHERE s.owner=NEW.owner AND s.intent_id=NEW.id)
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM send_bindings b WHERE b.owner=NEW.owner AND b.intent_id=NEW.id
   AND (b.provider='fake' OR (b.provider='resend' AND NEW.sequence_proof IS NOT NULL
     AND NEW.sequence_proof=json_extract(NEW.envelope,'$.resendReplyChannelHash')
     AND EXISTS(SELECT 1 FROM resend_reply_tokens t WHERE t.owner=b.owner AND t.intent_id=b.intent_id
       AND t.credential_id=b.credential_id))))
 THEN RAISE(ABORT,'sequence_live_disabled') END;
 SELECT CASE WHEN NEW.status='dispatching' AND EXISTS(SELECT 1 FROM sequence_steps s
   WHERE s.owner=NEW.owner AND s.intent_id=NEW.id AND s.predecessor_id IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM send_intents p WHERE p.owner=s.owner AND p.id=s.predecessor_id AND p.status='accepted'))
 THEN RAISE(ABORT,'sequence_predecessor_pending') END;
END;
-- AIDEV-NOTE: Clear proof in the same transaction, so approval never leaves a reusable dispatch permit.
CREATE TRIGGER sequence_proof_consume AFTER UPDATE OF status ON send_intents
WHEN NEW.sequence_proof IS NOT NULL
BEGIN UPDATE send_intents SET sequence_proof=NULL WHERE owner=NEW.owner AND id=NEW.id; END;
-- Rollback with dispatch stopped: drop both new triggers, restore guards from 0022, then drop sequence_proof.
