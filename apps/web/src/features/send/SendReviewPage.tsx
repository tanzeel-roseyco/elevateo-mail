import { approvalRecoveryMessage } from '@/app/approvalRecovery'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { draftIntentKey } from '@/app/draftIntent'
import { useMailbox } from '@/app/mailboxes'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useSendIntent, type SendAttempt } from '@/app/sendIntent'
import { useGateway, useSession } from '@/app/session'
import { GatewayError, isApiError, isUncertainWriteOutcome } from '@/data/errors'
import { CONSENT_REQUIRED_REASON, consentGate } from '@/domain/sendConsent'
import type { SendReview } from '@/data/sendContract'
import { canonicalId, newId } from '@/lib/ids'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { EmptyState, Skeleton } from '@/ui/Async'

// AIDEV-NOTE: 'consent_blocked' has no dismiss or retry: only new consent evidence can change it.
type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'consent_blocked' } | { kind: 'ready'; review: SendReview }
const MODE_LABEL: Record<SendReview['outbound_mode'], string> = {
  held: 'Outbound held - nothing leaves the server', mailpit: 'Mailpit test transport - no real inbox', resend: 'Live email via Resend - sends to real recipients',
}
export function SendReviewPage() {
  const { mailboxId, draftId } = useParams()
  if (!mailboxId || !draftId || !canonicalId(mailboxId) || !canonicalId(draftId)) return <EmptyState title="Invalid review link" body="Open a saved draft to review it." />
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
    if (!original && (!confirmed || !review.ready || review.review_digest === null || !consentGate(review.outbound_mode, review.recipient_checks).allowed)) return
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
  if (state.kind === 'loading') return <div role="status" aria-label="Loading send review"><Skeleton rows={5} /></div>
  if (state.kind === 'consent_blocked') return <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 p-4"><div role="alert" className="space-y-1 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[13px]"><h1 className="text-base font-semibold text-danger">Approval blocked: consent required</h1><p>{CONSENT_REQUIRED_REASON}</p><p>The server refused this approval. Nothing was queued.</p></div><Link to="/outreach/leads" className="font-medium text-accent-text underline underline-offset-2">Record consent evidence</Link><Link to={back}>Back to draft</Link></div>
  if (state.kind === 'error') return <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 p-4"><p role="alert">{message ?? state.message}</p><Button onClick={() => void load()}>Load fresh review</Button><Link to={back} className="text-[13px] font-medium text-accent-text underline-offset-2 hover:underline">Back to draft</Link></div>
  const review = state.review
  const retry = attempt?.phase === 'uncertain'
  const gate = consentGate(review.outbound_mode, review.recipient_checks)
  const approvable = review.ready && gate.allowed
  return <article className="mx-auto max-w-3xl p-3" aria-busy={busy}>
    <Link to={back}>Back to draft</Link> <Badge tone="warn">{review.simulated ? 'Simulated - no live mail' : MODE_LABEL[review.outbound_mode]}</Badge>
    <h1 ref={heading} tabIndex={-1} className="my-3 text-base font-semibold">Review saved draft version {review.draft_version}</h1>
    <p>You are approving your own saved draft for individual correspondence.</p>
    <dl className="my-3 space-y-2"><dt>From</dt><dd className="whitespace-pre-wrap">{review.sender.address ?? '(sender not configured)'}</dd>
      <dt>To — all {review.to.length} recipients</dt><dd>{review.to.length === 0 ? '(no recipients)' : <ol>{review.to.map((recipient, index) => <li key={index} className="whitespace-pre-wrap">{recipient.display_name === null ? '' : `${recipient.display_name} `}{recipient.address ?? '(address missing)'}</li>)}</ol>}</dd>
      <dt>Subject</dt><dd className="whitespace-pre-wrap">{review.subject === '' ? '(no subject)' : review.subject}</dd>
      <dt>Message</dt><dd className="whitespace-pre-wrap break-words">{review.body_text === '' ? '(empty message)' : review.body_text}</dd>
      <dt>Purpose</dt><dd>Individual correspondence</dd><dt>Attachments</dt>
      <dd>{review.attachments.length === 0 ? 'None.' : <ul>{review.attachments.map((attachment) =>
        <li key={attachment.id} className="break-all">{attachment.filename} ({attachment.byte_size} bytes): {attachment.status === 'clean' ? 'Security scan passed' : 'Sending blocked: security scan not passed'}</li>)}</ul>}
      {!review.attachments_supported && ' This sending route does not support attachments.'}</dd>
    </dl>
    {review.reply_to_thread_id !== null && <Link to={`/mailboxes/${mailboxId}/threads/${review.reply_to_thread_id}`}>Reply context</Link>}
    {!review.ready && <div role="alert"><p>This draft is not ready for approval.</p><ul>{review.issues.map((issue, index) => <li key={index}>{issue.code.replaceAll('_', ' ')}{issue.recipient_index === null ? '' : ` — recipient ${issue.recipient_index + 1}`}</li>)}</ul></div>}
    {!gate.allowed && <div role="alert" aria-label="Consent required" className="my-3 space-y-1 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[13px]"><p className="font-semibold text-danger">Approval blocked: consent required</p><p>{gate.reason}</p><ul>{gate.recipientIndexes.map((index) => <li key={index} className="whitespace-pre-wrap">Recipient {index + 1}: {review.to[index]?.address ?? '(address missing)'} has no consent evidence</li>)}</ul><Link to="/outreach/leads" className="font-medium text-accent-text underline underline-offset-2">Record consent evidence</Link></div>}
    {message && <p role="alert">{message}</p>}
    {retry ? <p role="note">Original approval retry details survive reloads in this tab. Closing this tab clears them. The earlier approval may already be stored.</p> : <div className="my-3"><input id={checkbox} type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy || !approvable} /><label htmlFor={checkbox}>{review.simulated ? 'I confirm this is individual correspondence and approve the full content and recipients shown above.' : 'I confirm these recipients have opted in and approve sending this full content as live email.'}</label></div>}
    <Button variant="primary" disabled={busy || !proof || mailbox?.capabilities.approve_send === false || (!retry && (!confirmed || !approvable || review.review_digest === null))} onClick={() => void approve()}>{busy ? 'Approving…' : retry ? 'Retry original approval' : review.simulated ? 'Approve simulated send' : 'Approve live send'}</Button>
  </article>
}
