import { useLayoutEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useFeatureGateways } from '@/app/featureGateways'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useSession, sessionIdentityKey } from '@/app/session'
import { Button } from '@/ui/Button'
import { PageHeader } from '@/ui/PageHeader'
import { linkClass } from '@/ui/Text'
import { campaignSchema, leadPageSchema } from './contract'
import { campaignRunPageSchema, campaignRunSchema, type CampaignRun } from './runContract'
import { RunComposer } from './RunComposer'

export function CampaignRunsPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const { state } = useSession()
  const [query] = useSearchParams()
  const key = `${state.status === 'ready' ? sessionIdentityKey(state.session) : ''}:${campaignId}:${query.get('cursor')}:${query.get('leads_cursor')}`
  return campaignId ? <RunsWorkspace key={key} campaignId={campaignId} /> : <p role="alert">Campaign unavailable.</p>
}

// AIDEV-NOTE: Resource and identity keys reset rendered data; protected requests abort synchronously on unmount.
function RunsWorkspace({ campaignId }: { campaignId: string }) {
  const { outreach } = useFeatureGateways()
  const { request, proof } = useProtectedRequest()
  const [query] = useSearchParams()
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<{
    campaign: ReturnType<typeof campaignSchema.parse>; leads: ReturnType<typeof leadPageSchema.parse>; runs: ReturnType<typeof campaignRunPageSchema.parse>
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const runCursor = query.get('cursor') ?? undefined
  const leadCursor = query.get('leads_cursor') ?? undefined
  const available = Boolean(outreach?.createCampaignRun && outreach.listCampaignRuns && outreach.getCampaignRun && outreach.cancelCampaignRun)
  useLayoutEffect(() => {
    if (!available || !outreach?.listCampaignRuns) return
    let current = true
    const controller = new AbortController()
    setError(null)
    void request(async (context, signal) => {
      const abort = () => controller.abort()
      signal.addEventListener('abort', abort, { once: true })
      try {
      const [campaignWire, leadsWire, runsWire] = await Promise.all([
        outreach.getCampaign(context, campaignId, controller.signal),
        outreach.listLeads(context, campaignId, leadCursor ? { cursor: leadCursor } : {}, controller.signal),
        outreach.listCampaignRuns!(context, campaignId, runCursor ? { cursor: runCursor } : {}, controller.signal),
      ])
      if (!current) return null
      const campaign = campaignSchema.parse(campaignWire), leads = leadPageSchema.parse(leadsWire), runs = campaignRunPageSchema.parse(runsWire)
      if (campaign.id !== campaignId || leads.items.some((item) => item.campaign_id !== campaignId) || runs.items.some((item) => item.campaign_id !== campaignId)) throw new Error('Campaign response mismatch')
      return { campaign, leads, runs }
      } catch (error) {
        // AIDEV-NOTE: Superseded reads must not deliver old 401/context errors to the shared session policy.
        if (!current) return null
        throw error
      } finally { signal.removeEventListener('abort', abort) }
    }).then((result) => {
      if (!current || result.kind === 'stale') return
      if (result.kind === 'ok' && result.value) setData(result.value)
      else { setData(null); setError('Campaign runs could not be loaded. Check access and try again.') }
    })
    return () => { current = false; controller.abort() }
  }, [available, outreach, request, campaignId, leadCursor, runCursor, revision])
  async function cancel(run: CampaignRun) {
    if (!outreach?.cancelCampaignRun || !proof || busy) return
    setBusy(true); setError(null)
    const result = await request(async (context, signal) => {
      const value = campaignRunSchema.parse(await outreach.cancelCampaignRun!(context, proof, campaignId, run.id, { operation_id: run.id }, signal))
      if (value.id !== run.id || value.campaign_id !== campaignId || value.state !== 'cancelled') throw new Error('Cancel receipt mismatch')
      return value
    })
    if (result.kind === 'stale') return
    setBusy(false)
    if (result.kind === 'ok') setRevision((value) => value + 1)
    else setError('Cancellation was not confirmed. Refresh status or retry cancellation; mail already accepted cannot be recalled.')
  }
  return <section aria-label="Campaign runs">
    <PageHeader title={`${data?.campaign.name ?? 'Campaign'} · Runs`} subtitle="Consent-based single-message runs for this campaign" actions={<><Link to={`/outreach/campaigns/${campaignId}`} className={linkClass}>Campaign details</Link><Button size="xs" onClick={() => setRevision((value) => value + 1)}>Refresh status</Button></>} />
    <div className="space-y-6">
    {!available && <p role="status" className="text-sm text-zinc-500">Campaign runs are unavailable in this connection. No marketing mail can be queued here.</p>}
    {available && !data && !error && <p role="status" className="text-sm text-zinc-500">Loading campaign runs…</p>}
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    {available && data && outreach && <>
      <RunComposer gateway={outreach} campaign={data.campaign} leads={data.leads.items} onCreated={() => setRevision((value) => value + 1)} />
      {data.leads.next_cursor && <Link className={linkClass} to={`?leads_cursor=${encodeURIComponent(data.leads.next_cursor)}`}>Next lead page</Link>}
      <section aria-label="Existing runs" className="space-y-4"><h2 className="text-lg font-medium text-zinc-800 dark:text-white">Run history</h2>
        {data.runs.items.length === 0 && <p className="text-sm text-zinc-500">No runs on this page.</p>}
        {data.runs.items.map((run) => <article key={run.id} className="space-y-3 p-5 rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800">
          <header className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-zinc-800 dark:text-white">{run.subject}</h3><p className="text-xs text-zinc-500">{run.state === 'cancelled' ? 'Cancellation requested' : 'Run queued'} · {run.created_at}{run.simulated ? ' · Simulated' : ''}</p></div>{run.state !== 'cancelled' && <Button size="sm" variant="danger" disabled={busy || !proof} onClick={() => { void cancel(run) }}>Cancel remaining sends</Button>}</header>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">{run.recipients.map((recipient) => <li className="flex flex-wrap justify-between gap-2 py-2" key={recipient.lead_id}><span>{recipient.email}</span><Link className="text-(--color-accent-content) font-medium" to={`/mailboxes/${run.mailbox_id}/send-intents/${recipient.send_id}`}>{recipient.state}{recipient.delivery_state ? ` · ${recipient.delivery_state}` : ''}</Link></li>)}</ul>
        </article>)}
        {data.runs.next_cursor && <Link className={linkClass} to={`?cursor=${encodeURIComponent(data.runs.next_cursor)}`}>Next run page</Link>}
        {(runCursor || leadCursor) && <Link className={linkClass} to={`/outreach/campaigns/${campaignId}/runs`}>First pages</Link>}
      </section>
    </>}
    </div>
  </section>
}
