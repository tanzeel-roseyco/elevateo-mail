// Send-intent status (send pilot): the Resend-backed lifecycle as a timeline (queued -> submitted
// -> delivered / bounced / complained / failed / unknown), honest wording about what acceptance does
// and does not establish, the cancel/stop request, and polling with bounded backoff that stops on a
// terminal state and while the page is hidden. Presentation follows the Flux page template.
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

// Backoff bounds: first re-check after 4s, doubling to a 30s ceiling. The 4s floor is deliberately
// above the test async window so unit tests never trigger an automatic poll.
const POLL_BASE_MS = 4000
const POLL_MAX_MS = 30_000

const TERMINAL_DELIVERY: ReadonlyArray<NonNullable<SendStatus['delivery_status']>> = ['delivered', 'failed', 'bounced', 'complained', 'suppressed']

/** True once no further automatic change is expected: a dead lifecycle state or a settled delivery. */
function isTerminal(status: SendStatus): boolean {
  if (status.state === 'rejected' || status.state === 'cancelled') return true
  return status.delivery_status !== null && TERMINAL_DELIVERY.includes(status.delivery_status)
}

type StepTone = 'done' | 'active' | 'pending' | 'problem'
interface TimelineStep { key: string; label: string; note: string; tone: StepTone; at: string | null }
const STEP_TONE: Record<StepTone, { badge: 'neutral' | 'success' | 'warn' | 'danger'; word: string }> = {
  done: { badge: 'success', word: 'Done' },
  active: { badge: 'neutral', word: 'In progress' },
  pending: { badge: 'neutral', word: 'Not started' },
  problem: { badge: 'danger', word: 'Needs attention' },
}

/** Presentation-only derivation of the three lifecycle stages from one status read. */
function deriveTimeline(status: SendStatus): TimelineStep[] {
  const queued: TimelineStep = { key: 'queued', label: 'Queued', note: 'The approved intent is durably queued.', tone: 'done', at: status.approved_at }

  let submitted: TimelineStep
  switch (status.state) {
    case 'accepted': submitted = { key: 'submitted', label: 'Submitted to provider', note: 'The provider accepted the submission. Acceptance is not delivery.', tone: 'done', at: null }; break
    case 'rejected': submitted = { key: 'submitted', label: 'Submitted to provider', note: 'The provider rejected the submission.', tone: 'problem', at: null }; break
    case 'dispatching': submitted = { key: 'submitted', label: 'Submitting to provider', note: 'A submission is in progress.', tone: 'active', at: null }; break
    case 'unknown': submitted = { key: 'submitted', label: 'Submitted to provider', note: 'The submission outcome could not be confirmed.', tone: 'problem', at: null }; break
    case 'needs_review': submitted = { key: 'submitted', label: 'Submission held', note: 'The intent is held and cannot be submitted from here.', tone: 'problem', at: null }; break
    case 'cancelled': submitted = { key: 'submitted', label: 'Not submitted', note: 'Cancelled before dispatch; nothing was submitted.', tone: 'pending', at: null }; break
    default: submitted = { key: 'submitted', label: 'Submitted to provider', note: 'Awaiting submission to the provider.', tone: 'pending', at: null }
  }

  let delivery: TimelineStep
  if (status.delivery_status !== null) {
    const settled = TERMINAL_DELIVERY.includes(status.delivery_status)
    const good = status.delivery_status === 'delivered'
    // AIDEV-NOTE: Short stage phrasing kept DISTINCT from the DELIVERY[] detail below so the
    // detailed sentence (asserted by tests) is not duplicated in the DOM.
    const note =
      good ? 'The recipient mail server accepted the message.'
      : status.delivery_status === 'sent' ? 'Sent by the provider; awaiting a delivery event.'
      : status.delivery_status === 'delivery_delayed' ? 'The provider is retrying delivery.'
      : status.delivery_status === 'bounced' ? 'The message bounced.'
      : status.delivery_status === 'complained' ? 'A spam complaint was received.'
      : status.delivery_status === 'suppressed' ? 'The provider suppressed the message.'
      : 'The provider reported a delivery failure.'
    delivery = { key: 'delivery', label: `Delivery: ${status.delivery_status.replaceAll('_', ' ')}`, note, tone: good ? 'done' : settled ? 'problem' : 'active', at: status.delivery_updated_at }
  } else if (status.state === 'unknown') {
    delivery = { key: 'delivery', label: 'Delivery', note: 'No delivery is confirmed while the outcome is unknown.', tone: 'problem', at: null }
  } else if (status.state === 'accepted') {
    delivery = { key: 'delivery', label: 'Delivery', note: 'Accepted by the provider; no delivery event has arrived yet.', tone: 'active', at: null }
  } else {
    delivery = { key: 'delivery', label: 'Delivery', note: 'No delivery has occurred.', tone: 'pending', at: null }
  }
  return [queued, submitted, delivery]
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
  // Latest status and the poll re-arm hook live in refs so backoff survives silent re-renders and a
  // completed load/cancel can restart polling without re-creating the poller effect.
  const statusRef = useRef<SendStatus | null>(null)
  const armRef = useRef<(() => void) | null>(null)

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    setBusy(false)
    pending.current = false
    const outcome = await request((ctx, signal) => gateway.getSendStatus(ctx, sendId, mailboxId, signal))
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed' || outcome.value.send_id !== sendId || outcome.value.mailbox_id !== mailboxId) {
      statusRef.current = null
      setState({ kind: 'error' })
      return
    }
    statusRef.current = outcome.value
    setState({ kind: 'ready', status: outcome.value })
    armRef.current?.()
  }, [gateway, request, sendId, mailboxId])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (state.kind === 'ready') heading.current?.focus()
  }, [state.kind])

  // Bounded-backoff poller. Scheduling lives entirely in refs/closure so a silent status update does
  // not reset the interval; it stops on a terminal status and whenever the document is hidden.
  useEffect(() => {
    let cancelled = false
    let handle: ReturnType<typeof setTimeout> | null = null
    let step = 0
    const stop = () => { if (handle) { clearTimeout(handle); handle = null } }
    const arm = () => {
      stop()
      const current = statusRef.current
      if (cancelled || current === null || isTerminal(current) || document.hidden) return
      handle = setTimeout(() => void run(), Math.min(POLL_BASE_MS * 2 ** step, POLL_MAX_MS))
    }
    const run = async () => {
      step += 1
      const outcome = await request((ctx, signal) => gateway.getSendStatus(ctx, sendId, mailboxId, signal))
      if (cancelled || outcome.kind === 'stale') return
      // A failed or mismatched poll stops the automatic schedule; the manual Refresh button remains.
      if (outcome.kind === 'failed' || outcome.value.send_id !== sendId || outcome.value.mailbox_id !== mailboxId) return
      statusRef.current = outcome.value
      setState({ kind: 'ready', status: outcome.value })
      arm()
    }
    const onVisibility = () => { if (document.hidden) stop(); else { step = 0; arm() } }
    armRef.current = () => { step = 0; arm() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { cancelled = true; stop(); document.removeEventListener('visibilitychange', onVisibility); armRef.current = null }
  }, [gateway, request, sendId, mailboxId])

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
  const steps = deriveTimeline(status)
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

        {/* Lifecycle timeline. aria-live announces each stage change a silent poll brings in. */}
        <ol aria-label="Delivery lifecycle" aria-live="polite" className="space-y-3 border-s border-zinc-200 ps-4 dark:border-zinc-700">
          {steps.map((step) => (
            <li key={step.key} className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STEP_TONE[step.tone].badge} size="sm">{step.label}</Badge>
                <span className="sr-only">{STEP_TONE[step.tone].word}.</span>
                {step.at !== null && <time dateTime={step.at} className="text-xs text-zinc-500">{formatDateTime(step.at)}</time>}
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{step.note}</p>
            </li>
          ))}
        </ol>

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
        {/* Honest cue that the page refreshes itself while an outcome is still pending. */}
        {!isTerminal(status) && <p className="text-xs text-zinc-400">This status updates automatically while an outcome is pending.</p>}
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
