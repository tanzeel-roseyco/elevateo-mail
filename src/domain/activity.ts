import { matchesQuery, sortByRecent } from './mail'
import { contactMatches } from './rules'
import type { ActivityEvent, Campaign, Contact, Data, DomainName, EventKind, Thread } from './schema'

// AIDEV-NOTE: Event-log queries behind Overview metrics, the Activity list, notifications, and global search.

export const RANGES = ['today', '7d', '30d', 'all'] as const
export type Range = (typeof RANGES)[number]
export const RANGE_LABELS: Record<Range, string> = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', all: 'All time' }

export function isRange(value: string | null): value is Range {
  return RANGES.some((r) => r === value)
}

const DAY = 86_400_000

/** Epoch ms at which the range begins. "Today" starts at local midnight. */
export function rangeStart(range: Range, now: number): number {
  switch (range) {
    case 'today': {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }
    case '7d':
      return now - 7 * DAY
    case '30d':
      return now - 30 * DAY
    case 'all':
      return 0
  }
}

export interface EventFilter {
  range: Range
  domain: DomainName | ''
  kind: EventKind | ''
  now: number
}

export function filterEvents(events: ActivityEvent[], filter: EventFilter): ActivityEvent[] {
  const startIso = new Date(rangeStart(filter.range, filter.now)).toISOString()
  // Upper bound too: a future-dated event is not part of "today" or "the last 7 days".
  const nowIso = new Date(filter.now).toISOString()
  return events.filter(
    (e) => e.at >= startIso && e.at <= nowIso && (!filter.domain || e.domain === filter.domain) && (!filter.kind || e.kind === filter.kind),
  )
}

export function countByKind(events: ActivityEvent[]): Record<EventKind, number> {
  const counts: Record<EventKind, number> = { sent: 0, delivered: 0, reply: 0, bounce: 0, unsubscribe: 0, failed: 0, campaign: 0 }
  for (const e of events) counts[e.kind]++
  return counts
}

/** "Delivered" means the receiving server accepted the message. It never means read or opened. */
export const EVENT_LABELS: Record<EventKind, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  reply: 'Reply received',
  bounce: 'Bounced',
  unsubscribe: 'Unsubscribed',
  failed: 'Sending failed',
  campaign: 'Campaign update',
}

export interface NotificationPrefs {
  replies: boolean
  failures: boolean
  completion: boolean
}

/** Events worth surfacing in the bell menu, honouring in-app notification preferences. */
export function notifiableEvents(events: ActivityEvent[], prefs: NotificationPrefs): ActivityEvent[] {
  return events.filter(
    (e) =>
      (prefs.replies && e.kind === 'reply') ||
      (prefs.failures && (e.kind === 'failed' || e.kind === 'bounce')) ||
      (prefs.completion && e.kind === 'campaign' && e.text.toLowerCase().includes('completed')),
  )
}

export interface SearchResults {
  threads: Thread[]
  contacts: Contact[]
  campaigns: Campaign[]
  total: number
}

export function searchAll(data: Pick<Data, 'threads' | 'contacts' | 'campaigns'>, query: string): SearchResults {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return { threads: [], contacts: [], campaigns: [], total: 0 }
  const threads = sortByRecent(data.threads.filter((t) => t.folder !== 'trash' && matchesQuery(t, q)))
  const contacts = data.contacts.filter((c) => contactMatches(c, q))
  const campaigns = data.campaigns.filter((c) => c.name.toLowerCase().includes(q))
  return { threads, contacts, campaigns, total: threads.length + contacts.length + campaigns.length }
}
