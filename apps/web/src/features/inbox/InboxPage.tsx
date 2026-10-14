// Thread summary list for the selected mailbox with the all/unread URL filter.
// URL mailbox selection and paged summary/detail separation adapted from first-party Ledger
// frontend 4322cfbb, src/features/live/LiveInboxPage.tsx (blob 54b1284b…); old Gmail/history
// wiring, permission assumptions and account cache keys are replaced by the FE-01 contract.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import type { ThreadPage, ThreadSummary } from '@/data/contract'
import { GatewayError, isApiError } from '@/data/errors'
import { useGateway, useSession } from '@/app/session'
import { useMailbox } from '@/app/mailboxes'
import { newTraversalBudget, readPage } from '@/lib/readPage'
import { cx, formatWhen } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { EmptyState, Skeleton } from '@/ui/Async'

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; items: ThreadSummary[]; nextCursor: string | null; loadingMore: boolean; pageError: string | null }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }

export function InboxPage() {
  const { mailboxId } = useParams<{ mailboxId: string }>()
  const [searchParams] = useSearchParams()
  const rawFilter = searchParams.get('filter')
  const filter = rawFilter === 'unread' ? 'unread' : 'all'
  if (mailboxId === undefined) return null
  // AIDEV-NOTE: Resource owner key (D3): list state, traversal budget and in-flight controller live
  // in a component keyed by mailbox+filter, so a changed resource begins with fresh loading state
  // in its first committed render and unmount cleanup aborts the old traversal at that commit.
  // Clearing state in a passive effect is insufficient: it would show the old rows under the new
  // URL for a frame and let an old completion landing before cleanup pass isCurrent.
  return <MailboxThreadList key={`${mailboxId}\n${filter}`} mailboxId={mailboxId} filter={filter} />
}

function MailboxThreadList({ mailboxId, filter }: { mailboxId: string; filter: 'all' | 'unread' }) {
  const gateway = useGateway()
  const mailbox = useMailbox(mailboxId)
  const { scope, context, handleError } = useSession()
  const [state, setState] = useState<ListState>({ status: 'loading' })
  // AIDEV-NOTE: One traversal budget shared by the initial load and every continuation; only a
  // fresh traversal (initial load, mailbox/filter change, explicit retry) renews it (D4, FE-R08).
  const budgetRef = useRef(newTraversalBudget())
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLOListElement | null>(null)

  const load = useCallback(
    (cursor: string | undefined, append: boolean) => {
      if (!context) return
      // Mailbox/filter changes remount this keyed owner, whose unmount cleanup aborts; within one
      // resource, explicit retry and continuations abort the prior controller here. The captured
      // generation plus the controller reject late responses that ignore abort.
      const generation = scope.current()
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const isCurrent = () => scope.isCurrent(generation) && !controller.signal.aborted
      if (!append) budgetRef.current = newTraversalBudget()
      if (append) setState((prev) => (prev.status === 'ready' ? { ...prev, loadingMore: true, pageError: null } : prev))
      else setState({ status: 'loading' })

      void readPage<ThreadPage>({
        read: (requestCursor) =>
          gateway.listThreads(
            context,
            mailboxId,
            requestCursor === undefined ? { filter } : { filter, cursor: requestCursor },
            controller.signal,
          ),
        cursor,
        budget: budgetRef.current,
        isCurrent,
      }).then((outcome) => {
        // Post-await ownership is caller-owned by the readPage contract: a deferred response from a
        // gateway that ignores abort must not apply success or failure to a newer mailbox/filter.
        if (outcome.kind === 'stale' || !isCurrent()) return
        if (outcome.kind === 'failed') {
          if (handleError(outcome.error, generation)) return
          if (isApiError(outcome.error, 'not_available')) {
            setState({ status: 'unavailable' })
            return
          }
          if (append && !isApiError(outcome.error, 'cursor_invalid')) {
            setState((prev) => prev.status === 'ready' ? { ...prev, loadingMore: false, pageError: 'More conversations could not be loaded. Check your connection and try again.' } : prev)
            return
          }
          setState({
            status: 'error',
            message: outcome.error instanceof GatewayError ? outcome.error.message : 'Conversations could not be loaded.',
          })
          return
        }
        setState((prev) => {
          // A reset replaces accumulated rows with the fresh first page (FE-R08); otherwise an
          // append merges. Concurrent updates may reorder summaries; deduplicate by thread id.
          const existing = append && !outcome.replace && prev.status === 'ready' ? prev.items : []
          const seen = new Set(existing.map((t) => t.id))
          const merged = [...existing, ...outcome.page.items.filter((t) => !seen.has(t.id))]
          return { status: 'ready', items: merged, nextCursor: outcome.page.next_cursor, loadingMore: false, pageError: null }
        })
      })
    },
    [gateway, context, mailboxId, filter, scope, handleError],
  )

  useEffect(() => {
    load(undefined, false)
    return () => abortRef.current?.abort()
  }, [load])

  // Abort synchronously in the unmounting commit: passive cleanups flush after paint, so a late
  // completion could otherwise pass isCurrent (same generation, not yet aborted) in that window
  // and reach handleError. Abort supplements ownership checks (D3).
  useLayoutEffect(() => () => abortRef.current?.abort(), [])

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

  // The active filter travels into the reader so its back link can restore this view (FE-R11).
  const filterSuffix = filter === 'unread' ? '?filter=unread' : ''
  return (
    <section aria-label="Conversations" className="mx-auto max-w-3xl p-3">
      <div className="mb-2 flex items-center gap-2 px-1">
        <h1 className="text-sm font-semibold">Conversations</h1>
        {/* AIDEV-NOTE: An unknown mailbox capability is never treated as compose authority. */}
        {state.status === 'ready' && mailbox?.capabilities.compose === true && (
          <Link to={`/mailboxes/${mailboxId}/drafts`} className="rounded-lg px-2.5 py-1 text-[13px] font-semibold text-accent-text hover:bg-accent-soft">Compose draft</Link>
        )}
        {/* AIDEV-NOTE: A denied mailbox has no usable filter destinations; retain its unavailable explanation. */}
        {state.status !== 'unavailable' && <nav aria-label="Filter" className="ml-auto flex gap-1">
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
        </nav>}
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
      {state.status === 'ready' && (
        <>
          {/* An empty page with a continuation cursor is not a terminal empty mailbox (FE-R09). */}
          {state.items.length === 0 && state.nextCursor === null && (
            <EmptyState title={filter === 'unread' ? 'No unread conversations' : 'No conversations'} body="This mailbox has nothing to show for the current filter." />
          )}
          {state.items.length === 0 && state.nextCursor !== null && (
            <EmptyState title="Nothing on this page" body="This page of results was empty, but more conversations may be available below." />
          )}
          {state.items.length > 0 && (
            <ol ref={listRef} onKeyDown={onListKeyDown} className="divide-y divide-line rounded-lg border border-line bg-surface">
              {state.items.map((thread) => (
                <li key={thread.id}>
                  <Link
                    data-thread
                    to={`/mailboxes/${mailboxId}/threads/${thread.id}${filterSuffix}`}
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
          )}
          {/* Continuation depends on next_cursor, never on the row count (D4, FE-R09). */}
          {state.nextCursor !== null && (
            <div className="mt-2 flex justify-center">
              <div className="flex flex-col items-center gap-2">
                {state.pageError !== null && <p role="alert" className="text-[13px] text-danger">{state.pageError}</p>}
                <Button size="sm" disabled={state.loadingMore} onClick={() => load(state.nextCursor ?? undefined, true)}>
                  {state.loadingMore ? 'Loading…' : state.pageError !== null ? 'Retry more conversations' : 'Show more conversations'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
