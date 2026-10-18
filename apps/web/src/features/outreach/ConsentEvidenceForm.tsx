import { useEffect, useRef, useState, type FormEvent } from 'react'
import { newId } from '@/lib/ids'
import { Button } from '@/ui/Button'
import { CheckboxField, Field, TextInput } from '@/ui/Field'
import { consentEvidenceInputSchema, leadSchema, type Lead, type OutreachGateway } from './contract'
import type { OutreachPageProps } from './OutreachPages'
import { isAccessLoss, writeFailure } from './writeFailure'

/** Records a human assertion for backend review. It never grants send or enrollment capability. */
export function ConsentEvidenceForm({ lead, campaignId, gateway, context, proof, onSaved, onAccessLost, initialSource = '' }: OutreachPageProps & {
  lead: Lead; campaignId: string; gateway?: OutreachGateway; onSaved(): void; onAccessLost(): void; initialSource?: string
}) {
  const [source, setSource] = useState(initialSource)
  const [localTime, setLocalTime] = useState('')
  const [attested, setAttested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  if (!gateway?.recordConsent || lead.consent_status === 'granted') return null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!gateway?.recordConsent || !context || !proof || busy || locked) return
    let observedAt: string
    try { observedAt = new Date(localTime).toISOString().replace(/\.\d{3}Z$/, 'Z') }
    catch { setError('Enter a valid date and time for the observed consent.'); return }
    const input = consentEvidenceInputSchema.safeParse({
      operation_id: newId(), expected_version: lead.version, source: source.trim(), observed_at: observedAt, attested,
    })
    if (!input.success) { setError('Provide a source, observed time and explicit attestation.'); return }
    const controller = new AbortController(); pending.current = controller
    setBusy(true); setError(null)
    try {
      const saved = leadSchema.parse(await gateway.recordConsent(context, proof, campaignId, lead.id, input.data, controller.signal))
      if (saved.id !== lead.id || saved.campaign_id !== campaignId || saved.consent_status !== 'granted' || saved.version <= lead.version) {
        throw new Error('Consent evidence receipt mismatch')
      }
      if (!controller.signal.aborted) onSaved()
    } catch (failure) {
      if (!controller.signal.aborted) {
        const outcome = writeFailure(failure); setError(outcome.message); setLocked(outcome.lock)
        if (isAccessLoss(failure)) onAccessLost()
      }
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <form onSubmit={(event) => { void submit(event) }} className="space-y-2 rounded border p-3" aria-label={`Consent evidence for ${lead.email}`}>
    <p>Record observed consent evidence. The backend will assess it; this does not authorize sending.</p>
    <Field id={`consent-source-${lead.id}`} label="Evidence source"><TextInput id={`consent-source-${lead.id}`} value={source} maxLength={200} onChange={(event) => setSource(event.target.value)} required /></Field>
    <Field id={`consent-time-${lead.id}`} label="Observed date and time (local)"><TextInput id={`consent-time-${lead.id}`} type="datetime-local" value={localTime} onChange={(event) => setLocalTime(event.target.value)} required /></Field>
    <CheckboxField id={`consent-attested-${lead.id}`} label="I attest that this source records the lead's consent" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
    {error && <p role="alert">{error}</p>}
    <Button type="submit" disabled={!context || !proof || busy || locked}>{busy ? 'Recording…' : 'Record evidence'}</Button>
    {locked && <p>Outcome is uncertain. Reopen this campaign before any further attempt.</p>}
  </form>
}
