// Paginated plaintext conversation reader. Escaped-text-in-<pre> presentation follows the audited
// first-party live reader; no HTML, Markdown, autolinks, remote images or attachment fetching.
// A read never marks mail read (GET-only contract).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { Message, ThreadDetailPage } from '@/data/contract'
import { GatewayError, isApiError } from '@/data/errors'
import { useGateway, useSession } from '@/app/session'
import { formatDateTime } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { EmptyState, Skeleton } from '@/ui/Async'
import { BackIcon } from '@/ui/icons'

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
  const gateway = useGateway()
  const { scope, context, handleError } = useSession()
  const [state, setState] = useState<ReaderState>({ status: 'loading' })
  const abortRef = useRef<AbortController | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)

  const load = useCallback(
    (cursor: string | undefined, append: boolean) => {
      if (!context || mailboxId === undefined || threadId === undefined) return
      const generation = scope.current()
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      if (append) setState((prev) => (prev.status === 'ready' ? { ...prev, loadingMore: true } : prev))
      else setState({ status: 'loading' })

      const run = async (requestCursor: string | undefined, cursorResetUsed: boolean): Promise<void> => {
        try {
          const page = await gateway.getThread(
            context,
            threadId,
            mailboxId,
            requestCursor === undefined ? {} : { cursor: requestCursor },
            controller.signal,
          )
          if (!scope.isCurrent(generation) || controller.signal.aborted) return
          setState((prev) => {
            const existing = append && prev.status === 'ready' ? prev.messages : []
            const seen = new Set(existing.map((m) => m.id))
            return {
              status: 'ready',
              thread: page.thread,
              messages: [...existing, ...page.messages.filter((m) => !seen.has(m.id))],
              nextCursor: page.next_cursor,
              loadingMore: false,
            }
          })
        } catch (error) {
          if (controller.signal.aborted || handleError(error, generation)) return
          if (isApiError(error, 'cursor_invalid') && requestCursor !== undefined && !cursorResetUsed) {
            await run(undefined, true)
            return
          }
          if (isApiError(error, 'not_available')) {
            setState({ status: 'unavailable' })
            return
          }
          setState({ status: 'error', message: error instanceof GatewayError ? error.message : 'The conversation could not be loaded.' })
        }
      }
      void run(cursor, false)
    },
    [gateway, context, mailboxId, threadId, scope, handleError],
  )

  useEffect(() => {
    load(undefined, false)
    return () => abortRef.current?.abort()
  }, [load])

  // Move focus to the conversation heading once loaded so keyboard reading starts at the content.
  useEffect(() => {
    if (state.status === 'ready') headingRef.current?.focus()
  }, [state.status])

  if (mailboxId === undefined || threadId === undefined) return null
  return (
    <article aria-label="Conversation" className="mx-auto max-w-3xl p-3">
      <div className="mb-2 flex items-center gap-2">
        <Link to={`/mailboxes/${mailboxId}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] text-fg hover:bg-surface-2">
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
          <p className="mb-3 text-[12px] text-muted">
            {state.thread.message_count} message{state.thread.message_count === 1 ? '' : 's'} in this conversation
          </p>
          {state.messages.length === 0 && <EmptyState title="No messages" body="This conversation exists but has no readable messages yet." />}
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
                <footer className="mt-2 flex gap-2">
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
        </>
      )}
    </article>
  )
}
