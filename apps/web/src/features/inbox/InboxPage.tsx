// Thread summary list for the selected mailbox with the all/unread URL filter.
// URL mailbox selection and paged summary/detail separation adapted from first-party Ledger
// frontend 4322cfbb, src/features/live/LiveInboxPage.tsx (blob 54b1284b…); old Gmail/history
// wiring, permission assumptions and account cache keys are replaced by the FE-01 contract.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import type { ThreadSummary } from '@/data/contract'
import { GatewayError, isApiError } from '@/data/errors'
import { useGateway, useSession } from '@/app/session'
import { cx, formatWhen } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { EmptyState, Skeleton } from '@/ui/Async'

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; items: ThreadSummary[]; nextCursor: string | null; loadingMore: boolean }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }

export function InboxPage() {
  const { mailboxId } = useParams<{ mailboxId: string }>()
  const [searchParams] = useSearchParams()
  const rawFilter = searchParams.get('filter')
  const filter = rawFilter === 'unread' ? 'unread' : 'all'
  const gateway = useGateway()
  const { scope, context, handleError } = useSession()
  const [state, setState] = useState<ListState>({ status: 'loading' })
  // AIDEV-NOTE: One cursor reset per load sequence (R4); repeated cursor_invalid needs explicit retry.
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLOListElement | null>(null)

  const load = useCallback(
    (cursor: string | undefined, append: boolean) => {
      if (!context || mailboxId === undefined) return
      // Mailbox/filter changes re-run the effect below, abort this controller and bump nothing
      // globally: the captured generation plus the aborted controller reject late responses.
      const generation = scope.current()
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      if (append) setState((prev) => (prev.status === 'ready' ? { ...prev, loadingMore: true } : prev))
      else setState({ status: 'loading' })

      const run = async (requestCursor: string | undefined, cursorResetUsed: boolean): Promise<void> => {
        try {
          const page = await gateway.listThreads(
            context,
            mailboxId,
            requestCursor === undefined ? { filter } : { filter, cursor: requestCursor },
            controller.signal,
          )
          if (!scope.isCurrent(generation) || controller.signal.aborted) return
          setState((prev) => {
            const existing = append && prev.status === 'ready' ? prev.items : []
            // Concurrent updates may reorder summaries; deduplicate by thread id.
            const seen = new Set(existing.map((t) => t.id))
            const merged = [...existing, ...page.items.filter((t) => !seen.has(t.id))]
            return { status: 'ready', items: merged, nextCursor: page.next_cursor, loadingMore: false }
          })
        } catch (error) {
          if (controller.signal.aborted || handleError(error, generation)) return
          if (isApiError(error, 'cursor_invalid') && requestCursor !== undefined && !cursorResetUsed) {
            await run(undefined, true) // reset to first page once, retaining the URL filter
            return
          }
          if (isApiError(error, 'not_available')) {
            setState({ status: 'unavailable' })
            return
          }
          setState({ status: 'error', message: error instanceof GatewayError ? error.message : 'Conversations could not be loaded.' })
        }
      }
      void run(cursor, false)
    },
    [gateway, context, mailboxId, filter, scope, handleError],
  )

  useEffect(() => {
    load(undefined, false)
    return () => abortRef.current?.abort()
  }, [load])

  // Roving focus with arrow keys over the conversation links.
  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const links = listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-thread]')
    if (!links || links.length === 0) return
    const current = Array.from(links).indexOf(document.activeElement as HTMLAnchorElement)
    const next = event.key === 'ArrowDown' ? Math.min(current + 1, links.length - 1) : Math.max(current - 1, 0)
    links[next]?.focus()
    event.preventDefault()
  }

  if (mailboxId === undefined) return null
  return (
    <section aria-label="Conversations" className="mx-auto max-w-3xl p-3">
      <div className="mb-2 flex items-center gap-2 px-1">
        <h1 className="text-sm font-semibold">Conversations</h1>
        <nav aria-label="Filter" className="ml-auto flex gap-1">
          {(['all', 'unread'] as const).map((value) => (
            <Link
              key={value}
              to={value === 'all' ? `/mailboxes/${mailboxId}` : `/mailboxes/${mailboxId}?filter=unread`}
              aria-current={filter === value ? 'page' : undefined}
              className={cx('rounded-lg px-2.5 py-1 text-[13px]', filter === value ? 'bg-accent-soft font-semibold text-accent-text' : 'text-fg hover:bg-surface-2')}
            >
              {value === 'all' ? 'All' : 'Unread'}
            </Link>
          ))}
        </nav>
      </div>
      {state.status === 'loading' && <div role="status" aria-label="Loading conversations"><Skeleton rows={6} /></div>}
      {state.status === 'unavailable' && (
        <EmptyState title="This mailbox is unavailable" body="It may not exist or you may not currently have access to it." />
      )}
      {state.status === 'error' && (
        <div role="alert">
          <EmptyState title="Conversations could not be loaded" body={state.message} action={<Button variant="primary" onClick={() => load(undefined, false)}>Try again</Button>} />
        </div>
      )}
      {state.status === 'ready' && state.items.length === 0 && (
        <EmptyState title={filter === 'unread' ? 'No unread conversations' : 'No conversations'} body="This mailbox has nothing to show for the current filter." />
      )}
      {state.status === 'ready' && state.items.length > 0 && (
        <>
          <ol ref={listRef} onKeyDown={onListKeyDown} className="divide-y divide-line rounded-lg border border-line bg-surface">
            {state.items.map((thread) => (
              <li key={thread.id}>
                <Link
                  data-thread
                  to={`/mailboxes/${mailboxId}/threads/${thread.id}`}
                  className="row flex items-baseline gap-3 px-3 hover:bg-surface-2"
                >
                  <span className={cx('min-w-0 flex-1 truncate text-sm', thread.unread && 'font-semibold')}>
                    {thread.sender?.display_name ?? thread.sender?.address ?? 'Unknown sender'}
                    <span className="text-muted"> — </span>
                    {thread.subject ?? '(no subject)'}
                    {thread.subject_truncated && <span title="Subject shortened">…</span>}
                  </span>
                  <span className="hidden max-w-[18rem] truncate text-[13px] text-muted sm:inline">{thread.preview_text}</span>
                  {thread.unread && <Badge tone="accent">Unread</Badge>}
                  <span className="shrink-0 text-[12px] tabular-nums text-muted">
                    {thread.last_message_at === null ? 'No date' : formatWhen(thread.last_message_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          {state.nextCursor !== null && (
            <div className="mt-2 flex justify-center">
              <Button size="sm" disabled={state.loadingMore} onClick={() => load(state.nextCursor ?? undefined, true)}>
                {state.loadingMore ? 'Loading…' : 'Show more conversations'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
