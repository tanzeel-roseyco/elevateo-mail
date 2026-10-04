import { useEffect } from 'react'
import type { QuotaCounters } from '@/data/http/contract'
import { live, useLive } from '@/data/http/instance'
import { formatDateTime } from '@/lib/format'

// AIDEV-NOTE: Capacity is whatever the server reports, read when shown. Nothing here counts sends in the browser,
// uses the local clock for a window, or promises when capacity returns.

/** What can honestly be said about when capacity might return. Never a countdown. */
export function releaseNote(counters: QuotaCounters): string {
  const parts: string[] = []
  if (counters.reservationReleaseUnknown) parts.push('Held requests have no known release time.')
  if (counters.nextAcceptedReleaseAt !== null) parts.push(`The earliest accepted send stops counting after ${formatDateTime(new Date(counters.nextAcceptedReleaseAt).toISOString())}; that frees part of the capacity, not all of it.`)
  return parts.join(' ')
}

export function capacitySummary(counters: QuotaCounters): string {
  return `${counters.remaining} of ${counters.limit} available · ${counters.acceptedUsage} accepted · ${counters.heldReservations} held`
}

/** One sentence of server-reported capacity for a mailbox and the whole account. */
export function QuotaLine({ mailboxId }: { mailboxId: string }) {
  const quota = useLive((s) => s.quotas[mailboxId])
  useEffect(() => {
    void live.loadQuota(mailboxId)
  }, [mailboxId])

  if (!quota || quota.status === 'loading' || quota.status === 'idle') return <span>Reading capacity from the server…</span>
  if (quota.status === 'error') return <span role="status">Capacity could not be read from the server, so it is not shown.</span>
  const { mailbox, user, windowHours } = quota.data
  return (
    <span>
      Server-reported capacity over a rolling {windowHours} hours (provisional policy): this mailbox {capacitySummary(mailbox)}; your account {capacitySummary(user)}. {releaseNote(mailbox)}
    </span>
  )
}
