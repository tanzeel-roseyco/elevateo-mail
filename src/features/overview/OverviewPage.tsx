import { AlertTriangle, CheckCircle2, Megaphone, Reply, Send, UserMinus, XCircle, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useData } from '@/data/store'
import { countByKind, EVENT_LABELS, filterEvents, isRange, RANGE_LABELS, RANGES, type Range } from '@/domain/activity'
import { awaitingResponse, lastMessage } from '@/domain/mail'
import { campaignMetrics, nextAction, percent } from '@/domain/rules'
import { DOMAIN_NAMES, type DomainName, type EventKind } from '@/domain/schema'
import { formatDateTime, formatWhen } from '@/lib/format'
import { eventHref, threadHref } from '@/lib/routes'
import { Callout, PageHeader, ProgressBar, useNow, usePageTitle } from '@/ui/Bits'
import { MailboxPanel } from './MailboxPanel'
import { NextUp } from './NextUp'

// `of` names the count a metric is a share of, matching the rates on a campaign's own Overview tab.
const METRICS: Array<{ kind: EventKind; label: string; hint: string; icon: LucideIcon; of?: 'sent' | 'delivered' }> = [
  { kind: 'sent', label: 'Sent', hint: 'Handed to the sending service', icon: Send },
  { kind: 'delivered', label: 'Delivered', hint: 'Accepted by the recipient’s server — not the same as read', icon: CheckCircle2, of: 'sent' },
  { kind: 'reply', label: 'Replies', hint: 'Replies received', icon: Reply, of: 'delivered' },
  { kind: 'bounce', label: 'Bounces', hint: 'Rejected by the recipient’s server', icon: AlertTriangle, of: 'sent' },
  { kind: 'unsubscribe', label: 'Unsubscribes', hint: 'Recipients who opted out', icon: UserMinus, of: 'delivered' },
]

const selectClass = 'h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px]'
const panel = 'overflow-hidden rounded-xl border border-line'
const panelTitle = 'flex items-center justify-between border-b border-line px-4 py-2.5 text-sm font-semibold'
const viewAll = 'text-[13px] font-medium text-accent-text underline underline-offset-2'

/** Reads the shared `range` / `domain` filters that Overview and Activity both keep in the URL. */
export function useEventFilters() {
  const [search, setSearch] = useSearchParams()
  const rangeParam = search.get('range')
  const range: Range = isRange(rangeParam) ? rangeParam : '7d'
  const domain: DomainName | '' = DOMAIN_NAMES.find((d) => d === search.get('domain')) ?? ''
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(search)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setSearch(next, { replace: true })
  }
  return { range, domain, search, set }
}

export function EventFilterControls({ range, domain, set }: { range: Range; domain: string; set(key: string, value: string): void }) {
  return (
    <>
      <select aria-label="Date range" value={range} onChange={(e) => set('range', e.target.value)} className={selectClass}>
        {RANGES.map((r) => (
          <option key={r} value={r}>
            {RANGE_LABELS[r]}
          </option>
        ))}
      </select>
      <select aria-label="Sending domain" value={domain} onChange={(e) => set('domain', e.target.value)} className={selectClass}>
        <option value="">All domains</option>
        {DOMAIN_NAMES.map((d) => (
          <option key={d}>{d}</option>
        ))}
      </select>
    </>
  )
}

export function OverviewPage() {
  usePageTitle('Overview')
  const { range, domain, set } = useEventFilters()
  const events = useData((s) => s.events)
  const threads = useData((s) => s.threads)
  const campaigns = useData((s) => s.campaigns)
  const domains = useData((s) => s.domains)
  const identities = useData((s) => s.identities)
  const draftCount = useData((s) => s.drafts.length)

  // Recomputed on data changes and on every clock tick, so "today" rolls over on a page left open. The clock is
  // read fresh rather than taken from the tick, or an event logged since the last tick would look future-dated.
  const tick = useNow()
  const scoped = useMemo(() => filterEvents(events, { range, domain, kind: '', now: Math.max(tick, Date.now()) }), [events, range, domain, tick])
  const counts = useMemo(() => countByKind(scoped), [scoped])
  const waiting = useMemo(() => awaitingResponse(threads).filter((t) => !domain || t.identityId.endsWith(`@${domain}`)), [threads, domain])
  const scopedCampaigns = campaigns.filter((c) => !domain || c.identityIds.some((i) => i.endsWith(`@${domain}`)))
  const running = scopedCampaigns.filter((c) => c.status === 'running')
  const unverified = domains.filter((d) => (!domain || d.domain === domain) && [d.spf, d.dkim, d.dmarc].some((v) => v !== 'verified'))
  const linkQuery = (kind: EventKind) => `/activity?kind=${kind}&range=${range}${domain ? `&domain=${domain}` : ''}`

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader title="Overview" description={`${RANGE_LABELS[range]} · ${domain || 'all domains'}`} actions={<EventFilterControls range={range} domain={domain} set={set} />} />
      <div className="flex flex-col gap-5 p-4 md:p-6">
        {(counts.failed > 0 || unverified.length > 0) && (
          <section aria-label="Alerts" className="flex flex-col gap-2">
            {counts.failed > 0 && (
              <Callout tone="danger" icon={XCircle}>
                <strong>
                  {counts.failed} sending failure{counts.failed === 1 ? '' : 's'}
                </strong>{' '}
                in this period. These messages were not sent.{' '}
                <Link to={linkQuery('failed')} className="font-medium underline">
                  Review failures
                </Link>
              </Callout>
            )}
            {unverified.map((d) => (
              <Callout key={d.domain} tone="warn" icon={AlertTriangle}>
                <strong>{d.domain}</strong> has DNS records that are not verified (mock data). Mail from this domain may be rejected.{' '}
                <Link to="/settings/identities" className="font-medium underline">
                  Check domain status
                </Link>
              </Callout>
            ))}
          </section>
        )}

        <NextUp waiting={waiting} campaigns={scopedCampaigns} draftCount={draftCount} />

        {/* One ruled strip instead of five cards: the 1px gaps show the container colour as hairlines between cells. */}
        <section aria-label="Sending summary" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line xl:grid-cols-5">
          {METRICS.map((m) => (
            <Link key={m.kind} to={linkQuery(m.kind)} className="group bg-surface p-4 last:col-span-2 hover:bg-surface-2 xl:last:col-span-1">
              <span className="eyebrow flex items-center gap-1.5">
                <m.icon aria-hidden className="size-3.5" />
                {m.label}
              </span>
              <span className="figure mt-2 block text-[28px] font-semibold leading-none">{counts[m.kind].toLocaleString('en-GB')}</span>
              <span className="mt-2 block text-xs text-muted">
                {/* Events are counted inside a time window, so a part can outnumber its base at the edges; skip the rate then. */}
                {m.of && counts[m.of] >= counts[m.kind] && counts[m.of] > 0 && (
                  <span className="font-medium text-fg">
                    {percent(counts[m.kind], counts[m.of])} of {m.of} ·{' '}
                  </span>
                )}
                {m.hint}
              </span>
              <span className="mt-1.5 block text-xs font-medium text-accent-text group-hover:underline">View list</span>
            </Link>
          ))}
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className={panel} aria-labelledby="ov-waiting">
            <h2 id="ov-waiting" className={panelTitle}>
              Awaiting your response ({waiting.length})
              <Link to="/mail/inbox" className={viewAll}>
                Open inbox
              </Link>
            </h2>
            {waiting.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-muted">You are all caught up. No one is waiting on a reply.</p>
            ) : (
              <ul>
                {waiting.slice(0, 6).map((t) => (
                  <li key={t.id} className="border-b border-line last:border-b-0">
                    <Link to={threadHref(t)} className="flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-surface-2">
                      <span className="w-36 shrink-0 truncate font-medium">{lastMessage(t).from.name}</span>
                      <span className="min-w-0 flex-1 truncate text-muted">{t.subject}</span>
                      <time dateTime={lastMessage(t).at} className="shrink-0 text-xs text-muted">
                        {formatWhen(lastMessage(t).at)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={panel} aria-labelledby="ov-running">
            <h2 id="ov-running" className={panelTitle}>
              Campaigns running ({running.length})
              <Link to="/campaigns?status=running" className={viewAll}>
                All campaigns
              </Link>
            </h2>
            {running.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-muted">No campaigns are running{domain ? ` on ${domain}` : ''}.</p>
            ) : (
              <ul>
                {running.map((c) => {
                  const m = campaignMetrics(c)
                  return (
                    <li key={c.id} className="border-b border-line px-4 py-2.5 last:border-b-0">
                      <Link to={`/campaigns/${c.id}`} className="flex items-center gap-2 text-[13px] font-medium hover:underline">
                        <Megaphone aria-hidden className="size-4 shrink-0 text-muted" />
                        <span className="truncate">{c.name}</span>
                      </Link>
                      <div className="mt-2">
                        <ProgressBar value={m.sent + m.skipped} max={m.total} label={`${c.name} progress`} />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {m.sent} of {m.total} sent · {m.replies} replies · {nextAction(c, formatDateTime)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <MailboxPanel identities={identities} threads={threads} waiting={waiting} events={events} domain={domain} tick={tick} />

        <section className={panel} aria-labelledby="ov-activity">
          <h2 id="ov-activity" className={panelTitle}>
            Recent activity
            <Link to={`/activity?range=${range}${domain ? `&domain=${domain}` : ''}`} className={viewAll}>
              View all
            </Link>
          </h2>
          {scoped.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-muted">No activity in this period.</p>
          ) : (
            <ul>
              {scoped.slice(0, 8).map((e) => (
                <li key={e.id} className="border-b border-line last:border-b-0">
                  <Link to={eventHref(e, threads)} className="flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-surface-2">
                    <span className="w-32 shrink-0 font-medium">{e.kind === 'campaign' ? e.text : EVENT_LABELS[e.kind]}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{e.email || e.domain}</span>
                    <time dateTime={e.at} className="shrink-0 text-xs text-muted">
                      {formatWhen(e.at)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
