import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { createSequencesGateway, sequenceInput, type Sequence, type SequencePage } from '@/data/http/sequencesGateway'
import { ApiFailure } from '@/data/http/httpClient'
import { http, live, useLive } from '@/data/http/instance'
import { Button } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'

const api = createSequencesGateway(http)
const blank = () => ({ subject: '', body: '', scheduledAt: '' })
export function LiveSequences({ campaignId }: { campaignId: string }) {
  const accountId = useLive(state => state.accountId)
  return accountId ? <SequencePanel key={`${accountId}:${campaignId}`} accountId={accountId} campaignId={campaignId} /> : null
}
function SequencePanel({ accountId, campaignId }: { accountId: string; campaignId: string }) {
  const mailboxes = useLive(state => state.mailboxes)
  const [mailboxId, setMailbox] = useState(''), [recipient, setRecipient] = useState('')
  const [steps, setSteps] = useState([blank()])
  const [page, setPage] = useState<SequencePage | null>(null), [saved, setSaved] = useState<Sequence | null>(null)
  const [after, setAfter] = useState<string | null>(null), [error, setError] = useState('')
  const [busy, setBusy] = useState(false), [expired, setExpired] = useState(false)
  const active = useRef(true), request = useRef(0), locked = useRef(false)
  const retry = useRef<{ content: string; key: string } | null>(null)
  // AIDEV-NOTE: Neither content nor retry keys survive account/campaign changes or browser reloads.
  const current = useCallback(() => active.current && live.store.getState().accountId === accountId, [accountId])
  const fail = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : 'The request could not be completed.')
    if (cause instanceof ApiFailure && cause.kind === 'unauthorized') {
      request.current++; setExpired(true); setPage(null); setSaved(null); setMailbox(''); setRecipient(''); setSteps([blank()]); retry.current = null
      void live.recheckSession()
    }
  }, [])
  const load = useCallback(async () => {
    const version = ++request.current
    setBusy(true); setPage(null); setError('')
    try { const result = await api.list(campaignId, after); if (current() && version === request.current) setPage(result) }
    catch (cause) { if (current() && version === request.current) fail(cause) }
    finally { if (current() && version === request.current) setBusy(false) }
  }, [after, campaignId, current, fail])
  useEffect(() => { active.current = true; void load(); return () => { active.current = false } }, [load])
  async function mutate(work: () => Promise<Sequence>) {
    if (locked.current || busy || expired) return
    locked.current = true; setBusy(true); setError('')
    try { const result = await work(); if (current()) { setSaved(result); setPage(previous => previous && ({ ...previous, items: previous.items.map(item => item.id === result.id ? result : item) })) } }
    catch (cause) { if (current()) fail(cause) }
    finally { locked.current = false; if (current()) setBusy(false) }
  }
  function save(event: FormEvent) {
    event.preventDefault()
    void mutate(async () => {
      const input = sequenceInput.parse({ mailboxId, recipient, steps: steps.map(step => ({ ...step,
        scheduledAt: new Date(step.scheduledAt).toISOString() })) })
      const content = JSON.stringify(input)
      // AIDEV-NOTE: A lost response must reuse its key even after the requested send time passes.
      if (retry.current?.content !== content) {
        const now = Date.now()
        if (input.steps.some(step => Date.parse(step.scheduledAt) <= now || Date.parse(step.scheduledAt) > now + 30 * 86_400_000)) throw new Error('Choose future times within 30 days.')
        retry.current = { content, key: crypto.randomUUID() }
      }
      return (await api.create(campaignId, input, retry.current.key)).sequence
    })
  }
  function update(index: number, field: keyof ReturnType<typeof blank>, value: string) {
    setSaved(null); setSteps(previous => previous.map((step, position) => position === index ? { ...step, [field]: value } : step))
  }
  function review(sequence: Sequence) {
    return <div key={sequence.id} className="space-y-2 rounded-lg border border-line p-3">
      <p>{sequence.recipient}</p>
      {sequence.steps.map((step, index) => <p key={step.id} className="text-sm"><Link className="underline" to={`/sends/${step.id}`}>Review step {index + 1}</Link> · {step.status} · {new Date(step.scheduledAt).toLocaleString()}</p>)}
      <Button disabled={busy || !sequence.steps.some(step => step.status === 'draft' || step.status === 'pending')} onClick={() => void mutate(async () => (await api.cancel(campaignId, sequence.id)).sequence)}>Cancel remaining steps</Button>
    </div>
  }
  if (expired) return <section role="alert">Your session expired. Sign in again to manage sequences.</section>
  return <section aria-label="Campaign sequences" className="space-y-4 rounded-xl border border-line bg-surface p-5">
    <h2 className="text-lg font-semibold">Plan a short sequence</h2>
    <p className="text-sm text-muted">Save up to three messages for one opted-in recipient. {page?.liveActivationAvailable ? 'Configured Resend mailboxes can request activation; receiving and permission checks still apply. Gmail sequences remain unavailable.' : 'Live sequence activation is unavailable for this deployment.'} Every step needs separate review and approval; saving reserves no allowance.</p>
    {error && <p role="alert">{error} Unchanged submissions can be retried safely while this screen stays open.</p>}
    <form onSubmit={save} className="space-y-3">
      <Field label="Sequence mailbox">{props => <Select {...props} required value={mailboxId} disabled={busy} onChange={event => { setMailbox(event.target.value); setSaved(null) }}><option value="">Choose a mailbox</option>{mailboxes.map(mailbox => <option key={mailbox.id} value={mailbox.id}>{mailbox.address}</option>)}</Select>}</Field>
      <Field label="Sequence recipient">{props => <Input {...props} required type="email" maxLength={254} value={recipient} disabled={busy} onChange={event => { setRecipient(event.target.value); setSaved(null) }} />}</Field>
      {steps.map((step, index) => <fieldset key={index} disabled={busy} className="space-y-2 border border-line p-3"><legend>Step {index + 1}</legend>
        <Field label={`Step ${index + 1} subject`}>{props => <Input {...props} required maxLength={998} value={step.subject} onChange={event => update(index, 'subject', event.target.value)} />}</Field>
        <Field label={`Step ${index + 1} message`}>{props => <Textarea {...props} required maxLength={100000} rows={3} value={step.body} onChange={event => update(index, 'body', event.target.value)} />}</Field>
        <Field label={`Step ${index + 1} earliest send time`} hint="Device local time; each step must be later than the previous one, within 30 days.">{props => <Input {...props} required type="datetime-local" value={step.scheduledAt} onChange={event => update(index, 'scheduledAt', event.target.value)} />}</Field>
      </fieldset>)}
      <div className="flex flex-wrap gap-2"><Button disabled={busy || steps.length === 3} onClick={() => { setSteps(previous => [...previous, blank()]); setSaved(null) }}>Add step</Button><Button disabled={busy || steps.length === 1} onClick={() => { setSteps(previous => previous.slice(0, -1)); setSaved(null) }}>Remove last step</Button><Button type="submit" variant="primary" disabled={busy || !mailboxes.length}>Save sequence for review</Button></div>
    </form>
    {busy && <p role="status">Working…</p>}
    {saved && <div aria-label="Saved sequence"><p role="status">Sequence saved. Nothing was approved or sent.</p>{review(saved)}</div>}
    <Button disabled={busy} onClick={() => void load()}>Reload sequences</Button>
    {!busy && page?.items.length === 0 && <p>No sequences on this page.</p>}
    {page?.items.filter(item => item.id !== saved?.id).map(review)}
    <div className="flex gap-2">{after && <Button disabled={busy} onClick={() => setAfter(null)}>First sequence page</Button>}{page?.next && <Button disabled={busy} onClick={() => setAfter(page.next)}>Next sequence page</Button>}</div>
  </section>
}
