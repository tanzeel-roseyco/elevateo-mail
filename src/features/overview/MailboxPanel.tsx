import { useMemo } from 'react'
import { Link } from 'react-router'
import { canonicalAddress, sentTodayByAddress } from '@/domain/connections'
import { DAILY_LIMIT_MAX, type ActivityEvent, type DomainName, type Identity, type Thread } from '@/domain/schema'
import { DomainDot, ProgressBar } from '@/ui/Bits'

// AIDEV-NOTE: Resolved 2026-10-04: 30 per mailbox per day is confirmed; Settings, seed and forms now share DAILY_LIMIT_MAX.
/** The confirmed pilot ceiling, shown for reference. Nothing in this prototype counts or blocks real sends against it. */
const PLANNED_DAILY_SENDS = DAILY_LIMIT_MAX

function tally(ids: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}

interface Props {
  identities: Identity[]
  threads: Thread[]
  /** Inbox conversations where the other side spoke last (domain/mail awaitingResponse). */
  waiting: Thread[]
  events: ActivityEvent[]
  domain: DomainName | ''
  /** The page's minute clock (useNow); a change means "today" may have rolled over. */
  tick: number
}

// AIDEV-NOTE: Per-address workload on Overview; each row deep-links into that mailbox's inbox (?domain=&identity=).
export function MailboxPanel({ identities, threads, waiting, events, domain, tick }: Props) {
  const unread = useMemo(() => tally(threads.filter((t) => t.folder === 'inbox' && t.unread).map((t) => t.identityId)), [threads])
  const awaiting = useMemo(() => tally(waiting.map((t) => t.identityId)), [waiting])
  // Always "today", whatever range the page is showing: a daily ceiling only means something per day.
  // The clock is read fresh, as on the page itself, so a send logged since the last tick is not treated as future-dated.
  const sentToday = useMemo(() => sentTodayByAddress(events, Math.max(tick, Date.now())), [events, tick])
  const rows = identities.filter((i) => !domain || i.domain === domain)
  const cell = 'px-4 py-2 tabular-nums'

  return (
    <section aria-labelledby="ov-mailboxes" className="overflow-hidden rounded-xl border border-line">
      <h2 id="ov-mailboxes" className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm font-semibold">
        Mailboxes ({rows.length})
        <Link to="/connections/mailboxes" className="text-[13px] font-medium text-accent-text underline underline-offset-2">
          Manage mailboxes
        </Link>
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <caption className="sr-only">Unread, awaiting reply, and simulated sends today for each mailbox</caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="px-4 py-2 font-medium">Mailbox</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Unread</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Awaiting reply</th>
              <th scope="col" className="px-4 py-2 font-medium">Sent today</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const sent = sentToday.get(canonicalAddress(i.id)) ?? 0
              return (
                <tr key={i.id} className="border-b border-line last:border-b-0 hover:bg-surface-2">
                  <th scope="row" className="max-w-56 px-4 py-2 font-medium">
                    <Link to={`/mail/inbox?domain=${i.domain}&identity=${encodeURIComponent(i.id)}`} className="flex items-center gap-2 hover:underline">
                      <DomainDot domain={i.domain} />
                      <span className="truncate">{i.id}</span>
                    </Link>
                  </th>
                  <td className={`${cell} text-right`}>{unread.get(i.id) ?? 0}</td>
                  <td className={`${cell} text-right`}>{awaiting.get(i.id) ?? 0}</td>
                  <td className={cell}>
                    <span className="flex items-center gap-2.5">
                      <span className="hidden w-24 sm:block">
                        <ProgressBar value={sent} max={PLANNED_DAILY_SENDS} label={`${i.id} simulated sends today against the planned limit`} />
                      </span>
                      <span className="whitespace-nowrap">
                        {sent} / {PLANNED_DAILY_SENDS}
                      </span>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line bg-surface-2 px-4 py-2 text-xs text-muted">
        Sends are simulated. {PLANNED_DAILY_SENDS} per mailbox per day is the pilot limit, shown for reference; this prototype does not enforce it.
      </p>
    </section>
  )
}
