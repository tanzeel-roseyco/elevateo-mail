import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { z } from 'zod'
import { GatewayError, isApiError } from '@/data/errors'
import { newId } from '@/lib/ids'
import { Button } from '@/ui/Button'
import { PageHeader } from '@/ui/PageHeader'
import { Breadcrumbs } from '@/ui/Breadcrumbs'
import { outreachCrumbs } from './OutreachPages'
import { linkClass } from '@/ui/Text'
import { Field, TextInput } from '@/ui/Field'
import type { OutreachPageProps } from './OutreachPages'
import { sequencePutSchema, sequenceSchema, type Sequence, type SequenceStep } from './sequenceContract'
import { isAccessLoss, writeFailure } from './writeFailure'

type Load = { status: 'loading' } | { status: 'unavailable' } | { status: 'error' } | { status: 'ready'; value: Sequence | null }
const freshStep = (position: number): SequenceStep =>
  ({ id: newId(), position, delay_seconds: 0, local_time: '09:00:00', label: 'Step ' + position })

export function OutreachSequencePage(props: OutreachPageProps) {
  const { campaignId } = useParams<{ campaignId: string }>()
  const key = [props.context?.contextId, props.context?.authorizationVersion, campaignId].join(':')
  return <SequenceEditor key={key} {...props} campaignId={campaignId} />
}

function SequenceEditor({ campaignId, gateway, context, proof }: OutreachPageProps & { campaignId: string | undefined }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [id, setId] = useState(newId)
  const [expectedVersion, setExpectedVersion] = useState<number | null>(null)
  const [status, setStatus] = useState<'draft' | 'held'>('draft')
  const [timezone, setTimezone] = useState('UTC')
  const [steps, setSteps] = useState<SequenceStep[]>(() => [freshStep(1)])
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [accessLost, setAccessLost] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    if (!gateway?.getOutreachSequenceDraft || !context || !campaignId) { setLoad({ status: 'unavailable' }); return }
    if (!z.uuid().safeParse(campaignId).success) { setLoad({ status: 'error' }); return }
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    void gateway.getOutreachSequenceDraft(context, campaignId, controller.signal).then((wire) => {
      if (controller.signal.aborted) return
      if (wire === null) { setLoad({ status: 'ready', value: null }); return }
      const parsed = sequenceSchema.safeParse(wire)
      if (!parsed.success || parsed.data.campaign_id !== campaignId) { setLoad({ status: 'error' }); return }
      const saved = parsed.data
      setId(saved.id); setExpectedVersion(saved.version); setStatus(saved.status)
      setTimezone(saved.timezone); setSteps(saved.steps)
      setLoad({ status: 'ready', value: saved })
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setLoad(failure instanceof GatewayError && failure.status === 404
        ? { status: 'ready', value: null }
        : { status: isApiError(failure, 'temporarily_unavailable') ? 'unavailable' : 'error' })
    })
    return () => controller.abort()
  }, [gateway, context, campaignId, revision])
  function changeStep(index: number, patch: Partial<SequenceStep>) {
    setSteps((current) => current.map((step, position) => position === index ? { ...step, ...patch } : step))
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!gateway?.saveOutreachSequenceDraft || !context || !proof || !campaignId || load.status !== 'ready' || busy || locked) return
    const input = sequencePutSchema.safeParse({
      id, campaign_id: campaignId, operation_id: newId(), expected_version: expectedVersion, status, timezone: timezone.trim(), steps,
    })
    if (!input.success) { setError('Enter a timezone and 1–20 ordered steps with valid labels, local times and delays up to 30 days.'); return }
    const controller = new AbortController(); pending.current = controller
    setBusy(true); setError(null)
    try {
      const saved = sequenceSchema.parse(await gateway.saveOutreachSequenceDraft(context, proof, campaignId, input.data, controller.signal))
      if (saved.id !== id || saved.campaign_id !== campaignId || saved.version <= (expectedVersion ?? 0)) throw new Error('Sequence receipt mismatch')
      if (!controller.signal.aborted) { setLocked(false); setRevision((value) => value + 1) }
    } catch (failure) {
      if (!controller.signal.aborted) {
        const outcome = writeFailure(failure)
        const conflict = failure instanceof GatewayError && failure.status === 409
        setError(conflict ? 'Sequence changed or needs rescheduling. Inspect the saved sequence before editing again.' : outcome.message)
        setLocked(outcome.lock || conflict)
        if (isAccessLoss(failure)) setAccessLost(true)
      }
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <section aria-label="Campaign sequence">
    <Breadcrumbs crumbs={outreachCrumbs('Campaign sequence', `/outreach/campaigns/${campaignId}/sequence`)} />
    <PageHeader title="Campaign sequence" subtitle="Draft and held sequences cannot send or enroll leads." />
    <div className="max-w-3xl space-y-6">
    {accessLost ? <p role="alert" className="text-sm font-medium text-danger">Sequence access changed. Reopen this campaign after your session is refreshed.</p> :
      load.status === 'loading' ? <p role="status" className="text-sm text-muted">Loading sequence…</p> :
      load.status === 'unavailable' ? <p role="status" className="text-sm text-muted">Sequence API unavailable for this account.</p> :
      load.status === 'error' ? <p role="alert" className="text-sm font-medium text-danger">Unable to load this sequence.</p> :
      <><p className="text-sm text-muted ">{load.value ? 'Saved version ' + load.value.version + '; ' + load.value.status + '.' : 'No accessible sequence draft was returned. The server will decide whether a new draft can be created.'}</p>
        <form onSubmit={(event) => { void save(event) }} className="space-y-4 p-6 rounded-xl border border-line bg-surface shadow-xs  ">
          <Field id="sequence-timezone" label="IANA timezone"><TextInput id="sequence-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} required /></Field>
          <Field id="sequence-status" label="Sequence state"><select id="sequence-status" className="h-10 w-full max-w-xs rounded-lg border border-line border-b-line bg-surface px-3 text-sm text-fg shadow-xs   " value={status} onChange={(event) => setStatus(event.target.value as 'draft' | 'held')}>
            <option value="draft">Draft</option><option value="held">Held</option>
          </select></Field>
          <ol className="space-y-4 p-6 rounded-xl border border-line bg-surface shadow-xs  ">{steps.map((step, index) => <li key={step.id} className="space-y-3 rounded-xl border border-line p-4 ">
            <p className="text-sm text-muted ">Step {index + 1}</p>
            <Field id={'sequence-label-' + step.id} label={'Step ' + (index + 1) + ' label'}><TextInput id={'sequence-label-' + step.id} value={step.label} maxLength={120} onChange={(event) => changeStep(index, { label: event.target.value })} required /></Field>
            <Field id={'sequence-delay-' + step.id} label={'Step ' + (index + 1) + ' delay seconds'}><TextInput id={'sequence-delay-' + step.id} type="number" min={0} max={2_592_000} value={step.delay_seconds} onChange={(event) => changeStep(index, { delay_seconds: Number(event.target.value) })} required /></Field>
            <Field id={'sequence-time-' + step.id} label={'Step ' + (index + 1) + ' local time'}><TextInput id={'sequence-time-' + step.id} type="time" step={1} value={step.local_time} onChange={(event) => changeStep(index, { local_time: event.target.value.length === 5 ? event.target.value + ':00' : event.target.value })} required /></Field>
            {steps.length > 1 && <Button size="sm" onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id).map((item, position) => ({ ...item, position: position + 1 })))}>Remove step {index + 1}</Button>}
          </li>)}</ol>
          {steps.length < 20 && <Button size="sm" onClick={() => setSteps((current) => [...current, freshStep(current.length + 1)])}>Add step</Button>}
          <p className="text-sm text-muted ">Delays and local times are metadata. The backend decides any due time, consent or suppression outcome.</p>
          {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
          <Button type="submit" variant="primary" disabled={!gateway?.saveOutreachSequenceDraft || !proof || busy || locked}>{busy ? 'Saving…' : expectedVersion === null ? 'Create draft sequence' : 'Save sequence'}</Button>
          {locked && <p className="text-sm text-muted ">Outcome or version requires inspection. Leave this page and reopen the saved sequence before retrying. <Link className={linkClass} to={'/outreach/campaigns/' + campaignId}>Campaign detail</Link></p>}
        </form></>}
    </div>
  </section>
}
