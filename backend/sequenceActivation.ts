import { resendReplyChannel, sequenceActivationAvailable } from './resendReplyRoute'

// AIDEV-NOTE: Proof is recomputed for each atomic transition; an old approval cannot authorize a rotated channel.
export async function sequenceActivationProof(db: D1Database, env: unknown, owner: string, id: string) {
  const row = await db.prepare(`SELECT b.provider,b.credential_id FROM sequence_steps s JOIN send_bindings b
    ON b.owner=s.owner AND b.intent_id=s.intent_id WHERE s.owner=? AND s.intent_id=?`)
    .bind(owner, id).first<{ provider: string; credential_id: string | null }>()
  if (!row || row.provider === 'fake' || !sequenceActivationAvailable(env, owner) ||
    row.provider !== 'resend' || !row.credential_id) return null
  return (await resendReplyChannel(env, owner, row.credential_id))?.fingerprint ?? null
}
