import { approvalRecoveryMessage } from '@/app/approvalRecovery'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { draftIntentKey } from '@/app/draftIntent'
import { useMailbox } from '@/app/mailboxes'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useSendIntent, type SendAttempt } from '@/app/sendIntent'
import { useGateway, useSession } from '@/app/session'
import { GatewayError, isApiError, isUncertainWriteOutcome } from '@/data/errors'
import { consentGate } from '@/domain/sendConsent'
import type { SendReview } from '@/data/sendContract'
import { canonicalId, newId } from '@/lib/ids'
import { Badge } from '@/ui/Badge'
import { Button, buttonClass } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { Card } from '@/ui/Card'
import { Checkbox } from '@/ui/Field'
import { PageHeader } from '@/ui/PageHeader'
import { linkClass } from '@/ui/Text'
import { EmptyState, Skeleton } from '@/ui/Async'

// AIDEV-NOTE: 'consent_blocked' has no dismiss or retry: only new consent evidence can change it.
type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'consent_blocked' } | { kind: 'ready'; review: SendReview }
const MODE_LABEL: Record<SendReview['outbound_mode'], string> = {
  held: 'Outbound held - nothing leaves the server', mailpit: 'Mailpit test transport - no real inbox', resend: 'Live email via Resend - sends to real recipients',
}
export function SendReviewPage() {
  const { mailboxId, draftId } = useParams()
  if (!mailboxId || !draftId || !canonicalId(mailboxId) || !canonicalId(draftId)) return <><PageHeader title="Review send" /><EmptyState title="Invalid review link" body="Open a saved draft to review it." /></>
  return <Review key={`${mailboxId}\n${draftId}`} mailboxId={mailboxId} draftId={draftId} />
}
function Review({ mailboxId, draftId }: { mailboxId: string; draftId: string }) {
  const gateway = useGateway()
  const navigate = useNavigate()
  const { state: session } = useSession()
  const { proof, request } = useProtectedRequest()
  const mailbox = useMailbox(mailboxId)
  const store = useSendIntent()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [confirmed, setConfirmed] = useState(false)
  const [attempt, setAttempt] = useState<SendAttempt | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const pending = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const checkbox = useId()
  const owner = session.status === 'ready' ? draftIntentKey({ actorId: session.session.actor.id, organizationId: session.session.organization.id, mailboxId, draftId }) : null
  const load = useCallback(async () => {
    setState({ kind: 'loading' }); setConfirmed(false); setMessage(null); setBusy(false)
    pending.current = false
    const outcome = await request((ctx, signal) => gateway.getSendReview(ctx, draftId, mailboxId, signal))
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed') { setState({ kind: 'error', message: 'This review is unavailable. Your draft text has not changed.' }); return }
    const review = outcome.value
    if (review.draft_id !== draftId || review.mailbox_id !== mailboxId) { setState({ kind: 'error', message: 'The review did not match this draft. Nothing was approved.' }); return }
    let retained: SendAttempt | null
    try { retained = owner === null ? null : store.read(owner) }
    catch { setState({ kind: 'error', message: approvalRecoveryMessage }); return }
    const restored = retained?.phase === 'pending' ? { ...retained, phase: 'uncertain' as const } : retained
    if (restored && owner !== null) {
      try { store.update(owner, () => restored) } catch { setState({ kind: 'error', message: approvalRecoveryMessage }); return }
    }
    setAttempt(restored)
    setState({ kind: 'ready', review })
    if (restored?.phase === 'approved' && restored.sendId) navigate(`/mailboxes/${mailboxId}/send-intents/${restored.sendId}`, { replace: true })
  }, [request, gateway, draftId, mailboxId, owner, store, navigate])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (state.kind === 'ready') heading.current?.focus() }, [state.kind])

  const approve = async () => {
    if (state.kind !== 'ready' || !proof || !owner || pending.current || mailbox?.capabilities.approve_send === false) return
    const review = state.review
    const original = attempt?.phase === 'uncertain' ? attempt : null
    if (!original && (!confirmed || !review.ready || review.review_digest === null || !consentGate(review.outbound_mode, review.recipient_checks, review.purpose).allowed)) return
    // AIDEV-NOTE: Retry freezes the ORIGINAL operation/version/digest; newer reviews cannot rebind it.
    const binding: SendAttempt = original ?? { input: { mailbox_id: mailboxId, operation_id: newId(), expected_version: review.draft_version, review_digest: review.review_digest ?? '', correspondence_confirmed: true }, phase: 'pending', sendId: null }
    pending.current = true; setBusy(true); setMessage(null)
    let submitted = false
    try {
      store.write(owner, { ...binding, phase: 'pending' }); setAttempt({ ...binding, phase: 'pending' })
      submitted = true
      const outcome = await request((ctx, signal) => gateway.approveDraftSend(ctx, proof, draftId, binding.input, signal))
      if (outcome.kind === 'stale') { store.update(owner, (current) => current.input.operation_id !== binding.input.operation_id || current.phase === 'approved' ? current : { ...current, phase: 'uncertain' }); return }
      pending.current = false; setBusy(false)
      if (outcome.kind === 'failed') {
        if ((outcome.error instanceof GatewayError && outcome.error.kind === 'transport') || isUncertainWriteOutcome(outcome.error)) {
          const unresolved = { ...binding, phase: 'uncertain' as const }
          store.update(owner, (current) => current.input.operation_id === binding.input.operation_id ? unresolved : current); setAttempt(unresolved)
          setMessage('Approval may have been stored. Retry only this same approval; do not create a replacement draft to resend.')
        } else if (isApiError(outcome.error, 'consent_required')) {
          store.clear(owner); setAttempt(null); setConfirmed(false); setState({ kind: 'consent_blocked' })
        } else {
          store.clear(owner); setAttempt(null); setConfirmed(false)
          const stale = outcome.error instanceof GatewayError && ['review_stale', 'draft_conflict', 'draft_consumed'].includes(outcome.error.code)
          setMessage(stale ? 'The saved draft or review changed. Your draft text is retained. Load a fresh review before approving.' : 'Approval was refused. Nothing on this screen proves an intent was queued.')
          setState({ kind: 'error', message: stale ? 'A fresh review is required.' : 'Approval is unavailable.' })
        }
        return
      }
      const receipt = outcome.value
      if (receipt.draft_id !== draftId || receipt.approved_version !== binding.input.expected_version || receipt.review_digest !== binding.input.review_digest) {
        const unresolved = { ...binding, phase: 'uncertain' as const }
        store.update(owner, (current) => current.input.operation_id === binding.input.operation_id ? unresolved : current); setAttempt(unresolved)
        setMessage('The approval receipt did not match this attempt. The outcome remains uncertain; retry the original approval.')
        return
      }
      store.update(owner, (current) => current.input.operation_id === binding.input.operation_id ? { ...binding, phase: 'approved', sendId: receipt.send_id } : current)
      navigate(`/mailboxes/${mailboxId}/send-intents/${receipt.send_id}`)
    } catch {
      setAttempt(submitted ? { ...binding, phase: 'uncertain' } : original)
      setMessage(submitted ? 'Approval may already be stored, but retry details could not be updated. Restore browser storage and retry only the original approval.' : approvalRecoveryMessage)
    } finally { pending.current = false; setBusy(false) }
  }
  const back = `/mailboxes/${mailboxId}/drafts/${draftId}`
  if (state.kind === 'loading') return <><PageHeader title="Review send" /><div role="status" aria-label="Loading send review"><Skeleton rows={5} /></div></>
  if (state.kind === 'consent_blocked') return <><PageHeader title="Review send" /><div className="flex max-w-3xl flex-col items-start gap-4"><Callout variant="danger" role="alert" heading="Approval blocked: consent required"><p>Recorded opt-in consent is required for every recipient before this message can be queued.</p><p>The server refused this approval. Nothing was queued.</p></Callout><Link to="/outreach/leads" className={buttonClass('primary', 'md')}>Record consent evidence</Link><Link to={back} className={linkClass}>Back to draft</Link></div></>
  if (state.kind === 'error') return <><PageHeader title="Review send" /><div className="flex max-w-3xl flex-col items-start gap-4"><Callout variant="danger" role="alert">{message ?? state.message}</Callout><Button variant="primary" onClick={() => void load()}>Load fresh review</Button><Link to={back} className={linkClass}>Back to draft</Link></div></>
  const review = state.review
  const retry = attempt?.phase === 'uncertain'
  const gate = consentGate(review.outbound_mode, review.recipient_checks, review.purpose)
  const approvable = review.ready && gate.allowed
  const dt = 'text-xs font-medium uppercase tracking-wide text-zinc-500'
  // break-words: a 998-character unbroken subject or address must wrap inside the card (CS-02).
  const dd = 'mt-1 min-w-0 break-words text-sm text-zinc-800 dark:text-white'
  return <article aria-busy={busy}>
    <PageHeader title="Review send" subtitle="Approve the exact saved content before anything is queued" />
    <Card className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-2"><Badge tone="warn">{review.simulated ? 'Simulated - no live mail' : MODE_LABEL[review.outbound_mode]}</Badge></div>
      <h1 ref={heading} tabIndex={-1} className="text-base font-medium text-zinc-800 dark:text-white">Review saved draft version {review.draft_version}</h1>
      <p className="text-sm text-zinc-500">{review.purpose === 'marketing' ? 'You are reviewing a campaign message with recorded marketing consent.' : 'You are approving your own saved draft for individual correspondence.'}</p>
      <dl className="grid gap-4 sm:grid-cols-2"><div><dt className={dt}>From</dt><dd className={`${dd} whitespace-pre-wrap`}>{review.sender.address ?? '(sender not configured)'}</dd></div>
        <div><dt className={dt}>Purpose</dt><dd className={dd}>{review.purpose === 'marketing' ? 'Marketing campaign' : 'Individual correspondence'}</dd></div>
        <div className="sm:col-span-2"><dt className={dt}>To — all {review.to.length} recipients</dt><dd className={dd}>{review.to.length === 0 ? '(no recipients)' : <ol className="list-decimal ps-5">{review.to.map((recipient, index) => <li key={index} className="whitespace-pre-wrap">{recipient.display_name === null ? '' : `${recipient.display_name} `}{recipient.address ?? '(address missing)'}</li>)}</ol>}</dd></div>
        <div className="sm:col-span-2"><dt className={dt}>Subject</dt><dd className={`${dd} whitespace-pre-wrap`}>{review.subject === '' ? '(no subject)' : review.subject}</dd></div>
        <div className="sm:col-span-2"><dt className={dt}>Message</dt><dd className={`${dd} whitespace-pre-wrap break-words rounded-lg border border-zinc-200 bg-zinc-50 p-3 leading-6 dark:border-zinc-700 dark:bg-zinc-900`}>{review.body_text === '' ? '(empty message)' : review.body_text}</dd></div>
        <div className="sm:col-span-2"><dt className={dt}>Attachments</dt>
        <dd className={dd}>{review.attachments.length === 0 ? 'None.' : <ul className="list-disc ps-5">{review.attachments.map((attachment) =>
          <li key={attachment.id} className="break-all">{attachment.filename} ({attachment.byte_size} bytes): {attachment.status === 'clean' ? 'Security scan passed' : 'Sending blocked: security scan not passed'}</li>)}</ul>}
        {!review.attachments_supported && ' This sending route does not support attachments.'}</dd></div>
      </dl>
      {review.reply_to_thread_id !== null && <Link to={`/mailboxes/${mailboxId}/threads/${review.reply_to_thread_id}`} className={linkClass}>Reply context</Link>}
      {!review.ready && <Callout variant="warning" role="alert"><p>This draft is not ready for approval.</p><ul className="list-disc ps-5">{review.issues.map((issue, index) => <li key={index}>{issue.code.replaceAll('_', ' ')}{issue.recipient_index === null ? '' : ` — recipient ${issue.recipient_index + 1}`}</li>)}</ul></Callout>}
      {!gate.allowed && <div role="alert" aria-label="Consent required"><Callout variant="danger" heading="Approval blocked: consent required" actions={<Link to="/outreach/leads" className={buttonClass('outline', 'sm')}>Record consent evidence</Link>}><p>{gate.reason}</p><ul className="list-disc ps-5">{gate.recipientIndexes.map((index) => <li key={index} className="whitespace-pre-wrap">Recipient {index + 1}: {review.to[index]?.address ?? '(address missing)'} has no consent evidence</li>)}</ul></Callout></div>}
      {message && <Callout variant="neutral" role="alert">{message}</Callout>}
      {retry ? <p role="note" className="text-sm text-zinc-500">Original approval retry details survive reloads in this tab. Closing this tab clears them. The earlier approval may already be stored.</p> : <div className="flex items-start gap-3"><Checkbox id={checkbox} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy || !approvable} className="mt-0.5" /><label htmlFor={checkbox} className="text-sm text-zinc-800 dark:text-white">{review.purpose === 'marketing' ? 'I confirm this marketing message and its opted-in recipients, and approve the full content shown above.' : review.simulated ? 'I confirm this is individual correspondence and approve the full content and recipients shown above.' : 'I confirm these recipients have opted in and approve sending this full content as live email.'}</label></div>}
      <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-5 dark:border-zinc-700">
        <Button variant="primary" disabled={busy || !proof || mailbox?.capabilities.approve_send === false || (!retry && (!confirmed || !approvable || review.review_digest === null))} onClick={() => void approve()}>{busy ? 'Approving…' : retry ? 'Retry original approval' : review.simulated ? 'Approve simulated send' : 'Approve live send'}</Button>
        <Link to={back} className={buttonClass('ghost', 'md')}>Back to draft</Link>
      </div>
    </Card>
  </article>
}
