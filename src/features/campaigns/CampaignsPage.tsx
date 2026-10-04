import { Megaphone, Plus, Search } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useData } from '@/data/store'
import { identityDomain } from '@/domain/identities'
import { campaignMetrics, nextAction, percent } from '@/domain/rules'
import { CAMPAIGN_STATUSES, type CampaignStatus } from '@/domain/schema'
import { cx, formatDateTime } from '@/lib/format'
import { StatusBadge } from '@/ui/Badge'
import { DomainDot, EmptyState, PageHeader, ProgressBar, usePageTitle } from '@/ui/Bits'
import { buttonClass } from '@/ui/Button'

const STATUS_LABELS: Record<CampaignStatus, string> = { draft: 'Draft', scheduled: 'Scheduled', running: 'Running', paused: 'Paused', completed: 'Completed' }
const th = 'px-4 py-2 font-medium'

// AIDEV-NOTE: Campaign portfolio. Progress and reply rate come from domain/rules campaignMetrics; nothing is re-derived here.

export function CampaignsPage() {
  usePageTitle('Campaigns')
  const [search, setSearch] = useSearchParams()
  const campaigns = useData((s) => s.campaigns)
  const q = search.get('q') ?? ''
  const status = CAMPAIGN_STATUSES.find((s) => s === search.get('status')) ?? ''

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(search)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearch(next, { replace: true })
  }

  const rows = useMemo(() => campaigns.filter((c) => (!status || c.status === status) && c.name.toLowerCase().includes(q.trim().toLowerCase())), [campaigns, q, status])
  const statusCounts = useMemo(() => {
    const counts = new Map<CampaignStatus, number>()
    for (const c of campaigns) counts.set(c.status, (counts.get(c.status) ?? 0) + 1)
    return counts
  }, [campaigns])
  const createLink = (
    <Link to="/campaigns/new" className={buttonClass('primary')}>
      <Plus aria-hidden className="size-4" />
      Create campaign
    </Link>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Campaigns" description="Scheduling and sending are simulated in this prototype." actions={createLink}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input type="search" aria-label="Search campaigns" placeholder="Search campaigns" value={q} onChange={(e) => setParam('q', e.target.value)} className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-2 text-[13px]" />
          </div>
          <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
            {(['', ...CAMPAIGN_STATUSES] as const).map((s) => (
              <button key={s || 'all'} type="button" aria-pressed={status === s} onClick={() => setParam('status', s)} className={cx('flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px]', status === s ? 'border-accent-text bg-accent-soft font-semibold text-accent-text' : 'border-line hover:bg-surface-2')}>
                {s ? STATUS_LABELS[s] : 'All'}
                {/* Counts ignore the search box on purpose: they describe the portfolio, not the current result. */}
                <span className={cx('text-xs tabular-nums', status !== s && 'text-muted')}>{s ? (statusCounts.get(s) ?? 0) : campaigns.length}</span>
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto">
        {campaigns.length === 0 ? (
          <EmptyState icon={Megaphone} title="No campaigns yet" body="Create your first campaign to email a group of opted-in contacts with an unsubscribe link in every message." action={createLink} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Search} title="No campaigns match" body="Try a different search or status filter." action={<button type="button" className={buttonClass()} onClick={() => setSearch({}, { replace: true })}>Clear filters</button>} />
        ) : (
          // No min-width: lower-priority columns drop out as the screen narrows, so phones never scroll sideways.
          <table className="w-full table-fixed text-left text-[13px]">
            <caption className="sr-only">Campaigns</caption>
            <thead className="sticky top-0 z-10 bg-surface-2 text-xs text-muted">
              <tr>
                <th scope="col" className={th}>Campaign</th>
                <th scope="col" className={cx(th, 'hidden w-32 sm:table-cell')}>Status</th>
                <th scope="col" className={cx(th, 'w-36 sm:w-52')}>Progress</th>
                <th scope="col" className={cx(th, 'hidden w-28 md:table-cell')}>Replies</th>
                <th scope="col" className={cx(th, 'hidden w-64 xl:table-cell')}>Next action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const m = campaignMetrics(c)
                const domain = c.identityIds[0] ? identityDomain(c.identityIds[0]) : null
                const processed = m.sent + m.skipped
                return (
                  <tr key={c.id} className="border-b border-line hover:bg-surface-2">
                    <th scope="row" className="row px-4 font-medium">
                      <Link to={`/campaigns/${c.id}`} className="block truncate text-sm hover:underline">
                        {c.name}
                      </Link>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs font-normal text-muted">
                        <DomainDot domain={domain} />
                        <span className="truncate">
                          {domain ?? 'No sender'} · {c.identityIds.length} sender{c.identityIds.length === 1 ? '' : 's'}
                        </span>
                      </span>
                      {/* Phones have no room for a Status column, so the badge moves under the name there. */}
                      <span className="mt-1.5 block sm:hidden">
                        <StatusBadge status={c.status} />
                      </span>
                    </th>
                    <td className="row hidden px-4 sm:table-cell">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="row px-4">
                      <ProgressBar value={processed} max={m.total} label={`${c.name} progress`} />
                      <span className="mt-1 block text-xs tabular-nums text-muted">
                        {processed} of {m.total} · {percent(processed, m.total)}
                      </span>
                    </td>
                    <td className="row hidden px-4 tabular-nums md:table-cell">
                      {m.replies}
                      <span className="block text-xs text-muted">{percent(m.replies, m.delivered)} of delivered</span>
                    </td>
                    <td className="row hidden px-4 text-muted xl:table-cell">{nextAction(c, formatDateTime)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
