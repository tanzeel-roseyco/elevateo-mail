import { runGmailSyncPage, type GmailRuntimeServices } from './gmailRuntime'

const MINUTE = 60_000
const LEASE = 10 * MINUTE
const eligible = `EXISTS(SELECT 1 FROM mailboxes m JOIN provider_credentials c
 ON c.owner=m.owner AND c.provider=m.provider AND c.subject=m.subject
 WHERE m.owner=gmail_schedule.owner AND m.id=gmail_schedule.mailbox_id
 AND m.provider='gmail' AND m.connected=1 AND c.sealed IS NOT NULL)`
interface DueMailbox { owner: string; mailbox_id: string; failures: number }
export interface GmailScheduleResult { claimed: number; completed: number; failed: number }

// AIDEV-NOTE: Two concurrent bounded pages cap cost; due ordering gives all eligible mailboxes a fair turn.
export async function runGmailSchedule(db: D1Database, services: GmailRuntimeServices,
  clock: () => number = Date.now): Promise<GmailScheduleResult> {
  const now = clock()
  if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000 - 3_600_000) {
    throw new Error('invalid_scheduler_clock')
  }
  await db.prepare(`INSERT OR IGNORE INTO gmail_schedule(owner,mailbox_id)
    SELECT m.owner,m.id FROM mailboxes m WHERE m.provider='gmail' AND m.connected=1
    AND EXISTS(SELECT 1 FROM provider_credentials c WHERE c.owner=m.owner
      AND c.provider=m.provider AND c.subject=m.subject AND c.sealed IS NOT NULL)`).run()
  const due = await db.prepare(`SELECT owner,mailbox_id,failures FROM gmail_schedule
    WHERE due_at<=? AND lease_until<=? AND ${eligible}
    ORDER BY due_at,owner,mailbox_id LIMIT 2`).bind(now, now).all<DueMailbox>()
  const settled = await Promise.allSettled(due.results.map(async row => {
    const token = crypto.randomUUID()
    const claim = await db.prepare(`UPDATE gmail_schedule SET lease_token=?,lease_until=?,due_at=?
      WHERE owner=? AND mailbox_id=? AND due_at<=? AND lease_until<=? AND ${eligible}`)
      .bind(token, now + LEASE, now + LEASE, row.owner, row.mailbox_id, now, now).run()
    if (claim.meta.changes !== 1) return 'unclaimed' as const
    let failed = false
    let delay = MINUTE
    try {
      const result = await runGmailSyncPage(db, row.owner, row.mailbox_id, services, clock)
      if (result.status === 'caught_up') delay = 5 * MINUTE
    } catch {
      // AIDEV-NOTE: Never persist provider errors or tokens; backoff isolates unhealthy/revoked mailboxes.
      failed = true
      delay = Math.min(60 * MINUTE, MINUTE * 2 ** Math.min(row.failures + 1, 6))
    }
    // AIDEV-NOTE: An expired worker cannot release a successor's lease; cursor CAS protects imported data.
    await db.prepare(`UPDATE gmail_schedule SET lease_token=NULL,lease_until=0,due_at=?,failures=?,last_error=?
      WHERE owner=? AND mailbox_id=? AND lease_token=?`)
      .bind(clock() + delay, failed ? Math.min(row.failures + 1, 6) : 0,
        failed ? 'sync_failed' : null, row.owner, row.mailbox_id, token).run()
    return failed ? 'failed' as const : 'completed' as const
  }))
  // AIDEV-NOTE: Await both jobs even if one database operation fails; do not abandon its sibling's writes.
  const outcomes = settled.map(result => {
    if (result.status === 'rejected') throw result.reason
    return result.value
  })
  return { claimed: outcomes.filter(value => value !== 'unclaimed').length,
    completed: outcomes.filter(value => value === 'completed').length,
    failed: outcomes.filter(value => value === 'failed').length }
}
