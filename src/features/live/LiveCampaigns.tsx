import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { createCampaignsGateway, type CampaignPage } from '@/data/http/campaignsGateway'
import { ApiFailure } from '@/data/http/httpClient'
import { http, live, useLive } from '@/data/http/instance'
import { Button } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { usePageTitle } from '@/ui/Bits'
import { LiveSequences } from './LiveSequences'

const campaigns = createCampaignsGateway(http)
const failure = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'
// AIDEV-NOTE: Account-keyed state discards private drafts on account changes; email content is not browser-persisted.
export function LiveCampaigns() {
  const accountId = useLive(state => state.accountId)
  usePageTitle('Campaigns')
  return accountId ? <CampaignPanel key={accountId} accountId={accountId} /> : null
}
function CampaignPanel({ accountId }: { accountId: string }) {
  const mailboxes = useLive(state => state.mailboxes)
  const capabilities = useLive(state => state.capabilities)
  const [params, setParams] = useSearchParams()
  const after = params.get('after')
  const [page, setPage] = useState<CampaignPage | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState('')
  const [mailbox, setMailbox] = useState('')
  const [recipient, setRecipient] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [schedule, setSchedule] = useState('')
  const [prepared, setPrepared] = useState('')
  const active = useRef(true)
  const generation = useRef(0)
  const current = useCallback(() => active.current && live.store.getState().accountId === accountId, [accountId])
  const reportFailure = useCallback((cause: unknown) => {
    setError(failure(cause))
    if (cause instanceof ApiFailure && cause.kind === 'unauthorized') {
      // AIDEV-NOTE: Hide private state immediately while the coordinator resolves an expired or switched account.
      generation.current++
      setLoading(false)
      setPage(null); setSelected(''); setPrepared(''); setName(''); setMailbox(''); setRecipient(''); setSubject(''); setBody(''); setSchedule('')
      void live.recheckSession()
    }
  }, [])
  const load = useCallback(async () => {
    const version = ++generation.current
    setLoading(true); setError(''); setPage(null)
    try { const result = await campaigns.list(after); if (current() && version === generation.current) setPage(result) }
    catch (cause) { if (current() && version === generation.current) reportFailure(cause) }
    finally { if (current() && version === generation.current) setLoading(false) }
  }, [after, current, reportFailure])
  useEffect(() => {
    const requestGeneration = generation
    active.current = true
    void load()
    return () => { active.current = false; requestGeneration.current++ }
  }, [load])
  async function act(work: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setPrepared('')
    try { await work() } catch (cause) { if (current()) reportFailure(cause) }
    finally { if (current()) setBusy(false) }
  }
  function create(event: FormEvent) {
    event.preventDefault()
    void act(async () => { const result = await campaigns.create(name); if (current()) { setSelected(result.id); setName(''); await load() } })
  }
  function prepare(event: FormEvent) {
    event.preventDefault()
    void act(async () => {
      // AIDEV-NOTE: datetime-local is interpreted in this device's timezone and sent as an unambiguous UTC instant.
      const scheduled = schedule ? new Date(schedule) : null
      const now = Date.now()
      // AIDEV-NOTE: Only the server can distinguish a new past-dated draft from a lost-response retry of a saved one.
      if (scheduled && (!Number.isFinite(scheduled.getTime()) || scheduled.getTime() > now + 30 * 86_400_000)) {
        throw new Error('Choose a valid time no more than 30 days ahead.')
      }
      const result = await campaigns.prepare(selected, { mailboxId: mailbox, recipient, subject, body,
        ...(scheduled ? { scheduledAt: scheduled.toISOString() } : {}) })
      if (current()) setPrepared(result.id)
    })
  }
  return <main className="mx-auto h-full min-h-0 w-full max-w-5xl overflow-y-auto space-y-6 p-6">
    <header><h1 className="text-2xl font-semibold">Campaigns</h1><p className="mt-2 text-sm text-muted">{capabilities?.liveSending ? 'Live Resend campaigns are enabled. Gmail campaign sending is unavailable. Prepare one opted-in recipient at a time, then review each send separately.' : capabilities?.simulated ? 'Simulated mode. Prepare one recipient at a time, then review each send separately. No real email is sent.' : 'Live sending is disabled. Prepare drafts for separate review.'}</p></header>
    {error && <div role="alert" className="rounded-lg border border-line p-3 text-danger">{error} <Button onClick={() => void load()} disabled={busy}>Reload campaigns</Button></div>}
    <form onSubmit={create} className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
      <Field label="New campaign ID" hint="Letters, numbers, hyphens or underscores; up to 128 characters.">{props => <Input {...props} required pattern="[a-zA-Z0-9_-]+" maxLength={128} value={name} onChange={event => setName(event.target.value)} disabled={busy} />}</Field>
      <Button type="submit" variant="primary" disabled={busy}>Create campaign</Button>
    </form>
    <section className="space-y-3" aria-label="Campaign inventory">
      {loading && <p role="status">Loading campaigns…</p>}
      {!loading && page?.items.length === 0 && <p className="text-muted">No campaigns on this page. Create one to begin.</p>}
      {page?.items.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
        <Button onClick={() => { setSelected(item.id); setPrepared('') }} disabled={busy}>{item.id}{selected === item.id ? ' — selected' : ''}</Button>
        <span className="text-sm text-muted">{item.status === 'running' ? 'Enabled for approved sends' : item.status}</span>
        <Button disabled={busy} onClick={() => void act(async () => { await campaigns.status(item.id, item.status === 'running' ? 'paused' : 'running'); if (current()) await load() })}>{item.status === 'running' ? 'Pause campaign' : 'Enable approved sends'}</Button>
      </div>)}
      <p className="text-xs text-muted">Enabling permits separately approved requests to run. Pausing stops future dispatch eligibility; an in-flight request cannot be recalled.</p>
      <div className="flex gap-2">{after && <Button disabled={busy} onClick={() => { setSelected(''); setParams({}) }}>First page</Button>}{page?.next && <Button disabled={busy} onClick={() => { setSelected(''); setParams({ after: page.next! }) }}>Next page</Button>}</div>
    </section>
    {selected && <form onSubmit={prepare} onChange={() => setPrepared('')} className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold">Prepare a draft · {selected}</h2>
      <p className="text-sm text-muted">Recipient must have opt-in evidence in Contacts and no suppression. Identical content reopens its existing request; sending still requires review.</p>
      <Field label="Sending mailbox">{props => <Select {...props} value={mailbox} onChange={event => setMailbox(event.target.value)} required disabled={busy}><option value="">Choose a mailbox</option>{mailboxes.map(item => <option key={item.id} value={item.id}>{item.address}</option>)}</Select>}</Field>
      <Field label="Recipient">{props => <Input {...props} type="email" required maxLength={254} value={recipient} onChange={event => setRecipient(event.target.value)} disabled={busy} />}</Field>
      <Field label="Subject">{props => <Input {...props} required maxLength={998} value={subject} onChange={event => setSubject(event.target.value)} disabled={busy} />}</Field>
      <Field label="Message">{props => <Textarea {...props} required rows={7} maxLength={100000} value={body} onChange={event => setBody(event.target.value)} disabled={busy} />}</Field>
      <Field label="Earliest send time (optional)" hint="Your device's local timezone. New drafts need a future time within 30 days; unchanged retries can recover a saved draft after its time passes. Leave blank for eligibility after approval.">{props => <Input {...props} type="datetime-local" value={schedule} onChange={event => setSchedule(event.target.value)} disabled={busy} />}</Field>
      {schedule && Number.isFinite(new Date(schedule).getTime()) && <p className="text-sm text-muted">Review time: {new Date(schedule).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })}. This saves a draft only; approval and {capabilities?.simulated ? 'simulated dispatch' : 'dispatch'} remain separate.</p>}
      <Button type="submit" variant="primary" disabled={busy}>Prepare for review</Button>
      {prepared && <p role="status">Request saved. <Link className="underline text-accent-text" to={`/sends/${prepared}`}>Review this send request</Link></p>}
    </form>}
    {selected && <LiveSequences campaignId={selected} />}
  </main>
}
