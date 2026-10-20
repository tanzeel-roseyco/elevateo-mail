// Paginated plaintext conversation reader. Escaped-text-in-<pre> presentation follows the audited
// first-party live reader; no HTML, Markdown, autolinks or remote images. Optional private
// attachment metadata is explicit, and clean bytes pass only through the authorized proxy.
// A read never marks mail read (GET-only contract); BE-02 D adds the explicit read-state control,
// the assignment panel and immutable notes below the messages, and a reply-as-draft entry (C).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import type { Message, ThreadDetailPage } from '@/data/contract'
import type { ReadContext } from '@/data/gateway'
import { GatewayError, isApiError } from '@/data/errors'
import { useMailbox } from '@/app/mailboxes'
import { useGateway, useSession } from '@/app/session'
import { draftIntentKey, formatRecipients, useDraftIntent } from '@/app/draftIntent'
import { edit, newDraftBuffer } from '@/domain/draftOperation'
import { canonicalId, newId } from '@/lib/ids'
import { newTraversalBudget, readPage } from '@/lib/readPage'
import { cx, formatDateTime } from '@/lib/format'
import { Avatar } from '@/ui/Avatar'
import { Callout } from '@/ui/Callout'
import { Badge } from '@/ui/Badge'
import { Button, IconButton } from '@/ui/Button'
import { EmptyState, Skeleton } from '@/ui/Async'
import { ArchiveBoxIcon, ArrowLeftIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, ClockIcon, EllipsisVerticalIcon, EnvelopeIcon, ExclamationTriangleIcon, TrashIcon } from '@/ui/icons'
import { AssignmentPanel } from './AssignmentPanel'
import { NotesPanel } from './NotesPanel'
import { ReadStateControl } from './ReadStateControl'
import { MessageAttachments, type AttachmentReadPort } from './MessageAttachments'

type ReaderState =
  | { status: 'loading' }
  | { status: 'ready'; thread: ThreadDetailPage['thread']; messages: Message[]; nextCursor: string | null; loadingMore: boolean; pageError: string | null }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }

export type DirectMessageRead = (ctx: ReadContext, mailboxId: string, threadId: string, messageId: string, signal?: AbortSignal) => Promise<{
  context_id: string; authorization_version: string; mailbox_id: string; thread_id: string; message: Message
}>

type DirectState =
  | { status: 'loading' | 'unavailable' | 'error'; messageId: string }
  | { status: 'ready'; messageId: string; message: Message }
  | null

function sameAddressLine(message: Message): string {
  if (message.to.length === 0) return 'No recipients recorded'
  return `To: ${message.to.map((a) => a.display_name ?? a.address ?? 'Unknown recipient').join(', ')}`
}

function replyAddress(message: Message): string | null {
  const address = message.sender?.address?.trim()
  return address && !/[\r\n<>]/.test(address) ? address : null
}

export function ThreadPage({ readDirectMessage, attachmentPort }: { readDirectMessage?: DirectMessageRead; attachmentPort?: AttachmentReadPort } = {}) {
  const { mailboxId, threadId } = useParams<{ mailboxId: string; threadId: string }>()
  const [searchParams] = useSearchParams()
  if (mailboxId === undefined || threadId === undefined) return null
  const rawMessageId = searchParams.get('message')
  if (rawMessageId !== null && canonicalId(rawMessageId) === null) {
    return <EmptyState title="This message is unavailable" body="The message link is not valid." />
  }
  // AIDEV-NOTE: Resource owner key (D3): reader state, traversal budget and in-flight controller
  // live in a component keyed by mailboxId+threadId, so a changed conversation begins with fresh
  // loading state in its first committed render and unmount cleanup aborts the old traversal at
  // that commit. Clearing state in a passive effect is insufficient: the same actor navigating
  // A->B would see A's subject/messages under B's URL for a frame, and an A completion landing
  // before cleanup could pass isCurrent. The filter is presentational (back link only), so it
  // stays outside the key and must not remount the reader.
  return <ConversationReader key={`${mailboxId}\n${threadId}`} mailboxId={mailboxId} threadId={threadId} {...(readDirectMessage === undefined ? {} : { readDirectMessage })} {...(attachmentPort === undefined ? {} : { attachmentPort })} />
}

function ConversationReader({ mailboxId, threadId, readDirectMessage, attachmentPort }: { mailboxId: string; threadId: string; readDirectMessage?: DirectMessageRead; attachmentPort?: AttachmentReadPort }) {
  const navigate = useNavigate()
  const draftIntent = useDraftIntent()
  const [searchParams] = useSearchParams()
  // Normalized like the inbox: anything but 'unread' is 'all', and 'all' stays out of the URL.
  const filter = searchParams.get('filter') === 'unread' ? 'unread' : 'all'
  const selectedMessageId = searchParams.get('message') === null ? null : canonicalId(searchParams.get('message') ?? '')
  const gateway = useGateway()
  const { scope, context, handleError, state: sessionState } = useSession()
  const mailbox = useMailbox(mailboxId)
  const [state, setState] = useState<ReaderState>({ status: 'loading' })
  const [directState, setDirectState] = useState<DirectState>(null)
  const [directRetry, setDirectRetry] = useState(0)
  // AIDEV-NOTE: One traversal budget for the whole conversation read; continuations share it and
  // a second invalid cursor surfaces manual retry instead of another automatic reset (D4, FE-R10).
  const budgetRef = useRef(newTraversalBudget())
  const abortRef = useRef<AbortController | null>(null)
  const directAbortRef = useRef<AbortController | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const selectedMessageRef = useRef<HTMLLIElement | null>(null)
  const focusedTargetRef = useRef<string | null>(null)
  const replyToMessage = (message: Message) => {
    if (stateRef.current.status !== 'ready' || sessionState.status !== 'ready' || mailbox?.capabilities.compose !== true) return
    const address = replyAddress(message)
    if (address === null) return
    const draftId = newId()
    const subject = stateRef.current.thread.subject_truncated ? '' : (stateRef.current.thread.subject ?? '')
    const replySubject = subject === '' ? '' : /^re:\s*/i.test(subject) ? subject : `Re: ${subject}`
    const content = { subject: Array.from(replySubject).slice(0, 998).join(''), to: [{ display_name: null, address }], body_text: '', reply_to_thread_id: threadId }
    const buffer = edit(newDraftBuffer(draftId, mailboxId, { subject: '', to: [], body_text: '', reply_to_thread_id: threadId }, 0), content)
    // AIDEV-NOTE: Keep recipient and subject out of the URL; the editor restores only after an authorized draft read.
    draftIntent.write(draftIntentKey({ actorId: sessionState.session.actor.id, organizationId: sessionState.session.organization.id, mailboxId, draftId }), { buffer, recipientsText: formatRecipients(content.to) })
    navigate(`/mailboxes/${mailboxId}/drafts/${draftId}?new=1&reply_to=${threadId}`)
  }

  const stateRef = useRef(state)
  stateRef.current = state

  const load = useCallback(
    (cursor: string | undefined, append: boolean) => {
      if (!context) return
      // Thread changes remount this keyed owner, whose unmount cleanup aborts; within one
      // conversation, explicit retry and continuations abort the prior controller here.
      const generation = scope.current()
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const isCurrent = () => scope.isCurrent(generation) && !controller.signal.aborted
      if (!append) budgetRef.current = newTraversalBudget()
      if (append) setState((prev) => (prev.status === 'ready' ? { ...prev, loadingMore: true, pageError: null } : prev))
      else setState({ status: 'loading' })

      void readPage<ThreadDetailPage>({
        read: (requestCursor) =>
          gateway.getThread(
            context,
            threadId,
            mailboxId,
            requestCursor === undefined ? {} : { cursor: requestCursor },
            controller.signal,
          ),
        cursor,
        budget: budgetRef.current,
        isCurrent,
      }).then((outcome) => {
        // Post-await ownership is caller-owned by the readPage contract: a deferred response from a
        // gateway that ignores abort must not apply success or failure to a newer thread (FE-R10).
        if (outcome.kind === 'stale' || !isCurrent()) return
        if (outcome.kind === 'failed') {
          if (handleError(outcome.error, generation)) return
          if (isApiError(outcome.error, 'not_available')) {
            setState({ status: 'unavailable' })
            return
          }
          if (append && !isApiError(outcome.error, 'cursor_invalid')) {
            // A transient continuation failure does not invalidate already authorized plaintext.
            setState((prev) => prev.status === 'ready' ? { ...prev, loadingMore: false, pageError: 'More messages could not be loaded. Check your connection and try again.' } : prev)
            return
          }
          setState({
            status: 'error',
            message: outcome.error instanceof GatewayError ? outcome.error.message : 'The conversation could not be loaded.',
          })
          return
        }
        setState((prev) => {
          // A reset replaces accumulated messages with the fresh first page (FE-R10).
          const existing = append && !outcome.replace && prev.status === 'ready' ? prev.messages : []
          const seen = new Set(existing.map((m) => m.id))
          return {
            status: 'ready',
            thread: outcome.page.thread,
            messages: [...existing, ...outcome.page.messages.filter((m) => !seen.has(m.id))],
            nextCursor: outcome.page.next_cursor,
            loadingMore: false,
            pageError: null,
          }
        })
      })
    },
    [gateway, context, mailboxId, threadId, scope, handleError],
  )

  useEffect(() => {
    load(undefined, false)
    return () => abortRef.current?.abort()
  }, [load])

  // Abort synchronously in the unmounting commit: passive cleanups flush after paint, so a late
  // completion could otherwise pass isCurrent (same generation, not yet aborted) in that window
  // and reach handleError. Abort supplements ownership checks (D3).
  useLayoutEffect(() => () => abortRef.current?.abort(), [])

  const loadedMessages = state.status === 'ready' ? state.messages : null
  const selectedOnPage = selectedMessageId !== null && loadedMessages?.some((message) => canonicalId(message.id) === selectedMessageId) === true
  const directResult = directState?.messageId === selectedMessageId ? directState : null

  // AIDEV-NOTE: Abort direct reads in the unmounting commit before a late 401 can recover a new thread.
  useLayoutEffect(() => () => directAbortRef.current?.abort(), [selectedMessageId, state.status, selectedOnPage, readDirectMessage, context, directRetry])

  useEffect(() => {
    if (selectedMessageId === null || state.status !== 'ready' || selectedOnPage || !readDirectMessage || !context) {
      setDirectState(null)
      return
    }
    const messageId = selectedMessageId
    const generation = scope.current()
    const controller = new AbortController()
    directAbortRef.current?.abort()
    directAbortRef.current = controller
    const isCurrent = () => scope.isCurrent(generation) && !controller.signal.aborted
    setDirectState({ status: 'loading', messageId })
    void readDirectMessage(context, mailboxId, threadId, messageId, controller.signal).then((page) => {
      if (!isCurrent()) return
      // AIDEV-NOTE: A schema-valid response for another owner/resource never becomes selected content.
      if (page.context_id !== context.contextId || page.authorization_version !== context.authorizationVersion ||
          canonicalId(page.mailbox_id) !== canonicalId(mailboxId) || canonicalId(page.thread_id) !== canonicalId(threadId) ||
          canonicalId(page.message.id) !== messageId) {
        setDirectState({ status: 'unavailable', messageId })
        return
      }
      setDirectState({ status: 'ready', messageId, message: page.message })
    }).catch((error: unknown) => {
      if (!isCurrent() || handleError(error, generation)) return
      setDirectState({ status: isApiError(error, 'not_available') ? 'unavailable' : 'error', messageId })
    })
    return () => {
      controller.abort()
      if (directAbortRef.current === controller) directAbortRef.current = null
    }
  }, [selectedMessageId, state.status, selectedOnPage, readDirectMessage, context, mailboxId, threadId, scope, handleError, directRetry])

  const selectedMessagePresent = selectedOnPage || directResult?.status === 'ready'
  // A selected URL must never fall back to another sender while its own message is unresolved.
  // Without a selection, use the latest loaded message with a usable sender.
  const replyMessage = state.status !== 'ready' ? null : selectedMessageId !== null
    ? state.messages.find((message) => canonicalId(message.id) === selectedMessageId) ??
      (directResult?.status === 'ready' ? directResult.message : null)
    : [...state.messages].reverse().find((message) => replyAddress(message) !== null) ?? null

  // AIDEV-NOTE: Page loadingMore changes reader state; focus moves only when a new target first appears.
  useEffect(() => {
    if (state.status !== 'ready' || (selectedMessageId !== null && !selectedMessagePresent)) {
      focusedTargetRef.current = null
      return
    }
    const target = selectedMessageId ?? 'heading'
    if (focusedTargetRef.current === target) return
    if (selectedMessageId === null) headingRef.current?.focus()
    else selectedMessageRef.current?.focus()
    focusedTargetRef.current = target
  }, [state.status, selectedMessageId, selectedMessagePresent])

  // The back link restores the inbox exactly as it was filtered when the user left it (FE-R11).
  const backTo = `/mailboxes/${mailboxId}${filter === 'unread' ? '?filter=unread' : ''}`
  const canCompose = mailbox?.capabilities.compose === true
  const attachmentsFor = (message: Message) =>
    message.attachment_count > 0 && (
      attachmentPort ? (
        <MessageAttachments key={`${message.id}\n${context?.contextId}\n${context?.authorizationVersion}`} mailboxId={mailboxId} threadId={threadId} messageId={message.id} count={message.attachment_count} port={attachmentPort} />
      ) : (
        <Badge tone="neutral">{message.attachment_count} attachment{message.attachment_count === 1 ? '' : 's'} (viewing not yet available)</Badge>
      )
    )

  return (
    <article aria-label="Conversation" className="flex min-h-0 flex-1 flex-col">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800">
        {/* Thread toolbar (INBOX-SPEC thread view): back, unavailable actions, the real read toggle. */}
        <div className="flex h-12 items-center gap-1 border-b border-zinc-200 px-2 dark:border-zinc-700">
          <Link to={backTo} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-zinc-700 hover:bg-zinc-800/5 dark:text-zinc-300 dark:hover:bg-white/10">
            <ArrowLeftIcon className="size-5" /> Back to conversations
          </Link>
          <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />
          <IconButton label="Archive (not available yet)" disabled><ArchiveBoxIcon className="size-5" /></IconButton>
          <IconButton label="Report spam (not available yet)" disabled><ExclamationTriangleIcon className="size-5" /></IconButton>
          <IconButton label="Delete (not available yet)" disabled><TrashIcon className="size-5" /></IconButton>
          <IconButton label="Snooze (not available yet)" disabled><ClockIcon className="size-5" /></IconButton>
          <div className="flex-1" />
          <IconButton label="More (not available yet)" disabled><EllipsisVerticalIcon className="size-5" /></IconButton>
        </div>

        {state.status === 'loading' && <div role="status" aria-label="Loading conversation" className="p-6"><Skeleton rows={4} /></div>}
        {state.status === 'unavailable' && (
          <EmptyState icon={<EnvelopeIcon className="size-5" />} title="This conversation is unavailable" body="It may not exist or you may not currently have access to it." className="m-6" />
        )}
        {state.status === 'error' && (
          <div role="alert" className="p-3">
            <Callout variant="danger" heading="The conversation could not be loaded" actions={<Button variant="primary" onClick={() => load(undefined, false)}>Try again</Button>}>
              {state.message}
            </Callout>
          </div>
        )}
        {state.status === 'ready' && (
          <>
            <header className="px-6 pb-4 pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 ref={headingRef} tabIndex={-1} className="min-w-0 text-xl font-medium text-zinc-800 dark:text-white">
                  {state.thread.subject ?? '(no subject)'}
                </h1>
                {state.thread.subject_truncated && <Badge tone="warn" size="sm">Subject shortened</Badge>}
                {state.thread.unread && <Badge tone="accent" size="sm">Unread</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-xs text-zinc-500">
                  {state.thread.message_count} message{state.thread.message_count === 1 ? '' : 's'} in this conversation
                </p>
                <ReadStateControl
                  threadId={threadId}
                  mailboxId={mailboxId}
                  unread={state.thread.unread}
                  onConfirmed={(read) => setState((prev) => (prev.status === 'ready' ? { ...prev, thread: { ...prev.thread, unread: !read } } : prev))}
                />
              </div>
            </header>
            {selectedMessageId !== null && !selectedMessagePresent && (
              <div className="px-6 pb-4">
                {readDirectMessage ? (
                  directResult?.status === 'error' ? (
                    <div role="alert"><Callout variant="danger" actions={<Button size="sm" onClick={() => setDirectRetry((count) => count + 1)}>Retry message</Button>}>The message could not be loaded.</Callout></div>
                  ) : (
                    <p role="status"><Callout variant="neutral">{directResult?.status === 'unavailable' ? 'This message is unavailable in this conversation.' : 'Loading selected message…'}</Callout></p>
                  )
                ) : (
                  <p role="status"><Callout variant="neutral">{state.nextCursor === null ? 'This message is unavailable in this conversation.' : 'This message is on a later page. Show more messages to find it.'}</Callout></p>
                )}
              </div>
            )}
            {canCompose && (replyMessage === null || replyAddress(replyMessage) === null) && (
              <p className="px-6 pb-4 text-xs text-zinc-500">
                {selectedMessageId === null ? 'A message with a sender is needed to reply.' : 'This selected message cannot be replied to yet.'}
              </p>
            )}
            {/* An empty page with a continuation cursor is not a terminal empty conversation (D4). */}
            {state.messages.length === 0 && state.nextCursor === null && (
              <EmptyState icon={<EnvelopeIcon className="size-5" />} title="No messages" body="This conversation exists but has no readable messages yet." className="mx-6 mb-6" />
            )}
            {state.messages.length === 0 && state.nextCursor !== null && (
              <EmptyState icon={<EnvelopeIcon className="size-5" />} title="Nothing on this page" body="This page of the conversation was empty, but more messages may be available below." className="mx-6 mb-6" />
            )}
            {!selectedOnPage && directResult?.status === 'ready' && (
              <ol className="border-t border-zinc-200 dark:border-zinc-700">
                <li ref={selectedMessageRef} tabIndex={-1} aria-label="Selected message" className="border-s-2 border-s-gold-500 bg-gold-50/40 px-6 py-5 dark:bg-gold-400/5">
                  <MessageHeader message={directResult.message} />
                  <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-zinc-700 dark:text-zinc-300">{directResult.message.body_text}</pre>
                  <footer className="mt-3 flex flex-wrap items-center gap-2">
                    {canCompose && replyAddress(directResult.message) !== null && (
                      <Button size="sm" icon={<ArrowUturnLeftIcon className="size-4" />} onClick={() => replyToMessage(directResult.message)}>Reply to this sender as draft</Button>
                    )}
                    {directResult.message.body_truncated && <Badge tone="warn">Message shortened by the server</Badge>}
                    {attachmentsFor(directResult.message)}
                  </footer>
                </li>
              </ol>
            )}
            <ol className="divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
              {state.messages.map((message) => {
                const isSelected = canonicalId(message.id) === selectedMessageId
                return (
                  <li key={message.id} ref={isSelected ? selectedMessageRef : undefined} tabIndex={isSelected ? -1 : undefined} aria-label={isSelected ? 'Selected message' : undefined} className={cx('px-6 py-5', isSelected && 'border-s-2 border-s-gold-500 bg-gold-50/40 dark:bg-gold-400/5')}>
                    <MessageHeader message={message} />
                    {/* Escaped plaintext only: React text rendering in a wrapping <pre>; nothing is parsed. */}
                    <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-zinc-700 dark:text-zinc-300">{message.body_text}</pre>
                    {/* flex-wrap: both badges together overflow a 390px viewport otherwise (r10 visual QA). */}
                    <footer className="mt-3 flex flex-wrap items-center gap-2">
                      <Link to={`?${filter === 'unread' ? 'filter=unread&' : ''}message=${encodeURIComponent(message.id)}`} aria-current={isSelected ? 'location' : undefined} className="rounded-md text-sm font-medium text-(--color-accent-content) underline-offset-4 hover:underline">Open this message</Link>
                      {canCompose && replyAddress(message) !== null && (
                        <Button size="sm" icon={<ArrowUturnLeftIcon className="size-4" />} onClick={() => replyToMessage(message)}>Reply to this sender as draft</Button>
                      )}
                      {message.body_truncated && <Badge tone="warn">Message shortened by the server</Badge>}
                      {attachmentsFor(message)}
                    </footer>
                  </li>
                )
              })}
            </ol>
            {state.nextCursor !== null && (
              <div className="flex justify-center border-t border-zinc-200 p-3 dark:border-zinc-700">
                <div className="flex flex-col items-center gap-2">
                  {state.pageError !== null && <p role="alert" className="text-sm text-red-500">{state.pageError}</p>}
                  <Button size="sm" disabled={state.loadingMore} onClick={() => load(state.nextCursor ?? undefined, true)}>
                    {state.loadingMore ? 'Loading…' : state.pageError !== null ? 'Retry more messages' : 'Show more messages'}
                  </Button>
                </div>
              </div>
            )}
            {/* Reply bar (INBOX-SPEC): only "Reply as draft" is backed by the draft API. */}
            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
              {canCompose && (
                <Button icon={<ArrowUturnLeftIcon className="size-4" />} disabled={replyMessage === null || replyAddress(replyMessage) === null || sessionState.status !== 'ready'}
                  onClick={() => { if (replyMessage !== null) replyToMessage(replyMessage) }}>
                  Reply as draft
                </Button>
              )}
              <Button icon={<ArrowUturnLeftIcon className="size-4" />} disabled title="Not available yet">Reply all</Button>
              <Button icon={<ArrowUturnRightIcon className="size-4" />} disabled title="Not available yet">Forward</Button>
              <span className="text-xs text-zinc-400">Reply all and Forward are not available yet.</span>
            </div>
          </>
        )}
      </div>
      {state.status === 'ready' && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <AssignmentPanel threadId={threadId} mailboxId={mailboxId} />
          <NotesPanel threadId={threadId} mailboxId={mailboxId} />
        </div>
      )}
    </article>
  )
}

/** Gmail message header in the Flux skin: 40px round avatar, bold name, grey address, time on the end side. */
function MessageHeader({ message }: { message: Message }) {
  const name = message.sender?.display_name ?? message.sender?.address ?? 'Unknown sender'
  return (
    <header className="flex items-start gap-3">
      <Avatar name={name} size={10} shape="circle" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zinc-800 dark:text-white">{name}</p>
        <p className="truncate text-xs text-zinc-500">
          {message.sender?.display_name && message.sender.address ? `${message.sender.address} · ` : ''}
          {sameAddressLine(message)}
        </p>
      </div>
      <time dateTime={message.sent_at ?? undefined} className="shrink-0 text-xs tabular-nums text-zinc-500">
        {message.sent_at === null ? 'No date recorded' : formatDateTime(message.sent_at)}
      </time>
    </header>
  )
}
