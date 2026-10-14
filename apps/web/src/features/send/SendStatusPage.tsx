import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useGateway } from '@/app/session'
import type { SendStatus } from '@/data/sendContract'
import { canonicalId } from '@/lib/ids'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { EmptyState, Skeleton } from '@/ui/Async'

const DESCRIPTIONS: Record<SendStatus['state'], string> = {
  queued: 'The approved intent is durably queued. No delivery is established.',
  dispatching: 'A simulated submission is in progress. No delivery is established.',
  unknown: 'The simulated submission outcome is unknown. Do not resend or create a replacement draft.',
  needs_review: 'This intent is held. It cannot be reopened or safely resent from this screen.',
  cancelled: 'The intent was cancelled before dispatch authorization.',
  accepted: 'The simulated provider accepted this intent. Acceptance does not establish delivery.',
  rejected: 'The simulated provider rejected this intent. No delivery is established.',
}
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; status: SendStatus }
export function SendStatusPage() {
  const { mailboxId, sendId } = useParams()
  if (!mailboxId || !sendId || !canonicalId(mailboxId) || !canonicalId(sendId)) return <EmptyState title="Invalid send link" body="Open an approved intent from its review." />
  return <Status key={`${mailboxId}\n${sendId}`} mailboxId={mailboxId} sendId={sendId} />
}
function Status({ mailboxId, sendId }: { mailboxId: string; sendId: string }) {
  const gateway = useGateway()
  const { proof, request } = useProtectedRequest()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const load = useCallback(async () => {
    setState({ kind: 'loading' }); setBusy(false); pending.current = false
    const outcome = await request((ctx, signal) => gateway.getSendStatus(ctx, sendId, mailboxId, signal))
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed' || outcome.value.send_id !== sendId || outcome.value.mailbox_id !== mailboxId) { setState({ kind: 'error' }); return }
    setState({ kind: 'ready', status: outcome.value })
  }, [gateway, request, sendId, mailboxId])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (state.kind === 'ready') heading.current?.focus() }, [state.kind])
  const cancel = async () => {
    if (!proof || pending.current || state.kind !== 'ready' || ['accepted', 'rejected', 'cancelled'].includes(state.status.state)) return
    pending.current = true; setBusy(true); setMessage(null)
    const outcome = await request((ctx, signal) => gateway.cancelSend(ctx, proof, sendId, { mailbox_id: mailboxId }, signal))
    if (outcome.kind === 'stale') return
    pending.current = false; setBusy(false)
    if (outcome.kind === 'failed' || outcome.value.send_id !== sendId) {
      setMessage('The stop request was not confirmed. Refresh status or retry the same stop request; do not resend.')
      return
    }
    setMessage(outcome.value.result === 'cancelled' ? 'Cancellation confirmed before dispatch authorization.' : 'Stop requested. The intent may already have been accepted; this does not prove cancellation.')
    await load()
  }
  if (state.kind === 'loading') return <div role="status" aria-label="Loading send status"><Skeleton rows={3} /></div>
  if (state.kind === 'error') return <main className="mx-auto max-w-3xl p-3"><p role="alert">This send status is unavailable. No outcome or safe resend is established.</p><Button onClick={() => void load()}>Refresh status</Button></main>
  const status = state.status
  const terminal = ['accepted', 'rejected', 'cancelled'].includes(status.state)
  return <article className="mx-auto max-w-3xl p-3" aria-busy={busy}>
    <Badge tone="warn">Simulated — no live mail</Badge>
    <h1 ref={heading} tabIndex={-1} className="my-3 text-base font-semibold">Send intent: {status.state.replaceAll('_', ' ')}</h1>
    <p role="status">{DESCRIPTIONS[status.state]}</p>
    <p>Approved draft version {status.approved_version}. Simulated attempts: {status.attempts}.</p>
    {status.hold_reason !== null && <p>Hold: {status.hold_reason.replaceAll('_', ' ')}</p>}
    {status.cancel_requested && <p>Stop has been requested. A late acceptance can still appear.</p>}
    {message && <p role="alert">{message}</p>}
    <div className="my-3 flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void load()}>Refresh status</Button>
      {!terminal && <Button disabled={busy || !proof} onClick={() => void cancel()}>{status.cancellable ? 'Cancel before dispatch' : 'Request stop'}</Button>}
      <Link to={`/mailboxes/${mailboxId}/drafts/${status.draft_id}`}>View consumed draft</Link>
      <Link to={`/mailboxes/${mailboxId}/drafts`}>Back to drafts</Link>
    </div>
  </article>
}
