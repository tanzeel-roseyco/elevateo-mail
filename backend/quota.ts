import { ApiError } from './core'
import { quotaResponse } from './contracts/v1'

// AIDEV-NOTE: Historical disconnected sends count toward owner capacity; unknown reservations have no release promise.
export async function quota(db: D1Database, owner: string, mailboxId: string, now: number): Promise<Response> {
  if (!await db.prepare('SELECT id FROM mailboxes WHERE owner=? AND id=?').bind(owner, mailboxId).first()) {
    throw new ApiError('mailbox_not_found', 404)
  }
  const rows = await db.prepare(`SELECT mailbox_id,
    sum(CASE WHEN status='accepted' THEN recipient_count ELSE 0 END) AS accepted,
    sum(CASE WHEN status IN ('pending','dispatching','unknown') THEN recipient_count ELSE 0 END) AS held,
    min(CASE WHEN status='accepted' THEN dispatch_at+86400000 ELSE NULL END) AS release_at
    FROM (SELECT mailbox_id,status,recipient_count,dispatch_at FROM send_intents
      WHERE owner=? AND status IN ('pending','dispatching','unknown')
      UNION ALL SELECT mailbox_id,status,recipient_count,dispatch_at FROM send_intents
      WHERE owner=? AND status='accepted' AND dispatch_at>?) GROUP BY mailbox_id`).bind(owner, owner, now - 86_400_000)
    .all<{ mailbox_id: string; accepted: number; held: number; release_at: number | null }>()
  function counters(limit: number, entries: typeof rows.results) {
    const acceptedUsage = entries.reduce((sum, row) => sum + row.accepted, 0)
    const heldReservations = entries.reduce((sum, row) => sum + row.held, 0)
    const releases = entries.flatMap(row => row.release_at === null ? [] : [row.release_at])
    return { limit, acceptedUsage, heldReservations, remaining: Math.max(0, limit - acceptedUsage - heldReservations),
      nextAcceptedReleaseAt: releases.length ? Math.min(...releases) : null, reservationReleaseUnknown: heldReservations > 0 }
  }
  return Response.json(quotaResponse.parse({ mailboxId, policy: 'provisional_rolling_24h_recipients', windowHours: 24,
    mailbox: counters(30, rows.results.filter(row => row.mailbox_id === mailboxId)), user: counters(300, rows.results), simulated: true }))
}
