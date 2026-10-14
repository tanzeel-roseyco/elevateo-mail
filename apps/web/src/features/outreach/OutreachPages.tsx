import { useEffect, useRef, useState, type FormEvent, type ReactNode, type SyntheticEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import type { CsrfProof, ReadContext } from '@/data/gateway'
import { GatewayError, isApiError, isUncertainWriteOutcome } from '@/data/errors'
import { Button } from '@/ui/Button'
import { Field, TextInput } from '@/ui/Field'
import {
  accountPageSchema, accountSchema, addLeadInputSchema, analyticsPageSchema,
  campaignPageSchema, campaignSchema, createCampaignInputSchema, leadPageSchema,
  leadSchema, updateCampaignInputSchema, updateLeadInputSchema, type Account, type Analytics,
  type Campaign, type Lead, type OutreachGateway,
} from './contract'

export interface OutreachPageProps {
  gateway?: OutreachGateway
  context?: ReadContext
  proof?: CsrfProof
}

type Load<T> = { status: 'loading' } | { status: 'unavailable' } | { status: 'error' } | { status: 'ready'; value: T }
type Resource = 'campaigns' | 'campaign' | 'leads' | 'accounts' | 'account' | 'analytics'
const schemas = {
  campaigns: campaignPageSchema, campaign: campaignSchema, leads: leadPageSchema,
  accounts: accountPageSchema, account: accountSchema, analytics: analyticsPageSchema,
}

// AIDEV-NOTE: Context key resets protected data immediately; abort drops late read outcomes.
// Cassian's gateway retains transport validation and central 401/context-change policy.
function useOutreachRead<K extends Resource>(kind: K, props: OutreachPageProps, id?: string, revision = 0): Load<z.infer<(typeof schemas)[K]>> {
  const { gateway, context } = props
  const [state, setState] = useState<Load<z.infer<(typeof schemas)[K]>>>({ status: 'loading' })
  useEffect(() => {
    if (!gateway || !context || (['campaign', 'leads', 'accounts', 'account', 'analytics'].includes(kind) && !id)) {
      setState({ status: 'unavailable' }); return
    }
    const controller = new AbortController()
    setState({ status: 'loading' })
    const request = (() => {
      switch (kind) {
        case 'campaigns': return gateway.listCampaigns(context, controller.signal)
        case 'campaign': return gateway.getCampaign(context, id!, controller.signal)
        case 'leads': return gateway.listLeads(context, id!, controller.signal)
        case 'accounts': return gateway.listAccounts(context, id!, controller.signal)
        case 'account': {
          const [campaignId, accountId] = id!.split(':')
          if (!campaignId || !accountId) throw new Error('Missing account scope')
          return gateway.getAccount(context, campaignId, accountId, controller.signal)
        }
        case 'analytics': return gateway.listAnalytics(context, id!, controller.signal)
      }
      throw new Error('Unsupported Outreach resource')
    })()
    void request.then((wire) => {
      const parsed = schemas[kind].safeParse(wire)
      const bound = parsed.success && (
        (kind === 'campaign' && parsed.data && 'id' in parsed.data) ? parsed.data.id === id :
        (kind === 'account' && parsed.data && 'id' in parsed.data) ? parsed.data.id === id?.split(':')[1] : true
      )
      if (!controller.signal.aborted) setState(parsed.success && bound ? { status: 'ready', value: parsed.data as z.infer<(typeof schemas)[K]> } : { status: 'error' })
    }).catch(() => { if (!controller.signal.aborted) setState({ status: 'error' }) })
    return () => controller.abort()
  }, [gateway, context, kind, id, revision])
  return state
}

function Content<T>({ state, empty, children }: { state: Load<T>; empty?: (value: T) => boolean; children: (value: T) => ReactNode }) {
  if (state.status === 'loading') return <p role="status">Loading…</p>
  if (state.status === 'unavailable') return <p role="status">Outreach API unavailable for this account.</p>
  if (state.status === 'error') return <p role="alert">Unable to load this Outreach resource. Please try again later.</p>
  if (empty?.(state.value)) return <p role="status">Nothing here yet.</p>
  return <>{children(state.value)}</>
}
function Page({ title, children }: { title: string; children: ReactNode }) {
  return <section aria-label={title} className="mx-auto max-w-3xl space-y-4 p-4">
    <header><h1 className="text-xl font-semibold">{title}</h1><p>Outreach is draft or paused. Sending and enrollment are unavailable.</p></header>
    {children}
  </section>
}
function ActionError({ message }: { message: string | null }) { return message && <p role="alert">{message}</p> }
function writeFailure(error: unknown): { message: string; lock: boolean } {
  if (isApiError(error, 'unauthenticated') || isApiError(error, 'context_changed') || isApiError(error, 'not_available')) {
    return { message: 'Access changed or this resource is unavailable. Leave this page and sign in or reopen the campaign.', lock: true }
  }
  if (isUncertainWriteOutcome(error) || (error instanceof GatewayError && error.kind === 'transport' && error.code === 'malformed')) {
    return { message: 'Change was not confirmed. Check the saved resource before trying again.', lock: true }
  }
  return { message: 'The server rejected this change. Review the fields and try again.', lock: false }
}
const scopeKey = ({ context }: OutreachPageProps) => `${context?.contextId ?? ''}:${context?.authorizationVersion ?? ''}`

export function OutreachCampaignsPage(props: OutreachPageProps) {
  return <CampaignList key={scopeKey(props)} {...props} />
}
function CampaignList(props: OutreachPageProps) {
  const state = useOutreachRead('campaigns', props)
  return <Page title="Campaigns">
    <Link to="/outreach/campaigns/new">Create draft campaign</Link>
    <Content state={state} empty={(page) => page.items.length === 0}>{(page) => <ul className="space-y-2">{page.items.map((campaign) =>
      <li key={campaign.id}><Link to={`/outreach/campaigns/${campaign.id}`}>{campaign.name}</Link> · {campaign.status}</li>)}</ul>}</Content>
  </Page>
}

export function OutreachCampaignCreatePage(props: OutreachPageProps) {
  return <CampaignCreate key={scopeKey(props)} {...props} />
}
function CampaignCreate({ gateway, context, proof }: OutreachPageProps) {
  const navigate = useNavigate()
  const pending = useRef<AbortController | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!gateway || !context || !proof || busy || uncertain) return
    const input = createCampaignInputSchema.safeParse({ name: name.trim(), status: 'draft' })
    if (!input.success) { setError('Enter a campaign name of 1 to 200 characters.'); return }
    const controller = new AbortController(); pending.current = controller
    setBusy(true); setError(null)
    try {
      const result = campaignSchema.parse(await gateway.createCampaign(context, proof, input.data, controller.signal))
      if (!controller.signal.aborted) navigate(`/outreach/campaigns/${result.id}`)
    } catch (failure) {
      if (!controller.signal.aborted) { const outcome = writeFailure(failure); setError(outcome.message); setUncertain(outcome.lock) }
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <Page title="Create campaign"><form onSubmit={(event) => { void submit(event) }} className="space-y-3">
    <Field id="campaign-name" label="Campaign name"><TextInput id="campaign-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required /></Field>
    <p>New campaigns remain drafts. This form cannot start sending.</p>
    <ActionError message={error} />
    <Button type="submit" disabled={!gateway || !context || !proof || busy || uncertain}>{busy ? 'Saving…' : 'Save draft'}</Button>
    {uncertain && <Link to="/outreach/campaigns">Check campaign list</Link>}
  </form></Page>
}

export function OutreachCampaignDetailPage(props: OutreachPageProps) {
  const { campaignId } = useParams<{ campaignId: string }>()
  return <CampaignDetail key={`${scopeKey(props)}:${campaignId}`} {...props} campaignId={campaignId} />
}
function CampaignDetail({ campaignId, ...props }: OutreachPageProps & { campaignId?: string }) {
  const [revision, setRevision] = useState(0)
  const state = useOutreachRead('campaign', props, campaignId, revision)
  const pending = useRef<AbortController | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  async function update(event: SyntheticEvent, campaign: Campaign, status: 'draft' | 'paused') {
    event.preventDefault()
    if (!props.gateway || !props.context || !props.proof || !campaignId || busy || uncertain) return
    const input = updateCampaignInputSchema.safeParse({ name: name.trim() || campaign.name, status })
    if (!input.success) { setError('Enter a valid campaign name.'); return }
    const controller = new AbortController(); pending.current = controller
    setBusy(true); setError(null)
    try {
      const result = campaignSchema.parse(await props.gateway.updateCampaign(props.context, props.proof, campaignId, input.data, controller.signal))
      if (result.id !== campaignId || result.status !== status || result.name !== input.data.name) throw new Error('Campaign receipt mismatch')
      if (!controller.signal.aborted) setRevision((value) => value + 1)
    } catch (failure) { if (!controller.signal.aborted) { const outcome = writeFailure(failure); setError(outcome.message); setUncertain(outcome.lock) } }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <Page title="Campaign detail"><Content state={state}>{(campaign) => <>
    <p><strong>{campaign.name}</strong> · {campaign.status}</p>
    <nav aria-label="Campaign sections" className="flex gap-4">
      <Link to={`/outreach/campaigns/${campaign.id}/leads`}>Leads</Link>
      <Link to={`/outreach/campaigns/${campaign.id}/accounts`}>Accounts</Link>
      <Link to={`/outreach/campaigns/${campaign.id}/analytics`}>Analytics</Link>
    </nav>
    <form onSubmit={(event) => { void update(event, campaign, campaign.status) }} className="space-y-3">
      <Field id="edit-campaign-name" label="Campaign name"><TextInput id="edit-campaign-name" value={name} placeholder={campaign.name} onChange={(event) => setName(event.target.value)} maxLength={200} /></Field>
      <ActionError message={error} />
      <Button type="submit" disabled={!props.gateway || !props.proof || busy || uncertain}>Save changes</Button>
      {campaign.status === 'draft' && <Button disabled={!props.gateway || !props.proof || busy || uncertain} onClick={(event) => { void update(event, campaign, 'paused') }}>Pause campaign</Button>}
      {uncertain && <Link to="/outreach/campaigns">Check campaign list</Link>}
    </form>
  </>}</Content></Page>
}

export function OutreachLeadsPage(props: OutreachPageProps) { return <CampaignChooser key={scopeKey(props)} {...props} section="leads" /> }
export function OutreachAnalyticsPage(props: OutreachPageProps) { return <CampaignChooser key={scopeKey(props)} {...props} section="analytics" /> }
function CampaignChooser({ section, ...props }: OutreachPageProps & { section: 'leads' | 'accounts' | 'analytics' }) {
  const state = useOutreachRead('campaigns', props)
  return <Page title={section === 'leads' ? 'Leads' : section === 'accounts' ? 'Accounts' : 'Analytics'}><p>Select a campaign.</p>
    <Content state={state} empty={(page) => page.items.length === 0}>{(page) => <ul>{page.items.map((campaign) =>
      <li key={campaign.id}><Link to={`/outreach/campaigns/${campaign.id}/${section}`}>{campaign.name}</Link></li>)}</ul>}</Content>
  </Page>
}

export function OutreachCampaignLeadsPage(props: OutreachPageProps) {
  const { campaignId } = useParams<{ campaignId: string }>()
  return <CampaignLeads key={`${scopeKey(props)}:${campaignId}`} {...props} campaignId={campaignId} />
}
function CampaignLeads({ campaignId, ...props }: OutreachPageProps & { campaignId?: string }) {
  const [revision, setRevision] = useState(0)
  const state = useOutreachRead('leads', props, campaignId, revision)
  const pending = useRef<AbortController | null>(null)
  const [email, setEmail] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!props.gateway || !props.context || !props.proof || !campaignId || busy || uncertain) return
    const input = editId ? updateLeadInputSchema.safeParse({ email: email.trim() }) : addLeadInputSchema.safeParse({ campaign_id: campaignId, email: email.trim() })
    if (!input.success) { setError('Enter a valid email address.'); return }
    const controller = new AbortController(); pending.current = controller
    setBusy(true); setError(null)
    try {
      const result = editId
        ? await props.gateway.updateLead(props.context, props.proof, editId, updateLeadInputSchema.parse(input.data), controller.signal)
        : await props.gateway.addLead(props.context, props.proof, addLeadInputSchema.parse(input.data), controller.signal)
      const saved = leadSchema.parse(result)
      if (editId && saved.id !== editId) throw new Error('Lead identity mismatch')
      if (saved.email !== input.data.email) throw new Error('Lead receipt mismatch')
      if (!controller.signal.aborted) { setEmail(''); setEditId(null); setRevision((value) => value + 1) }
    } catch (failure) { if (!controller.signal.aborted) { const outcome = writeFailure(failure); setError(outcome.message); setUncertain(outcome.lock) } }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <Page title="Campaign leads"><Content state={state} empty={(page) => page.items.length === 0}>{(page) => <ul className="space-y-2">{page.items.map((lead: Lead) =>
    <li key={lead.id}>{lead.email} · consent {lead.consent_status} · {lead.suppressed ? 'suppressed' : 'not suppressed (server report)'}
      <Button onClick={() => { setEditId(lead.id); setEmail(lead.email) }}>Edit address</Button></li>)}</ul>}</Content>
    <form onSubmit={(event) => { void save(event) }} className="space-y-3">
      <Field id="lead-email" label={editId ? 'Edit lead email' : 'Add lead email'}><TextInput id="lead-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
      <p>Adding or editing an address does not grant consent or enroll it for sending.</p>
      <ActionError message={error} />
      <Button type="submit" disabled={!props.gateway || !props.context || !props.proof || busy || uncertain}>{busy ? 'Saving…' : editId ? 'Save address' : 'Add lead'}</Button>
      {editId && <Button onClick={() => { setEditId(null); setEmail('') }}>Cancel edit</Button>}
      {uncertain && <Link to={`/outreach/campaigns/${campaignId}`}>Check campaign</Link>}
    </form>
  </Page>
}

export function OutreachAccountsPage(props: OutreachPageProps) { return <CampaignChooser key={scopeKey(props)} {...props} section="accounts" /> }
export function OutreachCampaignAccountsPage(props: OutreachPageProps) {
  const { campaignId } = useParams<{ campaignId: string }>()
  return <AccountList key={`${scopeKey(props)}:${campaignId}`} {...props} campaignId={campaignId} />
}
function AccountList({ campaignId, ...props }: OutreachPageProps & { campaignId?: string }) {
  const state = useOutreachRead('accounts', props, campaignId)
  return <Page title="Outreach accounts"><Content state={state} empty={(page) => page.items.length === 0}>{(page) => <ul>{page.items.map((account: Account) =>
    <li key={account.id}><Link to={`/outreach/campaigns/${campaignId}/accounts/${account.id}`}>{account.label}</Link> · disabled</li>)}</ul>}</Content></Page>
}
export function OutreachAccountDetailPage(props: OutreachPageProps) {
  const { campaignId, accountId } = useParams<{ campaignId: string; accountId: string }>()
  return <AccountDetail key={`${scopeKey(props)}:${campaignId}:${accountId}`} {...props} campaignId={campaignId} accountId={accountId} />
}
function AccountDetail({ campaignId, accountId, ...props }: OutreachPageProps & { campaignId?: string; accountId?: string }) {
  const state = useOutreachRead('account', props, campaignId && accountId ? `${campaignId}:${accountId}` : undefined)
  return <Page title="Outreach account"><Content state={state}>{(account) => <>
    <p><strong>{account.label}</strong> · {account.status}</p><p>Mailbox {account.mailbox_id}</p>
    <p>This account cannot be activated here.</p>
  </>}</Content></Page>
}
export function OutreachCampaignAnalyticsPage(props: OutreachPageProps) {
  const { campaignId } = useParams<{ campaignId: string }>()
  return <CampaignAnalytics key={`${scopeKey(props)}:${campaignId}`} {...props} campaignId={campaignId} />
}
function CampaignAnalytics({ campaignId, ...props }: OutreachPageProps & { campaignId?: string }) {
  const state = useOutreachRead('analytics', props, campaignId)
  return <Page title="Campaign analytics"><Content state={state} empty={(page) => page.items.length === 0}>{(page) => <ul>{page.items.map((row: Analytics) =>
    <li key={row.campaign_id}>{row.consented_count} consented of {row.lead_count} leads (server aggregate)</li>)}</ul>}</Content></Page>
}
