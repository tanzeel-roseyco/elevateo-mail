import { DraftAttachments } from './DraftAttachments'
// Durable draft editor (BE-02 C §4–§5) over the pure draft-operation model. Explicit Save only:
// each save is one operation id bound to one frozen payload. Definitive conflicts offer "load
// the server copy" or "keep my text and continue from the server version" (a fresh operation on
// the next save); uncertain outcomes keep the text and offer an exact retry or a ledger lookup.
// Unsaved text and unresolved attempts are retained in the session-scoped intent store so a
// context recovery, a remount or a navigation never destroys them; they are shown again only
// after a current authorized read of the same draft by the same actor and organization.
// Saved, unchanged drafts can enter the separate review/approval screen; its server response identifies live transport.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { describeFailure, type CollaborationFailure } from '@/app/collaborationFailure'
import { draftIntentKey, formatRecipients, isDraftIntentDirty, useDraftIntent, type DraftIntent } from '@/app/draftIntent'
import { useMailbox } from '@/app/mailboxes'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useGateway, useSession } from '@/app/session'
import type { Draft } from '@/data/contract'
import { isApiError } from '@/data/errors'
import {
  adoptServerCopy,
  applySaved,
  applySaveFailure,
  beginSave,
  dismissRejection,
  edit,
  isDirty,
  newDraftBuffer,
  pendingReplay,
  rebase,
  receiptBinding,
  reconcile,
  type DraftBuffer,
  type DraftContent,
} from '@/domain/draftOperation'
import { canonicalId, codePoints, newId } from '@/lib/ids'
import { cx, formatDateTime } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { Button, IconButton, buttonClass } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { ArrowLeftIcon, DocumentTextIcon, PaperClipIcon, TrashIcon } from '@/ui/icons'

const LIMITS = { subject: 998, body: 65536, recipients: 100, addressPart: 256 } as const

const NOTES = {
  restored: 'Your unsaved text from before the interruption was restored on this screen. It has not been saved.',
  unknown: 'No record of this save is visible yet. It may still be in progress; it is not proof that nothing was stored. Retry the same save or check again.',
  mismatchedReceipt: 'The server returned a record for a different mailbox, draft or base version. Nothing was applied; this attempt stays unresolved.',
  unavailableOnRead:
    'The server reports this draft as unavailable to you now. Nothing was changed: your text and this save attempt are kept here. That answer alone does not show whether the attempt was stored.',
  consumedOnRead: 'The server copy is consumed, so nothing more can be saved to it. Your text and this attempt are kept on this screen, read-only; only "Discard my text" replaces them.',
} as const

type EditorState =
  | { status: 'loading' }
  | { status: 'ready'; buffer: DraftBuffer; consumed: boolean; meta: { createdAt: string | null; updatedAt: string | null } }
  | { status: 'unavailable' }
  | { status: 'error'; failure: CollaborationFailure }

function contentOf(draft: Draft): DraftContent {
  return { subject: draft.subject, to: draft.to.map((a) => ({ ...a })), body_text: draft.body_text, reply_to_thread_id: draft.reply_to_thread_id }
}

/** One recipient per line: `Name <address>`, `address`, or a bare name. Empty lines are skipped. */
export function parseRecipients(text: string): DraftContent['to'] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const match = /^(.*?)\s*<([^<>]*)>$/.exec(line)
      if (match) {
        const name = match[1]?.trim() ?? ''
        const address = match[2]?.trim() ?? ''
        return { display_name: name === '' ? null : name, address: address === '' ? null : address }
      }
      return line.includes('@') ? { display_name: null, address: line } : { display_name: line, address: null }
    })
}

export { formatRecipients } from '@/app/draftIntent'

function validateContent(content: DraftContent): Partial<Record<'subject' | 'to' | 'body', string>> {
  const errors: Partial<Record<'subject' | 'to' | 'body', string>> = {}
  if (codePoints(content.subject) > LIMITS.subject) errors.subject = `The subject is at most ${LIMITS.subject} characters.`
  if (codePoints(content.body_text) > LIMITS.body) errors.body = `The message is at most ${LIMITS.body} characters.`
  if (content.to.length > LIMITS.recipients) errors.to = `At most ${LIMITS.recipients} recipients.`
  else if (content.to.some((a) => codePoints(a.display_name ?? '') > LIMITS.addressPart || codePoints(a.address ?? '') > LIMITS.addressPart)) {
    errors.to = `Each recipient name and address is at most ${LIMITS.addressPart} characters.`
  }
  return errors
}

/** A save that was in flight when the editor went away can only be settled by the ledger now. */
function settleInterruptedSave(intent: DraftIntent): DraftIntent {
  const status = intent.buffer.status
  if (status.kind !== 'saving') return intent
  return { ...intent, buffer: applySaveFailure(intent.buffer, status.attempt, undefined) }
}

export function DraftEditorPage() {
  const { mailboxId, draftId } = useParams<{ mailboxId: string; draftId: string }>()
  if (mailboxId === undefined || draftId === undefined) return null
  if (canonicalId(draftId) === null) return <EmptyState title="This draft link is not valid" body="The draft id in the address is not a UUID." />
  // Resource owner key (D3): a different draft starts with fresh editor state and its own buffer.
  return <DraftEditor key={`${mailboxId}\n${draftId}`} mailboxId={mailboxId} draftId={draftId.toLowerCase()} />
}

function DraftEditor({ mailboxId, draftId }: { mailboxId: string; draftId: string }) {
  const gateway = useGateway()
  const { state: sessionState } = useSession()
  const intentStore = useDraftIntent()
  const [searchParams] = useSearchParams()
  const isNew = searchParams.get('new') === '1'
  const replyTo = canonicalId(searchParams.get('reply_to') ?? '')
  const mailbox = useMailbox(mailboxId)
  const { proof, request } = useProtectedRequest()
  const [state, setState] = useState<EditorState>({ status: 'loading' })
  const [recipientsText, setRecipientsText] = useState('')
  const [note, setNote] = useState<string | null>(null)
  // AIDEV-NOTE: Busy state belongs to one lookup/recovery request (token), not to the component:
  // a stale completion releases only its own token and a renewed context starts unbusy (finding 6).
  const [busyToken, setBusyToken] = useState<number | null>(null)
  const busyCounterRef = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const ids = { subject: useId(), to: useId(), body: useId() }

  // Full owner of this draft's local intent; null outside a ready session (nothing is retained then).
  const ownerKey =
    sessionState.status === 'ready'
      ? draftIntentKey({ actorId: sessionState.session.actor.id, organizationId: sessionState.session.organization.id, mailboxId, draftId })
      : null
  const ownerKeyRef = useRef(ownerKey)
  ownerKeyRef.current = ownerKey

  const busy = busyToken !== null
  const beginBusy = () => {
    const token = ++busyCounterRef.current
    setBusyToken(token)
    return token
  }
  const endBusy = (token: number) => setBusyToken((current) => (current === token ? null : current))

  const setBuffer = (update: (buffer: DraftBuffer) => DraftBuffer) =>
    setState((prev) => (prev.status === 'ready' ? { ...prev, buffer: update(prev.buffer) } : prev))

  /** Applies a save outcome to the screen AND to the retained intent, so an unmounted editor's attempt is still settled. */
  const commitSaveOutcome = (key: string | null, update: (buffer: DraftBuffer) => DraftBuffer) => {
    setBuffer(update)
    if (key !== null) intentStore.update(key, (intent) => ({ ...intent, buffer: update(intent.buffer) }))
  }

  // Write-through: dirty text, raw recipient input and any non-idle attempt are retained under the
  // owner key; only canonical clean idle text retains nothing. Never proofs, never server copies.
  useEffect(() => {
    if (ownerKey === null || state.status !== 'ready') return
    if (isDraftIntentDirty({ buffer: state.buffer, recipientsText }) || state.buffer.status.kind !== 'idle') intentStore.write(ownerKey, { buffer: state.buffer, recipientsText })
    else intentStore.clear(ownerKey)
  }, [intentStore, ownerKey, state, recipientsText])

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    setNote(null)
    // A renewed context restarts here; whoever was busy before is stale now.
    setBusyToken(null)
    const outcome = await request((ctx, signal) => gateway.getDraft(ctx, draftId, mailboxId, signal))
    if (outcome.kind === 'stale') return
    // Only a successful current read (or the expected pre-create 404) re-presents retained intent.
    const key = ownerKeyRef.current
    const retained = key === null ? null : intentStore.read(key)
    const restored = retained === null ? null : settleInterruptedSave(retained)
    if (outcome.kind === 'failed') {
      // A 404 for a freshly minted id is the expected "absent before version-zero create" case.
      if (isApiError(outcome.error, 'not_available') && isNew) {
        const content: DraftContent = { subject: '', to: [], body_text: '', reply_to_thread_id: replyTo }
        setRecipientsText(restored?.recipientsText ?? '')
        setNote(restored === null ? null : NOTES.restored)
        setState({ status: 'ready', buffer: restored?.buffer ?? newDraftBuffer(draftId, mailboxId, content, 0), consumed: false, meta: { createdAt: null, updatedAt: null } })
        return
      }
      // Unavailable or failed reads present nothing; retained intent waits for a later authorized read.
      const failure = describeFailure(outcome.error, 'read')
      setState(failure.code === 'unavailable_resource' ? { status: 'unavailable' } : { status: 'error', failure })
      return
    }
    const draft = outcome.value.draft
    const content = contentOf(draft)
    setRecipientsText(restored?.recipientsText ?? formatRecipients(content.to))
    setNote(restored === null ? null : NOTES.restored)
    setState({
      status: 'ready',
      buffer: restored?.buffer ?? newDraftBuffer(draftId, mailboxId, content, draft.version),
      consumed: draft.state === 'consumed',
      meta: { createdAt: draft.created_at, updatedAt: draft.updated_at },
    })
  }, [gateway, request, intentStore, draftId, mailboxId, isNew, replyTo])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (state.status === 'ready') headingRef.current?.focus()
  }, [state.status])

  const canCompose = mailbox === undefined ? true : mailbox.capabilities.compose
  const updateContent = (patch: Partial<DraftContent>) => setBuffer((buffer) => edit(buffer, { ...buffer.content, ...patch }))

  const save = async () => {
    const current = stateRef.current
    if (current.status !== 'ready' || !proof || current.consumed || !canCompose) return
    // A fresh save validates the live text. An exact retry resends the frozen payload, which was
    // valid when captured, independently of newer invalid local edits (finding 3).
    if (pendingReplay(current.buffer) === null && Object.keys(validateContent(current.buffer.content)).length > 0) return
    const begun = beginSave(current.buffer, newId)
    if (begun.attempt === null) return
    const attempt = begun.attempt
    const key = ownerKey
    setNote(null)
    setBuffer(() => begun.buffer)
    if (key !== null) intentStore.write(key, { buffer: begun.buffer, recipientsText })
    const outcome = await request((ctx, signal) => gateway.saveDraft(ctx, proof, draftId, attempt.payload, signal))
    if (outcome.kind === 'stale') {
      // Ownership moved on while the save was in flight (or the editor went away): the server may
      // have committed it, so the attempt becomes uncertain instead of being forgotten. A late
      // success or error can never be applied as a result (D05).
      commitSaveOutcome(key, (buffer) => applySaveFailure(buffer, attempt, undefined))
      return
    }
    if (outcome.kind === 'failed') {
      commitSaveOutcome(key, (buffer) => applySaveFailure(buffer, attempt, outcome.error))
      return
    }
    commitSaveOutcome(key, (buffer) => applySaved(buffer, attempt, outcome.value))
    // Timestamps are server-owned and not returned by the save; show the version until the next read.
    // The ?new=1 marker stays in the URL: a later reload GETs the now-existing draft, and only a
    // genuine 404 under that marker is treated as "not created yet".
    setState((prev) => (prev.status === 'ready' ? { ...prev, meta: { createdAt: prev.meta.createdAt, updatedAt: null } } : prev))
  }

  /** Ledger lookup for the uncertain attempt; "unknown" keeps it unresolved by design (§5). */
  const checkOutcome = async () => {
    const current = stateRef.current
    if (current.status !== 'ready' || current.buffer.status.kind !== 'uncertain' || busy) return
    const attempt = current.buffer.status.attempt
    const token = beginBusy()
    setNote(null)
    const outcome = await request((ctx, signal) => gateway.getDraftOperation(ctx, attempt.operationId, mailboxId, draftId, signal))
    endBusy(token)
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed') {
      setNote(describeFailure(outcome.error, 'read').message)
      return
    }
    const operation = outcome.value.operation
    // A schema-valid record under another binding proves nothing about this attempt (finding 7).
    if (receiptBinding(current.buffer, attempt, operation) === 'mismatch') {
      setNote(NOTES.mismatchedReceipt)
      return
    }
    if (operation.outcome === 'unknown') setNote(NOTES.unknown)
    setBuffer((buffer) => reconcile(buffer, attempt, operation))
  }

  /**
   * Both ways out of a conflict read the server copy first; nothing is overwritten blindly, and a
   * read that fails or reports "unavailable" changes nothing locally (finding 4, D05).
   */
  const resolveConflict = async (mode: 'adopt' | 'rebase') => {
    const current = stateRef.current
    if (current.status !== 'ready' || busy) return
    const token = beginBusy()
    setNote(null)
    const outcome = await request((ctx, signal) => gateway.getDraft(ctx, draftId, mailboxId, signal))
    endBusy(token)
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed') {
      setNote(isApiError(outcome.error, 'not_available') ? NOTES.unavailableOnRead : describeFailure(outcome.error, 'read').message)
      return
    }
    const draft = outcome.value.draft
    const serverContent = contentOf(draft)
    const meta = { createdAt: draft.created_at, updatedAt: draft.updated_at }
    if (draft.state === 'consumed' && mode === 'rebase') {
      // Keep text and attempt, disable writes; only an explicit adopt discards them (finding 5).
      setNote(NOTES.consumedOnRead)
      setState((prev) => (prev.status === 'ready' ? { ...prev, consumed: true, meta } : prev))
      return
    }
    setState((prev) =>
      prev.status === 'ready'
        ? {
            ...prev,
            consumed: draft.state === 'consumed',
            meta,
            buffer: mode === 'adopt' ? adoptServerCopy(prev.buffer, draft.version, serverContent) : rebase(prev.buffer, draft.version, serverContent),
          }
        : prev,
    )
    if (mode === 'adopt') setRecipientsText(formatRecipients(serverContent.to))
  }

  const backTo = `/mailboxes/${mailboxId}/drafts`
  if (state.status === 'loading') return <div role="status" aria-label="Loading draft" className="p-4"><Skeleton rows={5} /></div>
  if (state.status === 'unavailable') {
    return (
      <div className="p-4">
        <EmptyState icon={<DocumentTextIcon className="size-5" />} title="This draft is unavailable" body="It may not exist, it may belong to someone else, or you may no longer be able to compose in this mailbox." action={<Link to={backTo} className={buttonClass('primary', 'md')}>Back to drafts</Link>} />
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="p-4">
        <ErrorState title="The draft could not be loaded" body={state.failure.message} action={<Button variant="primary" onClick={() => void load()}>Try again</Button>} />
      </div>
    )
  }

  const { buffer, consumed } = state
  const status = buffer.status
  const errors = validateContent(buffer.content)
  const locked = consumed || status.kind === 'saving' || status.kind === 'conflict' || status.kind === 'unusable' || !proof || !canCompose
  // Writes (fresh save, exact retry, rebase) need compose authority and an editable server copy.
  const canWrite = !consumed && proof !== null && canCompose
  const dirty = isDirty(buffer)
  const hold = status.kind === 'uncertain' ? status.retryAfterSeconds : null
  const title = buffer.savedVersion === 0 ? 'New draft' : buffer.content.subject === '' ? '(no subject)' : buffer.content.subject

  return (
    <article aria-label="Draft" className="flex min-h-0 flex-col">
      {/* Status strip: back link, save state and the transport reminder. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-xs text-muted ">
        <Link to={backTo} className="inline-flex items-center gap-1 rounded-md font-medium text-fg hover:underline ">
          <ArrowLeftIcon className="size-4" /> Back to drafts
        </Link>
        <span aria-hidden>·</span>
        <span>{buffer.savedVersion === 0 ? 'Not saved yet' : `Saved version ${buffer.savedVersion}`}</span>
        {state.meta.updatedAt !== null && <span>· updated {formatDateTime(state.meta.updatedAt)}</span>}
        {dirty && !consumed && <Badge tone="accent" size="sm">Unsaved changes</Badge>}
        {consumed && <Badge tone="neutral" size="sm">Consumed — read only</Badge>}
        {buffer.content.reply_to_thread_id !== null && (
          <Link to={`/mailboxes/${mailboxId}/threads/${buffer.content.reply_to_thread_id}`} className="underline">Replying to a conversation</Link>
        )}
        <Badge tone="warn" size="sm" className="ms-auto">Draft only — nothing is sent</Badge>
      </div>
      <h1 ref={headingRef} tabIndex={-1} className="sr-only">{title}</h1>
      {!canCompose && <p role="alert" className="border-b border-line px-4 py-2 text-sm text-danger ">Composing is not available in this mailbox; this draft is shown read-only.</p>}
      {note !== null && <p role="status" className="border-b border-line bg-surface-2 px-4 py-2 text-sm text-fg   ">{note}</p>}

      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        aria-busy={status.kind === 'saving' || busy}
        noValidate
      >
        {/* Borderless Gmail-style rows separated by hairlines (INBOX-SPEC compose window). */}
        <ComposeField id={ids.to} label="To" hint="One recipient per line: Name <address> or just an address. Incomplete recipients are kept as typed." error={errors.to ?? null}>
          <textarea
            id={ids.to}
            value={recipientsText}
            onChange={(e) => {
              setRecipientsText(e.target.value)
              updateContent({ to: parseRecipients(e.target.value) })
            }}
            disabled={locked}
            rows={2}
            aria-describedby={`${ids.to}-hint${errors.to ? ` ${ids.to}-error` : ''}`}
            aria-invalid={errors.to ? true : undefined}
            spellCheck={false}
            className={COMPOSE_INPUT}
          />
        </ComposeField>
        <ComposeField id={ids.subject} label="Subject" error={errors.subject ?? null}>
          <input id={ids.subject} type="text" value={buffer.content.subject} onChange={(e) => updateContent({ subject: e.target.value })} disabled={locked} aria-invalid={errors.subject ? true : undefined} aria-describedby={errors.subject ? `${ids.subject}-error` : undefined} autoComplete="off" className={cx(COMPOSE_INPUT, 'h-10')} />
        </ComposeField>
        <ComposeField id={ids.body} label="Message" labelHidden hint={`${codePoints(buffer.content.body_text)} / ${LIMITS.body} characters`} error={errors.body ?? null}>
          <textarea id={ids.body} value={buffer.content.body_text} onChange={(e) => updateContent({ body_text: e.target.value })} disabled={locked} rows={10} aria-describedby={`${ids.body}-hint${errors.body ? ` ${ids.body}-error` : ''}`} aria-invalid={errors.body ? true : undefined} placeholder="Write your message" className={cx(COMPOSE_INPUT, 'min-h-40 py-2 leading-6')} />
        </ComposeField>

        <div className="flex flex-col gap-3 px-4 py-3">
          {buffer.savedVersion > 0 && <DraftAttachments draftId={draftId} mailboxId={mailboxId} disabled={locked || dirty || status.kind !== 'idle'} />}

          {status.kind === 'rejected' && (
            <Callout variant="danger" role="alert" actions={<Button size="sm" onClick={() => setBuffer(dismissRejection)}>Edit and try again</Button>}>
              {status.message}
            </Callout>
          )}
          {(status.kind === 'saving' || status.kind === 'uncertain') && (
            <p role="note" className="text-sm text-warn ">
              Keep this tab open. Reloading or closing it loses your unsaved text and this save’s retry details.
              The save may still reach the server; recovery after a full reload is unavailable.
            </p>
          )}
          {status.kind === 'uncertain' && (
            <Callout
              variant="warning"
              role="alert"
              actions={
                <>
                  <Button size="sm" variant="primary" disabled={busy || !canWrite} onClick={() => void save()}>Retry this save</Button>
                  <Button size="sm" disabled={busy} onClick={() => void checkOutcome()}>{busy ? 'Checking…' : 'Check what the server stored'}</Button>
                </>
              }
            >
              <span>{status.message}{hold !== null && ` The server asked to wait ${hold} s before retrying.`}</span>
              <span className="block text-xs text-muted">The retry resends exactly the same save (same attempt id and text), so it cannot create a second version.</span>
            </Callout>
          )}
          {status.kind === 'conflict' && (
            <Callout
              variant="warning"
              role="alert"
              actions={
                <>
                  {canWrite && <Button size="sm" variant="primary" disabled={busy} onClick={() => void resolveConflict('rebase')}>Keep my text and continue from the server version</Button>}
                  <Button size="sm" disabled={busy} onClick={() => void resolveConflict('adopt')}>Discard my text and load the server copy</Button>
                </>
              }
            >
              {status.code === 'draft_consumed'
                ? 'This draft has been consumed and can no longer be edited. Your text is kept on this screen only.'
                : `This draft changed elsewhere${status.currentVersion !== null ? ` (now version ${status.currentVersion})` : ''}. Your text was not saved and nothing was overwritten.`}
            </Callout>
          )}
          {status.kind === 'unusable' && (
            <Callout variant="warning" role="alert" actions={canWrite && <Button size="sm" variant="primary" disabled={busy} onClick={() => void resolveConflict('rebase')}>Start a new save from the server version</Button>}>
              {status.reason === 'expired'
                ? 'The record of this save attempt has expired, so the attempt cannot be reused. Your text is kept here.'
                : 'This save attempt cannot be reused with different content. Your text is kept here.'}
            </Callout>
          )}
        </div>

        {/* Footer: primary save, review-send entry, attachment and discard affordances. */}
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 ">
          {status.kind !== 'uncertain' && (
            <Button type="submit" variant="primary" disabled={locked || Object.keys(errors).length > 0}>
              {status.kind === 'saving' ? 'Saving…' : buffer.savedVersion === 0 ? 'Save draft' : 'Save changes'}
            </Button>
          )}
          {!consumed && canCompose && mailbox?.capabilities.approve_send === true && buffer.savedVersion > 0 && status.kind === 'idle' && !dirty && recipientsText === formatRecipients(buffer.savedContent.to) && (
            <Link to={`/mailboxes/${mailboxId}/drafts/${draftId}/send-review`} className={buttonClass('outline', 'md')}>{sessionState.status === 'ready' && sessionState.session.simulation_mode ? 'Review simulated send' : 'Review send'}</Link>
          )}
          {status.kind === 'saving' && <span role="status" className="text-xs text-muted">Saving…</span>}
          <span className="ms-auto flex items-center gap-0.5">
            <IconButton label="Attach file (save the draft first)" disabled><PaperClipIcon className="size-5" /></IconButton>
            <IconButton label="Discard (not available yet)" disabled><TrashIcon className="size-5" /></IconButton>
          </span>
        </div>
      </form>
    </article>
  )
}

const COMPOSE_INPUT = 'w-full min-w-0 bg-transparent px-0 text-sm text-fg placeholder-muted outline-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 '

/** Borderless compose row: label on the start side, control filling the rest, hint/error below. */
function ComposeField({ id, label, labelHidden = false, hint, error, children }: { id: string; label: string; labelHidden?: boolean; hint?: string; error: string | null; children: ReactNode }) {
  return (
    <div className="border-b border-line px-4 py-1 ">
      <div className="flex items-start gap-3">
        <label htmlFor={id} className={cx('w-16 shrink-0 pt-2.5 text-sm text-muted', labelHidden && 'sr-only')}>{label}</label>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {hint && <p id={`${id}-hint`} className="pb-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="pb-1 text-sm font-medium text-danger">{error}</p>}
    </div>
  )
}
