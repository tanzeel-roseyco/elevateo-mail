import { Megaphone, Plus, Search } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useData } from '@/data/store'
import { identityDomain } from '@/domain/identities'
import { campaignMetrics, nextAction } from '@/domain/rules'
import { CAMPAIGN_STATUSES, type CampaignStatus } from '@/domain/schema'
import { cx, formatDateTime } from '@/lib/format'
import { StatusBadge } from '@/ui/Badge'
import { EmptyState, PageHeader, usePageTitle } from '@/ui/Bits'
import { buttonClass } from '@/ui/Button'

const STATUS_LABELS: Record<CampaignStatus, string> = { draft: 'Draft', scheduled: 'Scheduled', running: 'Running', paused: 'Paused', completed: 'Completed' }

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
              <button key={s || 'all'} type="button" aria-pressed={status === s} onClick={() => setParam('status', s)} className={cx('h-8 rounded-full border px-3 text-[13px]', status === s ? 'border-accent-text bg-accent-soft font-semibold text-accent-text' : 'border-line hover:bg-surface-2')}>
                {s ? STATUS_LABELS[s] : 'All'}
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
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <caption className="sr-only">Campaigns</caption>
            <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
              <tr>
                {['Campaign', 'Sender domain', 'Status', 'Audience', 'Sent', 'Replies', 'Next action'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const m = campaignMetrics(c)
                const domain = c.identityIds[0] ? identityDomain(c.identityIds[0]) : null
                return (
                  <tr key={c.id} className="border-b border-line hover:bg-surface-2">
                    <th scope="row" className="row max-w-80 px-4 font-medium">
                      <Link to={`/campaigns/${c.id}`} className="block truncate hover:underline">
                        {c.name}
                      </Link>
                    </th>
                    <td className="row px-4 text-muted">
                      {domain ?? '—'}
                      <span className="block text-xs">
                        {c.identityIds.length} sender{c.identityIds.length === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className="row px-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="row px-4 tabular-nums">{m.total}</td>
                    <td className="row px-4 tabular-nums">{m.sent}</td>
                    <td className="row px-4 tabular-nums">{m.replies}</td>
                    <td className="row px-4 text-muted">{nextAction(c, formatDateTime)}</td>
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
