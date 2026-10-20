// Send-intent status (send pilot): one bounded read of the approved intent, honest wording about
// what acceptance does and does not establish, and the cancel/stop request. Presentation follows
// the Flux page template (header, card, description list, action row).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useGateway } from '@/app/session'
import type { SendStatus } from '@/data/sendContract'
import { canonicalId } from '@/lib/ids'
import { formatDateTime } from '@/lib/format'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { Badge } from '@/ui/Badge'
import { Button, buttonClass } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { Card } from '@/ui/Card'
import { PaperAirplaneIcon } from '@/ui/icons'
import { PageHeader } from '@/ui/PageHeader'

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
const STATE_TONE: Record<SendStatus['state'], 'neutral' | 'success' | 'warn' | 'danger'> = {
  queued: 'neutral',
  dispatching: 'neutral',
  unknown: 'warn',
  needs_review: 'warn',
  cancelled: 'neutral',
  accepted: 'success',
  rejected: 'danger',
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; status: SendStatus }

export function SendStatusPage() {
  const { mailboxId, sendId } = useParams()
  if (!mailboxId || !sendId || !canonicalId(mailboxId) || !canonicalId(sendId)) {
    return (
      <>
        <PageHeader title="Send status" />
        <EmptyState icon={<PaperAirplaneIcon className="size-5" />} title="Invalid send link" body="Open an approved intent from its review." action={<Link to="/inbox" className={buttonClass('primary', 'md')}>Open inbox</Link>} />
      </>
    )
  }
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
    setState({ kind: 'loading' })
    setBusy(false)
    pending.current = false
    const outcome = await request((ctx, signal) => gateway.getSendStatus(ctx, sendId, mailboxId, signal))
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed' || outcome.value.send_id !== sendId || outcome.value.mailbox_id !== mailboxId) {
      setState({ kind: 'error' })
      return
    }
    setState({ kind: 'ready', status: outcome.value })
  }, [gateway, request, sendId, mailboxId])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (state.kind === 'ready') heading.current?.focus()
  }, [state.kind])

  const cancel = async () => {
    if (!proof || pending.current || state.kind !== 'ready' || ['accepted', 'rejected', 'cancelled'].includes(state.status.state)) return
    pending.current = true
    setBusy(true)
    setMessage(null)
    const outcome = await request((ctx, signal) => gateway.cancelSend(ctx, proof, sendId, { mailbox_id: mailboxId }, signal))
    if (outcome.kind === 'stale') return
    pending.current = false
    setBusy(false)
    if (outcome.kind === 'failed' || outcome.value.send_id !== sendId) {
      setMessage('The stop request was not confirmed. Refresh status or retry the same stop request; do not resend.')
      return
    }
    setMessage(outcome.value.result === 'cancelled' ? 'Cancellation confirmed before dispatch authorization.' : 'Stop requested. The intent may already have been accepted; this does not prove cancellation.')
    await load()
  }

  if (state.kind === 'loading') {
    return (
      <>
        <PageHeader title="Send status" />
        <div role="status" aria-label="Loading send status"><Skeleton rows={3} /></div>
      </>
    )
  }
  if (state.kind === 'error') {
    return (
      <>
        <PageHeader title="Send status" />
        <ErrorState title="This send status is unavailable" body="No outcome or safe resend is established." action={<Button variant="primary" onClick={() => void load()}>Refresh status</Button>} />
      </>
    )
  }
  const status = state.status
  const terminal = ['accepted', 'rejected', 'cancelled'].includes(status.state)
  return (
    <article aria-busy={busy}>
      <PageHeader title="Send status" subtitle="Where this send is now: queued, sent, or needing attention" />
      <Card className="max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warn">{status.simulated ? 'Simulated - no live mail' : 'Live email'}</Badge>
          <Badge tone={STATE_TONE[status.state]}>{status.state.replaceAll('_', ' ')}</Badge>
        </div>
        <h1 ref={heading} tabIndex={-1} className="text-base font-medium text-zinc-800 dark:text-white">Send intent: {status.state.replaceAll('_', ' ')}</h1>
        <p role="status" className="text-sm text-zinc-700 dark:text-zinc-300">{DESCRIPTIONS[status.state]}</p>
        {status.delivery_status !== null && (
          <section aria-label="Delivery update" className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <h2 className="text-sm font-medium text-zinc-800 dark:text-white">Delivery: {status.delivery_status.replaceAll('_', ' ')}</h2>
            <p className="mt-1 text-sm text-zinc-500">{DELIVERY[status.delivery_status]}</p>
            {status.delivery_updated_at && <time dateTime={status.delivery_updated_at} className="mt-1 block text-xs text-zinc-500">{formatDateTime(status.delivery_updated_at)}</time>}
          </section>
        )}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-zinc-500">Approved draft version</dt><dd className="font-medium text-zinc-800 dark:text-white">{status.approved_version}</dd></div>
          <div><dt className="text-zinc-500">{status.simulated ? 'Simulated attempts' : 'Submission attempts'}</dt><dd className="font-medium text-zinc-800 dark:text-white">{status.attempts}</dd></div>
          {status.hold_reason !== null && <div><dt className="text-zinc-500">Hold</dt><dd className="font-medium text-zinc-800 dark:text-white">{status.hold_reason.replaceAll('_', ' ')}</dd></div>}
        </dl>
        {status.suppression_reason !== null && <Callout variant="warning" role="note" label="Suppression">{SUPPRESSION[status.suppression_reason]}</Callout>}
        {status.cancel_requested && <p className="text-sm text-zinc-500">Stop has been requested. A late acceptance can still appear.</p>}
        {message && <Callout variant="neutral" role="alert">{message}</Callout>}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button disabled={busy} onClick={() => void load()}>Refresh status</Button>
          {!terminal && (
            <Button variant="danger" disabled={busy || !proof} onClick={() => void cancel()}>
              {status.cancellable ? 'Cancel before dispatch' : 'Request stop'}
            </Button>
          )}
          <Link to={`/mailboxes/${mailboxId}/drafts/${status.draft_id}`} className={buttonClass('ghost', 'md')}>View consumed draft</Link>
          <Link to={`/mailboxes/${mailboxId}/drafts`} className={buttonClass('ghost', 'md')}>Back to drafts</Link>
        </div>
      </Card>
    </article>
  )
}
