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
  dispatching: 'A submission is in progress. No delivery is established.',
  unknown: 'The submission outcome is unknown. Do not resend or create a replacement draft.',
  needs_review: 'This intent is held. It cannot be reopened or safely resent from this screen.',
  cancelled: 'The intent was cancelled before dispatch authorization.',
  accepted: 'The provider accepted this intent. Acceptance does not establish delivery.',
  rejected: 'The provider rejected this intent. No delivery is established.',
}
// AIDEV-NOTE: Provider delivery events are separate from durable submission acceptance.
const DELIVERY: Record<NonNullable<SendStatus['delivery_status']>, string> = {
  sent: 'The provider sent the email. Delivery is not yet confirmed.',
  delivery_delayed: 'Delivery is delayed. Do not resend while the provider is retrying.',
  delivered: 'The recipient mail server accepted delivery. This does not confirm the email was read.',
  failed: 'The provider reported a delivery failure.',
  bounced: 'The email bounced. This recipient is suppressed from further sends.',
  suppressed: 'The provider suppressed this email.',
  complained: 'A spam complaint was received. This recipient is suppressed from further sends.',
}
const SUPPRESSION: Record<NonNullable<SendStatus['suppression_reason']>, string> = {
  bounced: 'Suppressed after a bounce. Future sends to this recipient are blocked.',
  complained: 'Suppressed after a spam complaint. Future sends to this recipient are blocked.',
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
  if (state.kind === 'error') return <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 p-4"><p role="alert">This send status is unavailable. No outcome or safe resend is established.</p><Button onClick={() => void load()}>Refresh status</Button></div>
  const status = state.status
  const terminal = ['accepted', 'rejected', 'cancelled'].includes(status.state)
  return <article className="mx-auto max-w-3xl p-3" aria-busy={busy}>
    <Badge tone="warn">{status.simulated ? 'Simulated - no live mail' : 'Live email'}</Badge>
    <h1 ref={heading} tabIndex={-1} className="my-3 text-base font-semibold">Send intent: {status.state.replaceAll('_', ' ')}</h1>
    <p role="status">{DESCRIPTIONS[status.state]}</p>
    {status.delivery_status !== null && <section aria-label="Delivery update"><h2>Delivery: {status.delivery_status.replaceAll('_', ' ')}</h2><p>{DELIVERY[status.delivery_status]}</p>{status.delivery_updated_at && <time dateTime={status.delivery_updated_at}>{new Date(status.delivery_updated_at).toLocaleString()}</time>}</section>}
    <p>Approved draft version {status.approved_version}. {status.simulated ? 'Simulated attempts' : 'Submission attempts'}: {status.attempts}.</p>
    {status.suppression_reason !== null && <p role="note" aria-label="Suppression" className="my-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13px]">{SUPPRESSION[status.suppression_reason]}</p>}
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
