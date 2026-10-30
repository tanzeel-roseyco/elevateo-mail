// Paginated plaintext conversation reader. Escaped-text-in-<pre> presentation follows the audited
// first-party live reader; no HTML, Markdown, autolinks, remote images or attachment fetching.
// A read never marks mail read (GET-only contract); BE-02 D adds the explicit read-state control,
// the assignment panel and immutable notes below the messages, and a reply-as-draft entry (C).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import type { Message, ThreadDetailPage } from '@/data/contract'
import { GatewayError, isApiError } from '@/data/errors'
import { useMailbox } from '@/app/mailboxes'
import { useGateway, useSession } from '@/app/session'
import { newId } from '@/lib/ids'
import { newTraversalBudget, readPage } from '@/lib/readPage'
import { formatDateTime } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { EmptyState, Skeleton } from '@/ui/Async'
import { BackIcon } from '@/ui/icons'
import { AssignmentPanel } from './AssignmentPanel'
import { NotesPanel } from './NotesPanel'
import { ReadStateControl } from './ReadStateControl'

type ReaderState =
  | { status: 'loading' }
  | { status: 'ready'; thread: ThreadDetailPage['thread']; messages: Message[]; nextCursor: string | null; loadingMore: boolean }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }

function sameAddressLine(message: Message): string {
  if (message.to.length === 0) return 'No recipients recorded'
  return `To: ${message.to.map((a) => a.display_name ?? a.address ?? 'Unknown recipient').join(', ')}`
}

export function ThreadPage() {
  const { mailboxId, threadId } = useParams<{ mailboxId: string; threadId: string }>()
  if (mailboxId === undefined || threadId === undefined) return null
  // AIDEV-NOTE: Resource owner key (D3): reader state, traversal budget and in-flight controller
  // live in a component keyed by mailboxId+threadId, so a changed conversation begins with fresh
  // loading state in its first committed render and unmount cleanup aborts the old traversal at
  // that commit. Clearing state in a passive effect is insufficient: the same actor navigating
  // A->B would see A's subject/messages under B's URL for a frame, and an A completion landing
  // before cleanup could pass isCurrent. The filter is presentational (back link only), so it
  // stays outside the key and must not remount the reader.
  return <ConversationReader key={`${mailboxId}\n${threadId}`} mailboxId={mailboxId} threadId={threadId} />
}

function ConversationReader({ mailboxId, threadId }: { mailboxId: string; threadId: string }) {
  const [searchParams] = useSearchParams()
  // Normalized like the inbox: anything but 'unread' is 'all', and 'all' stays out of the URL.
  const filter = searchParams.get('filter') === 'unread' ? 'unread' : 'all'
  const gateway = useGateway()
  const { scope, context, handleError } = useSession()
  const mailbox = useMailbox(mailboxId)
  const [state, setState] = useState<ReaderState>({ status: 'loading' })
  // AIDEV-NOTE: One traversal budget for the whole conversation read; continuations share it and
  // a second invalid cursor surfaces manual retry instead of another automatic reset (D4, FE-R10).
  const budgetRef = useRef(newTraversalBudget())
  const abortRef = useRef<AbortController | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  // One reply-draft id per opened conversation: the link is stable across renders, and nothing
  // exists on the server until the editor's first explicit save (BE-02 C).
  const replyDraftIdRef = useRef(newId())

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
      if (append) setState((prev) => (prev.status === 'ready' ? { ...prev, loadingMore: true } : prev))
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

  // Move focus to the conversation heading once loaded so keyboard reading starts at the content.
  useEffect(() => {
    if (state.status === 'ready') headingRef.current?.focus()
  }, [state.status])

  // The back link restores the inbox exactly as it was filtered when the user left it (FE-R11).
  const backTo = `/mailboxes/${mailboxId}${filter === 'unread' ? '?filter=unread' : ''}`
  return (
    <article aria-label="Conversation" className="mx-auto max-w-3xl p-3">
      <div className="mb-2 flex items-center gap-2">
        <Link to={backTo} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] text-fg hover:bg-surface-2">
          <BackIcon className="size-4" /> Back to conversations
        </Link>
      </div>
      {state.status === 'loading' && <div role="status" aria-label="Loading conversation"><Skeleton rows={4} /></div>}
      {state.status === 'unavailable' && (
        <EmptyState title="This conversation is unavailable" body="It may not exist or you may not currently have access to it." />
      )}
      {state.status === 'error' && (
        <div role="alert">
          <EmptyState title="The conversation could not be loaded" body={state.message} action={<Button variant="primary" onClick={() => load(undefined, false)}>Try again</Button>} />
        </div>
      )}
      {state.status === 'ready' && (
        <>
          <h1 ref={headingRef} tabIndex={-1} className="mb-1 text-base font-semibold">
            {state.thread.subject ?? '(no subject)'}
            {state.thread.subject_truncated && <Badge tone="warn" className="ml-2">Subject shortened</Badge>}
          </h1>
          <p className="mb-2 text-[12px] text-muted">
            {state.thread.message_count} message{state.thread.message_count === 1 ? '' : 's'} in this conversation
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ReadStateControl
              threadId={threadId}
              mailboxId={mailboxId}
              unread={state.thread.unread}
              onConfirmed={(read) => setState((prev) => (prev.status === 'ready' ? { ...prev, thread: { ...prev.thread, unread: !read } } : prev))}
            />
            {state.thread.unread && <Badge tone="accent">Unread</Badge>}
            {(mailbox === undefined || mailbox.capabilities.compose) && (
              <Link
                to={`/mailboxes/${mailboxId}/drafts/${replyDraftIdRef.current}?new=1&reply_to=${threadId}`}
                className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-2.5 text-[13px] font-medium hover:bg-surface-2"
              >
                Reply as draft
              </Link>
            )}
          </div>
          {/* An empty page with a continuation cursor is not a terminal empty conversation (D4). */}
          {state.messages.length === 0 && state.nextCursor === null && (
            <EmptyState title="No messages" body="This conversation exists but has no readable messages yet." />
          )}
          {state.messages.length === 0 && state.nextCursor !== null && (
            <EmptyState title="Nothing on this page" body="This page of the conversation was empty, but more messages may be available below." />
          )}
          <ol className="flex flex-col gap-3">
            {state.messages.map((message) => (
              <li key={message.id} className="rounded-lg border border-line bg-surface p-3">
                <header className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold">
                    {message.sender?.display_name ?? message.sender?.address ?? 'Unknown sender'}
                  </span>
                  <span className="text-[12px] text-muted">{sameAddressLine(message)}</span>
                  <span className="ml-auto text-[12px] tabular-nums text-muted">
                    {message.sent_at === null ? 'No date recorded' : formatDateTime(message.sent_at)}
                  </span>
                </header>
                {/* Escaped plaintext only: React text rendering in a wrapping <pre>; nothing is parsed. */}
                <pre className="whitespace-pre-wrap break-words font-sans text-sm">{message.body_text}</pre>
                {/* flex-wrap: both badges together overflow a 390px viewport otherwise (r10 visual QA). */}
                <footer className="mt-2 flex flex-wrap gap-2">
                  {message.body_truncated && <Badge tone="warn">Message shortened by the server</Badge>}
                  {message.attachment_count > 0 && (
                    <Badge tone="neutral">
                      {message.attachment_count} attachment{message.attachment_count === 1 ? '' : 's'} (viewing not yet available)
                    </Badge>
                  )}
                </footer>
              </li>
            ))}
          </ol>
          {state.nextCursor !== null && (
            <div className="mt-3 flex justify-center">
              <Button size="sm" disabled={state.loadingMore} onClick={() => load(state.nextCursor ?? undefined, true)}>
                {state.loadingMore ? 'Loading…' : 'Show more messages'}
              </Button>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-3">
            <AssignmentPanel threadId={threadId} mailboxId={mailboxId} />
            <NotesPanel threadId={threadId} mailboxId={mailboxId} />
          </div>
        </>
      )}
    </article>
  )
}
