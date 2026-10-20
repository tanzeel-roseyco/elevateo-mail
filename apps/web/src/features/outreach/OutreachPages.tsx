import { useEffect, useRef, useState, type FormEvent, type ReactNode, type SyntheticEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { z } from 'zod'
import type { CsrfProof, ReadContext } from '@/data/gateway'
import { isApiError } from '@/data/errors'
import { Badge } from '@/ui/Badge'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { Button, buttonClass } from '@/ui/Button'
import { PaperAirplaneIcon, RectangleStackIcon } from '@/ui/icons'
import { PageHeader } from '@/ui/PageHeader'
import { linkClass } from '@/ui/Text'
import { Field, TextInput } from '@/ui/Field'
import { cx } from '@/lib/format'
import { newId } from '@/lib/ids'
import {
  accountPageSchema, accountSchema, addLeadInputSchema, analyticsSchema,
  campaignPageSchema, campaignSchema, createCampaignInputSchema, leadPageSchema,
  leadSchema, updateCampaignInputSchema, updateLeadInputSchema, type Account, type Analytics,
  type Campaign, type Lead, type OutreachGateway,
} from './contract'
import { isAccessLoss, writeFailure } from './writeFailure'
import { ConsentEvidenceForm } from './ConsentEvidenceForm'
import { validateLeadIntake } from '@/domain/sendConsent'

export interface OutreachPageProps {
  gateway?: OutreachGateway
  context?: ReadContext
  proof?: CsrfProof
}

type Load<T> = { status: 'loading' } | { status: 'unavailable' } | { status: 'error' } | { status: 'ready'; value: T }
type Resource = 'campaigns' | 'campaign' | 'leads' | 'lead' | 'accounts' | 'account' | 'analytics'
const schemas = {
  campaigns: campaignPageSchema, campaign: campaignSchema, leads: leadPageSchema, lead: leadSchema,
  accounts: accountPageSchema, account: accountSchema, analytics: analyticsSchema,
}

// AIDEV-NOTE: Context key resets protected data immediately; abort drops late read outcomes.
// Cassian's gateway retains transport validation and central 401/context-change policy.
function useOutreachRead<K extends Resource>(kind: K, props: OutreachPageProps, id?: string, revision = 0, cursor?: string): Load<z.infer<(typeof schemas)[K]>> {
  const { gateway, context } = props
  const [state, setState] = useState<Load<z.infer<(typeof schemas)[K]>>>({ status: 'loading' })
  useEffect(() => {
    if (!gateway || !context || (['campaign', 'leads', 'lead', 'accounts', 'account', 'analytics'].includes(kind) && !id) || (kind === 'lead' && !gateway.getLead)) {
      setState({ status: 'unavailable' }); return
    }
    if (id) {
      const parts = id.split(':')
      const expectedParts = kind === 'lead' || kind === 'account' ? 2 : 1
      if (parts.length !== expectedParts || !parts.every((part) => z.uuid().safeParse(part).success)) {
        setState({ status: 'error' }); return
      }
    }
    if (cursor && !z.uuid().safeParse(cursor).success) { setState({ status: 'error' }); return }
    const controller = new AbortController()
    setState({ status: 'loading' })
    const request = async () => {
      switch (kind) {
        case 'campaigns': return gateway.listCampaigns(context, cursor ? { cursor } : {}, controller.signal)
        case 'campaign': return gateway.getCampaign(context, id!, controller.signal)
        case 'leads': return gateway.listLeads(context, id!, cursor ? { cursor } : {}, controller.signal)
        case 'lead': {
          const [campaignId, leadId] = id!.split(':')
          return gateway.getLead!(context, campaignId!, leadId!, controller.signal)
        }
        case 'accounts': return gateway.listAccounts(context, id!, cursor ? { cursor } : {}, controller.signal)
        case 'account': {
          const [campaignId, accountId] = id!.split(':')
          return gateway.getAccount(context, campaignId!, accountId!, controller.signal)
        }
        case 'analytics': return gateway.listAnalytics(context, id!, controller.signal)
      }
      throw new Error('Unsupported Outreach resource')
    }
    void request().then((wire) => {
      const parsed = schemas[kind].safeParse(wire)
      const bound = parsed.success && (
        (kind === 'campaign' && parsed.data && 'id' in parsed.data) ? parsed.data.id === id :
        (kind === 'account' && parsed.data && 'id' in parsed.data) ? parsed.data.id === id?.split(':')[1] && 'campaign_id' in parsed.data && parsed.data.campaign_id === id?.split(':')[0] :
        (kind === 'lead' && parsed.data && 'id' in parsed.data) ? parsed.data.id === id?.split(':')[1] && 'campaign_id' in parsed.data && parsed.data.campaign_id === id?.split(':')[0] :
        (kind === 'analytics' && parsed.data && 'campaign_id' in parsed.data) ? parsed.data.campaign_id === id :
        (kind === 'leads' || kind === 'accounts') && parsed.data && 'items' in parsed.data
          ? parsed.data.items.every((item) => 'campaign_id' in item && item.campaign_id === id) : true
      )
      if (!controller.signal.aborted) setState(parsed.success && bound ? { status: 'ready', value: parsed.data as z.infer<(typeof schemas)[K]> } : { status: 'error' })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState(isApiError(error, 'not_available') || isApiError(error, 'temporarily_unavailable')
        ? { status: 'unavailable' } : { status: 'error' })
    })
    return () => controller.abort()
  }, [gateway, context, kind, id, revision, cursor])
  return state
}

// Every Outreach list shares one loading / unavailable / error / empty presentation. The unavailable
// sentence keeps its role="status" text because the registry and shell tests assert it verbatim.
function Content<T>({ state, empty, children }: { state: Load<T>; empty?: (value: T) => boolean; children: (value: T) => ReactNode }) {
  if (state.status === 'loading') return <div role="status" aria-label="Loading Outreach"><Skeleton rows={3} /></div>
  if (state.status === 'unavailable') {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center shadow-xs dark:border-zinc-700 dark:bg-zinc-800">
        <PaperAirplaneIcon aria-hidden className="mx-auto size-5 text-zinc-400" />
        <p role="status" className="mt-3 font-medium text-zinc-800 dark:text-white">Outreach API unavailable for this account.</p>
        <p className="mt-1 text-sm text-zinc-500">Campaign data lives in the Outreach service, which is not connected to this workspace. Your mail, drafts and members are unaffected.</p>
        <Link to="/" className={cx(buttonClass('outline', 'md'), 'mt-4')}>Back to dashboard</Link>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <ErrorState
        title="Outreach could not be loaded"
        body="The Outreach service did not answer. Reload to try again; nothing was changed."
        action={<Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>}
      />
    )
  }
  if (empty?.(state.value)) return <EmptyState icon={<RectangleStackIcon className="size-5" />} title="Nothing here yet" body="Items appear here as soon as they exist in Outreach. Create the first one from this page." />
  return <>{children(state.value)}</>
}
function Page({ title, children }: { title: string; children: ReactNode }) {
  return <section aria-label={title}>
    <PageHeader title={title} subtitle="Campaign settings are draft or paused. Open Marketing runs for supported consent-based sending." />
    <div className="max-w-3xl space-y-6">{children}</div>
  </section>
}
function ActionError({ message }: { message: string | null }) { return message && <p role="alert" className="text-sm font-medium text-red-500">{message}</p> }
const scopeKey = ({ context }: OutreachPageProps) => `${context?.contextId ?? ''}:${context?.authorizationVersion ?? ''}`

export function OutreachCampaignsPage(props: OutreachPageProps) {
  const [search] = useSearchParams()
  return <CampaignList key={`${scopeKey(props)}:${search.get('cursor') ?? ''}`} {...props} />
}
function CampaignList(props: OutreachPageProps) {
  const [search] = useSearchParams()
  const cursor = search.get('cursor') ?? undefined
  const state = useOutreachRead('campaigns', props, undefined, 0, cursor)
  return <Page title="Campaigns">
    {state.status === 'ready' && <Link to="/outreach/campaigns/new" className={buttonClass('primary', 'md')}>Create draft campaign</Link>}
    <Content state={state} empty={(page) => page.items.length === 0 && page.next_cursor === null}>{(page) => <>
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800">{page.items.map((campaign) =>
        <li key={campaign.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><Link className={linkClass} to={`/outreach/campaigns/${campaign.id}`}>{campaign.name}</Link><Badge tone={campaign.status === 'paused' ? 'warn' : 'neutral'} size="sm">{campaign.status}</Badge></li>)}</ul>
      {page.next_cursor && <Link className={linkClass} to={`?cursor=${encodeURIComponent(page.next_cursor)}`}>Next campaign page</Link>}
    </>}</Content>
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
    const input = createCampaignInputSchema.safeParse({ id: newId(), operation_id: newId(), name: name.trim(), status: 'draft' })
    if (!input.success) { setError('Enter a campaign name of 1 to 160 characters.'); return }
    const controller = new AbortController(); pending.current = controller
    setBusy(true); setError(null)
    try {
      const result = campaignSchema.parse(await gateway.createCampaign(context, proof, input.data, controller.signal))
      if (result.id !== input.data.id) throw new Error('Campaign receipt mismatch')
      if (!controller.signal.aborted) navigate(`/outreach/campaigns/${result.id}`)
    } catch (failure) {
      if (!controller.signal.aborted) { const outcome = writeFailure(failure); setError(outcome.message); setUncertain(outcome.lock) }
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <Page title="Create campaign"><form onSubmit={(event) => { void submit(event) }} className="space-y-4 p-6 rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800">
    <Field id="campaign-name" label="Campaign name"><TextInput id="campaign-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required /></Field>
    <p className="text-sm text-zinc-600 dark:text-zinc-400">New campaigns remain drafts. This form cannot start sending.</p>
    <ActionError message={error} />
    <Button type="submit" variant="primary" disabled={!gateway || !context || !proof || busy || uncertain}>{busy ? 'Saving…' : 'Save draft'}</Button>
    {uncertain && <Link className={linkClass} to="/outreach/campaigns">Check campaign list</Link>}
  </form></Page>
}

export function OutreachCampaignDetailPage(props: OutreachPageProps) {
  const { campaignId } = useParams<{ campaignId: string }>()
  return <CampaignDetail key={`${scopeKey(props)}:${campaignId}`} {...props} campaignId={campaignId} />
}
function CampaignDetail({ campaignId, ...props }: OutreachPageProps & { campaignId: string | undefined }) {
  const [revision, setRevision] = useState(0)
  const state = useOutreachRead('campaign', props, campaignId, revision)
  const pending = useRef<AbortController | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [accessLost, setAccessLost] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  async function update(event: SyntheticEvent, campaign: Campaign, status: 'draft' | 'paused') {
    event.preventDefault()
    if (!props.gateway || !props.context || !props.proof || !campaignId || busy || uncertain) return
    const input = updateCampaignInputSchema.safeParse({ operation_id: newId(), expected_version: campaign.version, name: name.trim() || campaign.name, status })
    if (!input.success) { setError('Enter a valid campaign name.'); return }
    const controller = new AbortController(); pending.current = controller
    setBusy(true); setError(null)
    try {
      const result = campaignSchema.parse(await props.gateway.updateCampaign(props.context, props.proof, campaignId, input.data, controller.signal))
      if (result.id !== campaignId || result.status !== status || result.name !== input.data.name) throw new Error('Campaign receipt mismatch')
      if (!controller.signal.aborted) setRevision((value) => value + 1)
    } catch (failure) { if (!controller.signal.aborted) { const outcome = writeFailure(failure); setError(outcome.message); setUncertain(outcome.lock); if (isAccessLoss(failure)) setAccessLost(true) } }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <Page title="Campaign detail">{accessLost ? <p role="alert">Campaign access changed. Reopen it after your session is refreshed.</p> : <Content state={state}>{(campaign) => <>
    <p className="text-sm text-zinc-800 dark:text-white"><strong>{campaign.name}</strong> · {campaign.status}</p>
    <nav aria-label="Campaign sections" className="flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-700">
      <Link className="inline-flex h-9 items-center border-b-2 border-transparent px-3 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-white" to={`/outreach/campaigns/${campaign.id}/sequence`}>Sequence</Link>
      <Link className="inline-flex h-9 items-center border-b-2 border-transparent px-3 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-white" to={`/outreach/campaigns/${campaign.id}/leads`}>Leads</Link>
      <Link className="inline-flex h-9 items-center border-b-2 border-transparent px-3 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-white" to={`/outreach/campaigns/${campaign.id}/accounts`}>Accounts</Link>
      <Link className="inline-flex h-9 items-center border-b-2 border-transparent px-3 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-white" to={`/outreach/campaigns/${campaign.id}/analytics`}>Analytics</Link>
      <Link className="inline-flex h-9 items-center border-b-2 border-transparent px-3 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-white" to={`/outreach/campaigns/${campaign.id}/runs`}>Marketing runs</Link>
    </nav>
    <form onSubmit={(event) => { void update(event, campaign, campaign.status) }} className="space-y-4 p-6 rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800">
      <Field id="edit-campaign-name" label="Campaign name"><TextInput id="edit-campaign-name" value={name} placeholder={campaign.name} onChange={(event) => setName(event.target.value)} maxLength={160} /></Field>
      <ActionError message={error} />
      <Button type="submit" variant="primary" disabled={!props.gateway || !props.proof || busy || uncertain}>Save changes</Button>
      {campaign.status === 'draft' && <Button disabled={!props.gateway || !props.proof || busy || uncertain} onClick={(event) => { void update(event, campaign, 'paused') }}>Pause campaign</Button>}
      {uncertain && <Link className={linkClass} to="/outreach/campaigns">Check campaign list</Link>}
    </form>
  </>}</Content>}</Page>
}

export function OutreachLeadsPage(props: OutreachPageProps) {
  const [search] = useSearchParams()
  return <CampaignChooser key={`${scopeKey(props)}:${search.get('cursor') ?? ''}`} {...props} section="leads" />
}
export function OutreachAnalyticsPage(props: OutreachPageProps) {
  const [search] = useSearchParams()
  return <CampaignChooser key={`${scopeKey(props)}:${search.get('cursor') ?? ''}`} {...props} section="analytics" />
}
function CampaignChooser({ section, ...props }: OutreachPageProps & { section: 'leads' | 'accounts' | 'analytics' }) {
  const [search] = useSearchParams()
  const state = useOutreachRead('campaigns', props, undefined, 0, search.get('cursor') ?? undefined)
  return <Page title={section === 'leads' ? 'Leads' : section === 'accounts' ? 'Accounts' : 'Analytics'}><p className="text-sm text-zinc-600 dark:text-zinc-400">Select a campaign.</p>
    <Content state={state} empty={(page) => page.items.length === 0 && page.next_cursor === null}>{(page) => <>
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800">{page.items.map((campaign) => <li key={campaign.id} className="px-4 py-3 text-sm"><Link className={linkClass} to={`/outreach/campaigns/${campaign.id}/${section}`}>{campaign.name}</Link></li>)}</ul>
      {page.next_cursor && <Link className={linkClass} to={`?cursor=${encodeURIComponent(page.next_cursor)}`}>Next campaign page</Link>}
    </>}</Content>
  </Page>
}

export function OutreachCampaignLeadsPage(props: OutreachPageProps) {
  const { campaignId } = useParams<{ campaignId: string }>()
  const [search] = useSearchParams()
  return <CampaignLeads key={`${scopeKey(props)}:${campaignId}:${search.get('cursor') ?? ''}`} {...props} campaignId={campaignId} />
}
function CampaignLeads({ campaignId, ...props }: OutreachPageProps & { campaignId: string | undefined }) {
  const [search] = useSearchParams()
  const cursor = search.get('cursor') ?? undefined
  const [revision, setRevision] = useState(0)
  const state = useOutreachRead('leads', props, campaignId, revision, cursor)
  const pending = useRef<AbortController | null>(null)
  const [email, setEmail] = useState('')
  const [consentSource, setConsentSource] = useState('')
  const [intakeSource, setIntakeSource] = useState<{ leadId: string; source: string } | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [consentId, setConsentId] = useState<string | null>(null)
  const [consentSavedId, setConsentSavedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [accessLost, setAccessLost] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!props.gateway || !props.context || !props.proof || !campaignId || busy || uncertain) return
    const selected = state.status === 'ready' ? state.value.items.find((lead) => lead.id === editId) : undefined
    // AIDEV-NOTE: New leads need a stated opt-in source; it prefills the evidence form, it is not consent.
    const intake = editId ? null : validateLeadIntake({ email, consentSource })
    if (intake && !intake.ok) { setError(intake.message); return }
    const input = editId
      ? updateLeadInputSchema.safeParse({ operation_id: newId(), expected_version: selected?.version, email: email.trim().toLowerCase() })
      : addLeadInputSchema.safeParse({ id: newId(), operation_id: newId(), email: email.trim().toLowerCase() })
    if (!input.success) { setError('Enter a valid email address.'); return }
    const controller = new AbortController(); pending.current = controller
    setBusy(true); setError(null)
    try {
      const result = editId
        ? await props.gateway.updateLead(props.context, props.proof, campaignId, editId, updateLeadInputSchema.parse(input.data), controller.signal)
        : await props.gateway.addLead(props.context, props.proof, campaignId, addLeadInputSchema.parse(input.data), controller.signal)
      const saved = leadSchema.parse(result)
      if (editId && saved.id !== editId) throw new Error('Lead identity mismatch')
      if (!editId && saved.id !== addLeadInputSchema.parse(input.data).id) throw new Error('Lead identity mismatch')
      if (saved.campaign_id !== campaignId) throw new Error('Lead campaign mismatch')
      if (saved.email !== input.data.email) throw new Error('Lead receipt mismatch')
      if (!controller.signal.aborted) {
        if (intake?.ok) { setIntakeSource({ leadId: saved.id, source: intake.consentSource }); setConsentSavedId(null); setConsentId(props.gateway.recordConsent ? saved.id : null) }
        setEmail(''); setConsentSource(''); setEditId(null); setRevision((value) => value + 1)
      }
    } catch (failure) { if (!controller.signal.aborted) { const outcome = writeFailure(failure); setError(outcome.message); setUncertain(outcome.lock); if (isAccessLoss(failure)) setAccessLost(true) } }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <Page title="Campaign leads">{accessLost ? <p role="alert">Lead access changed. Reopen this campaign after your session is refreshed.</p> : <><Content state={state} empty={(page) => page.items.length === 0 && page.next_cursor === null}>{(page) => <>
    <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800">{page.items.map((lead: Lead) =>
      <li key={lead.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm"><Link className={linkClass} to={`/outreach/campaigns/${campaignId}/leads/${lead.id}`}>{lead.email}</Link> · consent record {lead.consent_status} (evidence in detail) · {lead.suppressed ? 'suppressed' : 'not suppressed (server report)'}
        <Button size="sm" onClick={() => { setEditId(lead.id); setEmail(lead.email) }}>Edit address</Button>
        {props.gateway?.recordConsent && lead.consent_status !== 'granted' &&
          <Button size="sm" onClick={() => { setConsentSavedId(null); setConsentId((current) => current === lead.id ? null : lead.id) }}>Record consent evidence</Button>}
        {consentSavedId === lead.id && <p role="status">Manual attestation recorded for this lead. Independent verification is not shown; current consent is checked again when a marketing run is queued.</p>}
        {consentId === lead.id && campaignId && <ConsentEvidenceForm key={`${lead.id}:${lead.version}`} lead={lead} campaignId={campaignId} {...props} initialSource={intakeSource?.leadId === lead.id ? intakeSource.source : ''} onSaved={() => { setConsentSavedId(lead.id); setConsentId(null); setRevision((value) => value + 1) }} onAccessLost={() => setAccessLost(true)} />}
      </li>)}</ul>
    {page.next_cursor && <Link className={linkClass} to={`?cursor=${encodeURIComponent(page.next_cursor)}`}>Next leads page</Link>}
  </>}</Content>
    <form onSubmit={(event) => { void save(event) }} className="space-y-4 p-6 rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800">
      <Field id="lead-email" label={editId ? 'Edit lead email' : 'Add lead email'}><TextInput id="lead-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
      {!editId && <Field id="lead-consent-source" label="Consent source (where this person opted in)"><TextInput id="lead-consent-source" value={consentSource} maxLength={200} onChange={(event) => setConsentSource(event.target.value)} required /></Field>}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Adding or editing an address does not grant consent or enroll it for sending. Live Resend sends need recorded consent evidence.</p>
      <ActionError message={error} />
      <Button type="submit" variant="primary" disabled={!props.gateway || !props.context || !props.proof || busy || uncertain}>{busy ? 'Saving…' : editId ? 'Save address' : 'Add lead'}</Button>
      {editId && <Button size="sm" onClick={() => { setEditId(null); setEmail('') }}>Cancel edit</Button>}
      {uncertain && <Link className={linkClass} to={`/outreach/campaigns/${campaignId}`}>Check campaign</Link>}
    </form>
  </>}</Page>
}

export function OutreachLeadDetailPage(props: OutreachPageProps) {
  const { campaignId, leadId } = useParams<{ campaignId: string; leadId: string }>()
  return <LeadDetail key={`${scopeKey(props)}:${campaignId}:${leadId}`} {...props} campaignId={campaignId} leadId={leadId} />
}
function LeadDetail({ campaignId, leadId, ...props }: OutreachPageProps & { campaignId: string | undefined; leadId: string | undefined }) {
  const state = useOutreachRead('lead', props, campaignId && leadId ? `${campaignId}:${leadId}` : undefined)
  return <Page title="Lead detail"><Content state={state}>{(lead) => <>
    <p className="text-sm text-zinc-800 dark:text-white"><strong>{lead.email}</strong></p>
    <p className="text-sm text-zinc-600 dark:text-zinc-400">Consent record: {lead.consent_status}. Suppression: {lead.suppressed ? 'active' : 'not reported by server'}.</p>
    <p className="text-sm text-zinc-600 dark:text-zinc-400">Evidence source: {lead.consent_source ?? 'none recorded'}</p>
    <p className="text-sm text-zinc-600 dark:text-zinc-400">Evidence observed: {lead.consent_recorded_at ?? 'none recorded'}</p>
    <p className="text-sm text-zinc-600 dark:text-zinc-400">Evidence actor: {lead.consent_recorded_by ?? 'none recorded'}</p>
    <p className="text-sm text-zinc-600 dark:text-zinc-400">Evidence kind: {lead.consent_evidence_kind === 'manual_attestation' ? 'manual attestation' : 'none recorded'}</p>
    {lead.consent_evidence_kind === 'manual_attestation' && <p className="text-sm text-zinc-600 dark:text-zinc-400">This consent record is an operator attestation; independent verification is not shown.</p>}
    <p className="text-sm text-zinc-600 dark:text-zinc-400">This record does not authorize sending.</p>
  </>}</Content></Page>
}

export function OutreachAccountsPage(props: OutreachPageProps) {
  const [search] = useSearchParams()
  return <CampaignChooser key={`${scopeKey(props)}:${search.get('cursor') ?? ''}`} {...props} section="accounts" />
}
export function OutreachCampaignAccountsPage(props: OutreachPageProps) {
  const { campaignId } = useParams<{ campaignId: string }>()
  const [search] = useSearchParams()
  return <AccountList key={`${scopeKey(props)}:${campaignId}:${search.get('cursor') ?? ''}`} {...props} campaignId={campaignId} />
}
function AccountList({ campaignId, ...props }: OutreachPageProps & { campaignId: string | undefined }) {
  const [search] = useSearchParams()
  const state = useOutreachRead('accounts', props, campaignId, 0, search.get('cursor') ?? undefined)
  return <Page title="Outreach accounts"><Content state={state} empty={(page) => page.items.length === 0 && page.next_cursor === null}>{(page) => <>
    <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800">{page.items.map((account: Account) => <li key={account.id} className="px-4 py-3 text-sm"><Link className={linkClass} to={`/outreach/campaigns/${campaignId}/accounts/${account.id}`}>{account.label}</Link> · disabled</li>)}</ul>
    {page.next_cursor && <Link className={linkClass} to={`?cursor=${encodeURIComponent(page.next_cursor)}`}>Next accounts page</Link>}
  </>}</Content></Page>
}
export function OutreachAccountDetailPage(props: OutreachPageProps) {
  const { campaignId, accountId } = useParams<{ campaignId: string; accountId: string }>()
  return <AccountDetail key={`${scopeKey(props)}:${campaignId}:${accountId}`} {...props} campaignId={campaignId} accountId={accountId} />
}
function AccountDetail({ campaignId, accountId, ...props }: OutreachPageProps & { campaignId: string | undefined; accountId: string | undefined }) {
  const state = useOutreachRead('account', props, campaignId && accountId ? `${campaignId}:${accountId}` : undefined)
  return <Page title="Outreach account"><Content state={state}>{(account) => <>
    <p className="text-sm text-zinc-800 dark:text-white"><strong>{account.label}</strong> · {account.status}</p><p className="text-sm text-zinc-600 dark:text-zinc-400">Mailbox {account.mailbox_id}</p>
    <p className="text-sm text-zinc-600 dark:text-zinc-400">This account cannot be activated here.</p>
  </>}</Content></Page>
}
export function OutreachCampaignAnalyticsPage(props: OutreachPageProps) {
  const { campaignId } = useParams<{ campaignId: string }>()
  return <CampaignAnalytics key={`${scopeKey(props)}:${campaignId}`} {...props} campaignId={campaignId} />
}
function CampaignAnalytics({ campaignId, ...props }: OutreachPageProps & { campaignId: string | undefined }) {
  const state = useOutreachRead('analytics', props, campaignId)
  return <Page title="Campaign analytics"><Content state={state}>{(row: Analytics) =>
    <p className="text-sm text-zinc-600 dark:text-zinc-400">{row.consented_count} {row.consented_count === 1 ? 'lead' : 'leads'} with granted consent records and no suppression of {row.lead_count} leads (server aggregate; may include manual attestations)</p>}</Content></Page>
}
