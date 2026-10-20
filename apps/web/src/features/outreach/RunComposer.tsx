import { useState, type SyntheticEvent } from 'react'
import { useMailboxes } from '@/app/mailboxes'
import { useProtectedRequest } from '@/app/protectedRequest'
import { Button } from '@/ui/Button'
import { CheckboxField, Field, TextArea, TextInput } from '@/ui/Field'
import { newId } from '@/lib/ids'
import { GatewayError, isUncertainWriteOutcome } from '@/data/errors'
import { type Campaign, type Lead, type OutreachGateway } from './contract'
import { campaignRunInputSchema, campaignRunSchema, type CampaignRun } from './runContract'
import { useRunIntent } from './RunIntent'

export function RunComposer({ gateway, campaign, leads, onCreated }: {
  gateway: OutreachGateway; campaign: Campaign; leads: Lead[]; onCreated(run: CampaignRun): void
}) {
  const { request, proof } = useProtectedRequest()
  const mailboxes = useMailboxes()
  const intent = useRunIntent()
  const [attempt, setAttempt] = useState(() => intent.read(campaign.id))
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [mailbox, setMailbox] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const available = mailboxes.status === 'ready' ? mailboxes.mailboxes.filter((item) => item.capabilities.compose && item.capabilities.approve_send) : []
  const locked = busy || attempt !== undefined
  async function submit(event: SyntheticEvent) {
    event.preventDefault()
    if (busy || !proof || !gateway.createCampaignRun || attempt?.runId) return
    const parsed = campaignRunInputSchema.safeParse(attempt?.input ?? {
      operation_id: newId(), expected_campaign_version: campaign.version, mailbox_id: mailbox,
      subject, body_text: body, lead_ids: selected, marketing_confirmed: confirmed,
    })
    if (!parsed.success) { setError('Choose a sending account, 1–25 leads, a subject and message, and confirm marketing consent.'); return }
    // AIDEV-NOTE: Freeze before dispatch; an absent receipt must only replay this exact operation and payload.
    const frozen = { input: parsed.data, runId: null }
    intent.save(campaign.id, frozen); setAttempt(frozen); setBusy(true); setError(null)
    const result = await request(async (context, signal) => {
      const run = campaignRunSchema.parse(await gateway.createCampaignRun!(context, proof, campaign.id, parsed.data, signal))
      if (run.campaign_id !== campaign.id || run.operation_id !== parsed.data.operation_id || run.mailbox_id !== parsed.data.mailbox_id || run.subject !== parsed.data.subject || run.body_text !== parsed.data.body_text ||
        run.recipients.length !== parsed.data.lead_ids.length || run.recipients.some((item) => !parsed.data.lead_ids.includes(item.lead_id))) throw new Error('Campaign run receipt mismatch')
      return run
    })
    if (result.kind === 'stale') return
    setBusy(false)
    if (result.kind === 'ok') {
      const saved = { input: parsed.data, runId: result.value.id }
      intent.save(campaign.id, saved); setAttempt(saved); onCreated(result.value)
    } else {
      const uncertain = isUncertainWriteOutcome(result.error) || (result.error instanceof GatewayError && result.error.kind === 'transport' && result.error.code === 'malformed')
      if (!uncertain) { intent.clear(campaign.id); setAttempt(undefined) }
      setError(uncertain ? 'The run was not confirmed. Retry the original run to recover its receipt. Do not create another run.' : 'The server rejected this run. Refresh consent and campaign details before correcting it.')
    }
  }
  return <form onSubmit={(event) => { void submit(event) }} className="panel space-y-4 p-5" aria-label="Create marketing run">
    <h2 className="text-lg font-semibold">Single-message campaign</h2>
    <p className="text-sm text-muted">Choose up to 25 opted-in leads from this page. Suppression and current consent are checked again by the server. Include your identity and unsubscribe instructions.</p>
    {attempt && <p role="status">{attempt.runId ? 'Run confirmed. View its recipients below.' : 'Original run is preserved in this tab. Retry it unchanged to check its result.'}</p>}
    <Field id="run-mailbox" label="Sending account"><select id="run-mailbox" disabled={locked} className="rounded-lg border border-line bg-surface p-2 text-sm" value={attempt?.input.mailbox_id ?? mailbox} onChange={(event) => setMailbox(event.target.value)}><option value="">Choose an account</option>{available.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></Field>
    {available.length === 0 && <p role="status">No account currently grants compose and send approval access.</p>}
    <Field id="run-subject" label="Subject"><TextInput id="run-subject" value={attempt?.input.subject ?? subject} disabled={locked} maxLength={998} onChange={(event) => setSubject(event.target.value)} /></Field>
    <Field id="run-body" label="Plain-text message"><TextArea id="run-body" value={attempt?.input.body_text ?? body} disabled={locked} maxLength={65_536} onChange={(event) => setBody(event.target.value)} /></Field>
    <fieldset disabled={locked} className="space-y-2"><legend className="mb-2 text-sm font-semibold">Recipients ({attempt?.input.lead_ids.length ?? selected.length}/25)</legend>
      {leads.length === 0 && <p className="text-sm text-muted">No leads on this page. Add leads and record consent first.</p>}
      {leads.map((lead) => <div key={lead.id}><CheckboxField id={`run-lead-${lead.id}`} label={`${lead.email} · ${lead.suppressed ? 'suppressed' : lead.consent_status}`} checked={(attempt?.input.lead_ids ?? selected).includes(lead.id)} disabled={locked || lead.suppressed || lead.consent_status !== 'granted' || (selected.length >= 25 && !selected.includes(lead.id))} onChange={(event) => setSelected((items) => event.target.checked ? [...items, lead.id] : items.filter((id) => id !== lead.id))} /></div>)}
    </fieldset>
    <CheckboxField id="run-confirm" label="I confirm these recipients opted into this marketing message and I have provided an unsubscribe method." checked={attempt ? true : confirmed} disabled={locked} onChange={(event) => setConfirmed(event.target.checked)} />
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {attempt?.runId ? <Button onClick={() => { intent.clear(campaign.id); setAttempt(undefined); setConfirmed(false); setSelected([]) }}>Prepare another run</Button> : <Button type="submit" disabled={busy || !proof || !gateway.createCampaignRun || (!attempt && (available.length === 0 || campaign.status !== 'draft'))}>{busy ? 'Confirming run…' : attempt ? 'Retry original run' : 'Queue marketing run'}</Button>}
    {campaign.status === 'paused' && <p className="text-sm text-muted">This campaign is paused. New runs cannot start.</p>}
    <p className="text-xs text-muted">A queued or accepted message is not proof of delivery. Cancellation cannot recall mail already accepted.</p>
  </form>
}
