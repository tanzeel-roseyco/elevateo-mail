import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { ApiFailure } from '@/data/http/httpClient'
import { http, live } from '@/data/http/instance'
import { Button } from '@/ui/Button'
import { Field, Textarea } from '@/ui/Field'

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u)
const response = z.object({ ticket: z.string().regex(/^[a-f0-9]{64}$/u), requestId: id,
  expiresAt: z.number().int().positive() }).strict()
type Props = { accountId: string; mailboxId: string; messageIds: string[]; onExpired: () => void }
// AIDEV-NOTE: A ticket is a short-lived capability; never persist it or invoke a desktop process from the browser.
export function NativeTicket(props: Props) {
  return <TicketForm key={JSON.stringify([props.accountId, props.mailboxId, [...props.messageIds].sort()])} {...props} />
}
function TicketForm({ accountId, mailboxId, messageIds, onExpired }: Props) {
  const [instruction, setInstruction] = useState(''), [ticket, setTicket] = useState<z.infer<typeof response> | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false)
  const active = useRef(true), locked = useRef(false)
  const current = () => active.current && live.store.getState().accountId === accountId
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    if (!ticket) return
    const timer = setTimeout(() => { setTicket(null); setCopied(false); setError('Ticket expired. Create a new one when the companion is ready.') }, Math.max(0, ticket.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [ticket])
  async function issue() {
    if (locked.current) return
    locked.current = true; setBusy(true); setError(''); setTicket(null); setCopied(false)
    try {
      const input = z.object({ mailboxId: id, messageIds: z.array(id).min(1).max(20).refine(ids => new Set(ids).size === ids.length),
        instruction: z.string().trim().min(1).max(4000), requestId: id }).parse({ mailboxId, messageIds, instruction, requestId: crypto.randomUUID() })
      const result = await http.request('POST', '/v1/ai/native/tickets', response, input)
      if (!current()) return
      if (result.requestId !== input.requestId || result.expiresAt <= Date.now() || result.expiresAt > Date.now() + 60_000) throw new Error('Invalid or expired companion ticket.')
      setTicket(result)
    } catch (cause) {
      if (current()) {
        setError('Could not prepare the companion ticket. Check permissions and retry.')
        if (cause instanceof ApiFailure && cause.kind === 'unauthorized') { setInstruction(''); setTicket(null); onExpired(); void live.recheckSession() }
      }
    } finally { locked.current = false; if (current()) setBusy(false) }
  }
  async function copy() {
    if (!ticket || ticket.expiresAt <= Date.now()) { setTicket(null); return }
    try { await navigator.clipboard.writeText(JSON.stringify(ticket)); if (current()) setCopied(true) }
    catch { if (current()) setError('Clipboard unavailable. Select and copy the ticket below manually.') }
  }
  return <section aria-label="Desktop AI handoff" className="space-y-3 rounded border border-line p-3">
    <h2 className="font-semibold">Prepare a desktop AI draft</h2>
    <p>Open the configured Elevateo Mail companion first. Create a ticket, then paste its JSON into the companion within 60 seconds. This grants access to the selected messages for this draft. The browser does not run Claude or Codex.</p>
    <p>The companion uses your installed Claude account. Review its output and paste the subject and message into the draft fields below. Nothing is sent automatically.</p>
    <Field label="Draft instructions">{props => <Textarea {...props} maxLength={4000} value={instruction} disabled={busy} onChange={event => { setInstruction(event.target.value); setTicket(null); setCopied(false) }} />}</Field>
    <Button disabled={busy || !instruction.trim() || !messageIds.length} onClick={() => void issue()}>{busy ? 'Preparing ticket…' : 'Create companion ticket'}</Button>
    {error && <p role="alert">{error}</p>}
    {ticket && <><Field label="Companion ticket JSON">{props => <Textarea {...props} readOnly value={JSON.stringify(ticket)} />}</Field><Button onClick={() => void copy()}>Copy companion ticket</Button><p>Expires at {new Date(ticket.expiresAt).toLocaleTimeString()}. Clipboard copies also expire; clear your clipboard after use.</p></>}
    {copied && <p role="status">Ticket copied.</p>}
  </section>
}
