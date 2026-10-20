import { useLayoutEffect, useState } from 'react'
import { Link } from 'react-router'
import { useFeatureGateways } from '@/app/featureGateways'
import { useSession } from '@/app/session'
import { campaignPageSchema, type Campaign } from './contract'
import { SendIcon, UsersIcon, ChartIcon, AtIcon } from '@/ui/icons'

type Overview = { status: 'loading' | 'error' | 'unavailable' } | { status: 'ready'; items: Campaign[]; more: boolean }

// AIDEV-NOTE: Layout cleanup aborts before stale failures can trigger recovery on another route.
export function CampaignOverview() {
  const { outreach } = useFeatureGateways()
  const { context, scope, handleError } = useSession()
  const [state, setState] = useState<Overview>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  useLayoutEffect(() => {
    if (!outreach || !context) { setState({ status: 'unavailable' }); return }
    const controller = new AbortController()
    const generation = scope.current()
    const current = () => !controller.signal.aborted && scope.isCurrent(generation)
    setState({ status: 'loading' })
    void outreach.listCampaigns(context, {}, controller.signal).then((wire) => {
      const page = campaignPageSchema.parse(wire)
      if (current()) setState({ status: 'ready', items: page.items, more: page.next_cursor !== null })
    }).catch((error: unknown) => {
      if (current() && !handleError(error, generation)) setState({ status: 'error' })
    })
    return () => controller.abort()
  }, [outreach, context, scope, handleError, revision])
  return <div className="space-y-6">
    <header className="flex items-center justify-between"><h2 className="text-sm font-semibold">Marketing</h2><SendIcon aria-hidden className="size-4 text-muted" /></header>
    <div className="marketing-intro"><span className="eyebrow">Build your next conversation</span><h3 className="mt-2 text-lg font-semibold">From outreach to inbox.</h3><p className="mt-2 text-[12px] leading-5 text-muted">Manage campaigns, consent and sequences alongside your everyday email.</p><Link to="/outreach/campaigns/new" className="workspace-compose mt-4">+ New campaign</Link></div>
    <section aria-label="Campaigns">
      <div className="mb-3 flex justify-between gap-2"><h3 className="eyebrow">Campaigns</h3><Link to="/outreach/campaigns" className="text-[12px] text-accent-text">View all →</Link></div>
      {state.status === 'loading' && <p role="status" className="text-[12px] text-muted">Loading campaigns…</p>}
      {state.status === 'unavailable' && <p role="status" className="text-[12px] text-muted">Connect the Outreach API to manage campaigns.</p>}
      {state.status === 'error' && <div role="alert"><p className="text-[12px] text-danger">Campaigns could not be loaded.</p><button className="workspace-link mt-2" onClick={() => setRevision((value) => value + 1)}>Try again</button></div>}
      {state.status === 'ready' && <>
        {state.items.length === 0 && <p className="text-[12px] text-muted">Your first campaign starts here.</p>}
        <ul className="space-y-2">{state.items.slice(0, 4).map((campaign) => <li key={campaign.id}><Link to={`/outreach/campaigns/${campaign.id}`} className="campaign-preview"><span className="min-w-0 truncate font-medium">{campaign.name}</span><span className="campaign-status">{campaign.status}</span></Link></li>)}</ul>
        {(state.more || state.items.length > 4) && <p className="mt-2 text-[11px] text-muted">Showing first page · view all for more</p>}
      </>}
    </section>
    <nav aria-label="Marketing tools" className="space-y-1">
      {[{ to: '/outreach/leads', label: 'Leads & consent', Icon: UsersIcon }, { to: '/outreach/accounts', label: 'Sending accounts', Icon: AtIcon }, { to: '/outreach/analytics', label: 'Campaign analytics', Icon: ChartIcon }].map(({ to, label, Icon }) => <Link key={to} className="marketing-tool" to={to}><Icon aria-hidden className="size-4" /><span>{label}</span><span aria-hidden className="ml-auto">↗</span></Link>)}
    </nav>
    <p className="border-t border-line pt-4 text-[11px] leading-5 text-muted">{outreach?.createCampaignRun && outreach.listCampaignRuns ? 'Consent-based marketing runs are available from campaign details, in batches of up to 25 leads. Delivery depends on the configured sending mode.' : 'Campaign sending is unavailable in this connection. Drafts and consent records require the Outreach API.'}</p>
  </div>
}
