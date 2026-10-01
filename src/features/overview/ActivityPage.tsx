import { Activity } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { useData } from '@/data/store'
import { EVENT_LABELS, filterEvents } from '@/domain/activity'
import { EVENT_KINDS, type EventKind } from '@/domain/schema'
import { formatDateTime } from '@/lib/format'
import { clampPage, EmptyState, PAGE_SIZE, PageHeader, Pagination, useNow, usePageTitle } from '@/ui/Bits'
import { buttonClass } from '@/ui/Button'
import { EventFilterControls, useEventFilters } from './OverviewPage'
import { eventHref } from '@/lib/routes'

/** The filtered list behind every Overview metric. */
export function ActivityPage() {
  usePageTitle('Activity')
  const { range, domain, search, set } = useEventFilters()
  const kind: EventKind | '' = EVENT_KINDS.find((k) => k === search.get('kind')) ?? ''
  const events = useData((s) => s.events)
  const threads = useData((s) => s.threads)
  const campaigns = useData((s) => s.campaigns)

  // Recomputed on every clock tick as well, so events age out of the range on a page left open. The clock is
  // read fresh rather than taken from the tick, or an event logged since the last tick would look future-dated.
  const tick = useNow()
  const rows = useMemo(() => filterEvents(events, { range, domain, kind, now: Math.max(tick, Date.now()) }), [events, range, domain, kind, tick])
  const page = clampPage(search.get('page'), rows.length)
  const campaignNames = useMemo(() => new Map(campaigns.map((c) => [c.id, c.name])), [campaigns])
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Activity"
        description="Every simulated sending event. “Delivered” means accepted by the recipient’s server, not read."
        actions={
          <>
            <select aria-label="Event type" value={kind} onChange={(e) => set('kind', e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px]">
              <option value="">All events</option>
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {EVENT_LABELS[k]}
                </option>
              ))}
            </select>
            <EventFilterControls range={range} domain={domain} set={set} />
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No matching activity"
            body="Nothing happened that matches these filters. Try a longer date range."
            action={
              <Link to="/activity?range=all" className={buttonClass()}>
                Show all activity
              </Link>
            }
          />
        ) : (
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <caption className="sr-only">Activity events, newest first</caption>
            <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
              <tr>
                {['When', 'Event', 'Contact', 'Sender', 'Campaign', ''].map((h, i) => (
                  <th key={i} scope="col" className="px-4 py-2 font-medium">
                    {h || <span className="sr-only">Conversation</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id} className="border-b border-line">
                  <td className="row whitespace-nowrap px-4 text-muted">{formatDateTime(e.at)}</td>
                  <td className="row px-4 font-medium">{e.kind === 'campaign' ? e.text : EVENT_LABELS[e.kind]}</td>
                  <td className="row px-4">{e.email || '—'}</td>
                  <td className="row px-4 text-muted">{e.identityId}</td>
                  <td className="row max-w-56 truncate px-4">
                    {e.campaignId && campaignNames.has(e.campaignId) ? (
                      <Link to={`/campaigns/${e.campaignId}`} className="text-accent-text underline underline-offset-2">
                        {campaignNames.get(e.campaignId)}
                      </Link>
                    ) : (
                      <span className="text-muted">Ordinary message</span>
                    )}
                  </td>
                  <td className="row px-4">
                    {e.threadId && (
                      <Link to={eventHref(e, threads)} className="text-accent-text underline underline-offset-2">
                        Open
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {rows.length > 0 && <Pagination page={page} total={rows.length} noun="events" onPage={(p) => set('page', p > 1 ? String(p) : '')} />}
    </div>
  )
}
