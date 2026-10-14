import { useEffect, useState, type ReactNode } from 'react'
import type { z } from 'zod'
import type { ReadContext } from '@/data/gateway'
import {
  accountPageSchema,
  analyticsPageSchema,
  campaignPageSchema,
  leadPageSchema,
  type OutreachReads,
} from './contract'

type ReadState<T> =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; items: T[] }

function ResourcePage<T>({ title, reader, context, schema, renderItem }: {
  title: string
  reader?: (ctx: ReadContext, signal: AbortSignal) => Promise<unknown>
  context?: ReadContext
  schema: z.ZodType<{ items: T[] }>
  renderItem: (item: T) => ReactNode
}) {
  const [state, setState] = useState<ReadState<T>>({ status: 'unavailable' })
  useEffect(() => {
    if (!reader || !context) { setState({ status: 'unavailable' }); return }
    const controller = new AbortController()
    setState({ status: 'loading' })
    void reader(context, controller.signal).then((value) => {
      const result = schema.safeParse(value)
      if (!controller.signal.aborted) setState(result.success ? { status: 'ready', items: result.data.items } : { status: 'error' })
    }).catch(() => { if (!controller.signal.aborted) setState({ status: 'error' }) })
    return () => controller.abort()
  }, [reader, context, schema])

  return <section aria-labelledby="outreach-title" className="space-y-4 p-6">
    <header><h1 id="outreach-title" className="text-2xl font-semibold">{title}</h1>
      <p>Outreach is paused. Sending and enrollment are unavailable.</p></header>
    {state.status === 'loading' && <p role="status">Loading {title.toLowerCase()}…</p>}
    {state.status === 'unavailable' && <p role="status">{title} are unavailable until the Outreach API is connected.</p>}
    {state.status === 'error' && <p role="alert">Could not load {title.toLowerCase()}. Try again later.</p>}
    {state.status === 'ready' && (state.items.length === 0
      ? <p role="status">No {title.toLowerCase()} yet.</p>
      : <ul className="space-y-2">{state.items.map((item, index) => <li key={index} className="rounded border p-3">{renderItem(item)}</li>)}</ul>)}
  </section>
}

export interface OutreachPageProps { reads?: OutreachReads; context?: ReadContext }
export function OutreachCampaignsPage({ reads, context }: OutreachPageProps) {
  return <ResourcePage key={`${context?.contextId}:${context?.authorizationVersion}`} title="Campaigns" reader={reads?.listCampaigns} context={context} schema={campaignPageSchema} renderItem={(item) => <><strong>{item.name}</strong> · {item.status}</>} />
}
export function OutreachLeadsPage({ reads, context }: OutreachPageProps) {
  return <ResourcePage key={`${context?.contextId}:${context?.authorizationVersion}`} title="Leads" reader={reads?.listLeads} context={context} schema={leadPageSchema} renderItem={(item) => <>{item.email} · consent: {item.consent_status} · {item.suppressed ? 'suppressed' : 'not suppressed (server report)'}</>} />
}
export function OutreachAccountsPage({ reads, context }: OutreachPageProps) {
  return <ResourcePage key={`${context?.contextId}:${context?.authorizationVersion}`} title="Accounts" reader={reads?.listAccounts} context={context} schema={accountPageSchema} renderItem={(item) => <>{item.label} · {item.status}</>} />
}
export function OutreachAnalyticsPage({ reads, context }: OutreachPageProps) {
  return <ResourcePage key={`${context?.contextId}:${context?.authorizationVersion}`} title="Analytics" reader={reads?.listAnalytics} context={context} schema={analyticsPageSchema} renderItem={(item) => <>{item.consented_count} consented of {item.lead_count} leads · campaign {item.campaign_id}</>} />
}
