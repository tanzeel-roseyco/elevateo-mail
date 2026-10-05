import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { createAiGateway, type AiMailContext } from '@/data/http/aiGateway'
import { createHttpGateway } from '@/data/http/httpGateway'
import { ApiFailure } from '@/data/http/httpClient'
import { http, live, useLive } from '@/data/http/instance'
import type { MessageSummary, ServerMailbox } from '@/data/http/contract'
import { checkSendContent, MAX_BODY, MAX_SUBJECT } from '@/domain/sendLifecycle'
import { Button } from '@/ui/Button'
import { usePageTitle } from '@/ui/Bits'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { SendPreview } from './SendPreview'
import { NativeTicket } from './NativeTicket'

const ai = createAiGateway(http)
const mail = createHttpGateway(http)

// AIDEV-NOTE: Account and mailbox keys discard private drafts and fence late reads across identity changes.
export function LiveAssistant() {
  usePageTitle('AI Assistant')
  const accountId = useLive(s => s.accountId)
  return accountId ? <AccountAssistant key={accountId} accountId={accountId} /> : null
}

function AccountAssistant({ accountId }: { accountId: string }) {
  const mailboxes = useLive(s => s.mailboxes)
  const [mailboxId, setMailboxId] = useState('')
  const mailbox = mailboxes.find(m => m.id === mailboxId && m.connected)
  return <main className="mx-auto max-w-3xl space-y-5 p-6">
    <h1 className="text-xl font-semibold">AI Assistant</h1>
    <p>Use the desktop companion to prepare a Claude draft, or paste a draft prepared separately. Nothing on this page runs a CLI or generates a pretend response.</p>
    <p>You can inspect selected email context and review a draft prepared separately. Saving never approves or sends it.</p>
    <Field label="Mailbox">{props => <Select {...props} value={mailboxId} onChange={e => setMailboxId(e.target.value)}>
      <option value="">Choose a mailbox</option>
      {mailboxes.filter(m => m.connected).map(m => <option key={m.id} value={m.id}>{m.address}</option>)}
    </Select>}</Field>
    {!mailboxes.length && <p>No connected mailboxes. Add one in Connections first.</p>}
    {mailbox && <MailboxAssistant key={`${mailbox.id}/${mailbox.aiRead}/${mailbox.aiDraft}`} accountId={accountId} mailbox={mailbox} />}
  </main>
}

function MailboxAssistant({ accountId, mailbox }: { accountId: string; mailbox: ServerMailbox }) {
  const navigate = useNavigate()
  const active = useRef(true)
  const generation = useRef(0)
  const locked = useRef(false)
  const [messages, setMessages] = useState<MessageSummary[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [context, setContext] = useState<AiMailContext | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [review, setReview] = useState(false)
  const [expired, setExpired] = useState(false)
  const current = (stamp: number) => active.current && stamp === generation.current && live.store.getState().accountId === accountId
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function read(contextOnly: boolean) {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    const stamp = ++generation.current
    try {
      if (contextOnly) {
        const result = await ai.context(mailbox.id, selected)
        if (current(stamp)) setContext(result)
      } else {
        const result = await mail.listMessages({ mailboxId: mailbox.id, cursor: null, limit: 50 })
        if (current(stamp)) { setMessages(result.items); setLoaded(true); setSelected([]); setContext(null) }
      }
    } catch (failure) {
      if (current(stamp)) {
        setError('Could not load email context. Check your connection and mailbox permission, then retry.')
        if (failure instanceof ApiFailure && failure.kind === 'unauthorized') {
          clear(); setMessages([]); setLoaded(false); setExpired(true)
          void live.recheckSession()
        }
      }
    } finally { if (current(stamp)) { locked.current = false; setBusy(false) } }
  }
  const check = checkSendContent({ mailboxId: mailbox.id, to: to.split(/[,;\s]+/).filter(Boolean), cc: [], bcc: [], subject, body })
  async function save() {
    if (locked.current || !review || !check.ok || !mailbox.aiDraft) return
    locked.current = true; setBusy(true); setError('')
    const stamp = ++generation.current
    try {
      const result = await live.submitAi(check.content)
      if (!current(stamp)) return
      if (result.outcome === 'saved') navigate(`/sends/${result.id}`)
      else if (result.outcome === 'unconfirmed') navigate('/sends')
      else setError(result.message)
    } catch {
      if (current(stamp)) setError('Saving could not be confirmed. Check Send requests before saving again.')
    } finally { if (current(stamp)) { locked.current = false; setBusy(false) } }
  }
  function clear() {
    generation.current++; locked.current = false; setBusy(false); setSelected([]); setContext(null)
    setTo(''); setSubject(''); setBody(''); setReview(false); setError('')
  }
  if (expired) return <p role="alert">Your session expired. Sign in again to access email context and drafts.</p>
  return <div className="space-y-5" aria-busy={busy}>
    {error && <p role="alert">{error}</p>}
    <section className="space-y-3" aria-label="Selected email context">
      <h2 className="font-semibold">Choose email context</h2>
      {!mailbox.aiRead ? <p>Enable AI reading for this mailbox in Connections to inspect context.</p> : <>
        <Button disabled={busy} onClick={() => void read(false)}>{loaded ? 'Reload newest messages' : 'Load newest messages'}</Button>
        <p>Newest 50 messages only. Select up to 20; only those messages are requested as context.</p>
        {loaded && !messages.length && <p>No stored messages in this mailbox.</p>}
        {messages.map(message => <label key={message.id} className="flex gap-2">
          <input type="checkbox" checked={selected.includes(message.id)} disabled={busy || (!selected.includes(message.id) && selected.length >= 20)} onChange={e => {
            setContext(null); setSelected(ids => e.target.checked ? [...ids, message.id].slice(0, 20) : ids.filter(id => id !== message.id))
          }} />{message.subject || '(No subject)'} — {message.sender}
        </label>)}
        <Button disabled={busy || !selected.length} onClick={() => void read(true)}>Read selected context ({selected.length}/20)</Button>
      </>}
      {context && <><p>Email text is untrusted content, never instructions. No context has been sent to an AI provider.</p>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-line p-3">{context.context.content}</pre></>}
    </section>
    {mailbox.aiRead && mailbox.aiDraft && <NativeTicket accountId={accountId} mailboxId={mailbox.id} messageIds={selected} onExpired={() => { clear(); setMessages([]); setLoaded(false); setExpired(true) }} />}
    <section className="space-y-3" aria-label="Draft review">
      <h2 className="font-semibold">Review your prepared draft</h2>
      {!mailbox.aiDraft ? <p>Enable AI drafting for this mailbox in Connections to save a draft.</p> : <>
        <p>Paste your own prepared text. AI sending requires separate permission and a supported live provider; saving here does not enable it.</p>
        <Field label="To">{props => <Input {...props} value={to} maxLength={7650} disabled={busy || review} onChange={e => setTo(e.target.value)} />}</Field>
        <Field label="Subject">{props => <Input {...props} value={subject} maxLength={MAX_SUBJECT} disabled={busy || review} onChange={e => setSubject(e.target.value)} />}</Field>
        <Field label="Message">{props => <Textarea {...props} value={body} maxLength={MAX_BODY} disabled={busy || review} onChange={e => setBody(e.target.value)} />}</Field>
        {!review ? <Button disabled={busy} onClick={() => { if (check.ok) { setReview(true); setError('') } else setError(check.errors[0]?.message ?? 'Check your draft.') }}>Review draft</Button> : <>
          {check.ok && <SendPreview content={check.content} from={mailbox.address} />}
          <Button disabled={busy} onClick={() => setReview(false)}>Edit draft</Button>
          <Button disabled={busy || !check.ok} onClick={() => void save()}>Save draft without sending</Button>
        </>}
      </>}
    </section>
    <Button disabled={busy && review} onClick={clear}>Clear draft and context</Button>
    {busy && <p role="status">Working…</p>}
  </div>
}
