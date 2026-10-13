// Scoped literal search (BE-02 D §9). The query and optional mailbox live in the URL; results are
// unchanged ThreadSummary rows (one per thread, canonical preview, no highlights) that link into
// the reader. Metacharacters are literal on the server; the client only enforces the 1..256
// code-point, non-whitespace rule before asking.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { describeFailure, type CollaborationFailure } from '@/app/collaborationFailure'
import { useMailboxes } from '@/app/mailboxes'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useGateway } from '@/app/session'
import { SearchQuerySchema, type SearchPage as SearchPageResult, type ThreadSummary } from '@/data/contract'
import { isApiError } from '@/data/errors'
import { cx, formatWhen } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { EmptyState, Skeleton } from '@/ui/Async'

type ResultState =
  | { status: 'idle' }
  | { status: 'invalid'; message: string }
  | { status: 'loading' }
  | { status: 'ready'; items: ThreadSummary[]; nextCursor: string | null; loadingMore: boolean; mailboxId: string | null }
  | { status: 'unavailable' }
  | { status: 'error'; failure: CollaborationFailure }

export function SearchPage() {
  const [searchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const mailboxId = searchParams.get('mailbox') ?? ''
  // Resource owner key (D3): a new query starts with fresh result state and aborts the old one.
  return <SearchResults key={`${q}\n${mailboxId}`} q={q} mailboxId={mailboxId === '' ? undefined : mailboxId} />
}

function SearchResults({ q, mailboxId }: { q: string; mailboxId: string | undefined }) {
  const gateway = useGateway()
  const mailboxes = useMailboxes()
  const { request } = useProtectedRequest()
  const [state, setState] = useState<ResultState>({ status: 'idle' })
  const resetUsedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(
    async (cursor: string | undefined, append: boolean) => {
      const parsed = SearchQuerySchema.safeParse(mailboxId === undefined ? { q } : { q, mailbox_id: mailboxId })
      if (!parsed.success) {
        setState({ status: 'invalid', message: 'Enter between 1 and 256 characters, not only spaces.' })
        return
      }
      const query = parsed.data
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      if (!append) resetUsedRef.current = false
      if (append) setState((prev) => (prev.status === 'ready' ? { ...prev, loadingMore: true } : prev))
      else setState({ status: 'loading' })
      const outcome = await request((ctx, signal) => {
        const combined = new AbortController()
        const abort = () => combined.abort()
        signal.addEventListener('abort', abort, { once: true })
        controller.signal.addEventListener('abort', abort, { once: true })
        return gateway.searchMail(ctx, cursor === undefined ? query : { ...query, cursor }, combined.signal)
      })
      if (controller.signal.aborted || outcome.kind === 'stale') return
      if (outcome.kind === 'failed') {
        if (isApiError(outcome.error, 'cursor_invalid') && cursor !== undefined && !resetUsedRef.current) {
          resetUsedRef.current = true
          void load(undefined, false)
          return
        }
        const failure = describeFailure(outcome.error, 'read')
        setState(failure.code === 'unavailable_resource' ? { status: 'unavailable' } : { status: 'error', failure })
        return
      }
      const page: SearchPageResult = outcome.value
      setState((prev) => {
        const existing = append && prev.status === 'ready' ? prev.items : []
        const seen = new Set(existing.map((t) => t.id))
        return { status: 'ready', items: [...existing, ...page.items.filter((t) => !seen.has(t.id))], nextCursor: page.next_cursor, loadingMore: false, mailboxId: page.mailbox_id }
      })
    },
    [gateway, request, q, mailboxId],
  )

  useEffect(() => {
    if (q === '') {
      setState({ status: 'idle' })
      return
    }
    void load(undefined, false)
    return () => abortRef.current?.abort()
  }, [load, q])
  useLayoutEffect(() => () => abortRef.current?.abort(), [])

  const mailboxName = (id: string): string => (mailboxes.status === 'ready' ? (mailboxes.mailboxes.find((m) => m.id === id)?.display_name ?? 'Mailbox') : 'Mailbox')

  return (
    <section aria-label="Search results" className="mx-auto max-w-3xl p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
        <h1 className="text-sm font-semibold">Search</h1>
        {q !== '' && (
          <p className="min-w-0 truncate text-[13px] text-muted">
            “{q}” in {mailboxId === undefined ? 'all your mailboxes' : mailboxName(mailboxId)}
          </p>
        )}
        <Badge tone="neutral" className="ml-auto">Literal text match</Badge>
      </div>
      {state.status === 'idle' && <EmptyState title="Search your mail" body="Type a word or phrase in the search box above. Matching is literal and case-insensitive; drafts and notes are not searched." />}
      {state.status === 'invalid' && <div role="alert"><EmptyState title="That search cannot be run" body={state.message} /></div>}
      {state.status === 'loading' && <div role="status" aria-label="Searching"><Skeleton rows={5} /></div>}
      {state.status === 'unavailable' && <EmptyState title="This mailbox is unavailable" body="The selected mailbox may not exist or may not be readable by you now." />}
      {state.status === 'error' && (
        <div role="alert">
          <EmptyState title="The search could not be completed" body={state.failure.message} action={<Button variant="primary" onClick={() => void load(undefined, false)}>Try again</Button>} />
        </div>
      )}
      {state.status === 'ready' && (
        <>
          {state.items.length === 0 && state.nextCursor === null && <EmptyState title="No matches" body="No readable conversation contains that text." />}
          {state.items.length === 0 && state.nextCursor !== null && <EmptyState title="Nothing on this page" body="This page was empty, but more results may be available below." />}
          {state.items.length > 0 && (
            <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
              {state.items.map((thread) => (
                <li key={thread.id}>
                  <Link data-thread to={`/mailboxes/${thread.mailbox_id}/threads/${thread.id}`} className="row flex items-baseline gap-3 px-3 hover:bg-surface-2">
                    <span className={cx('min-w-0 flex-1 truncate text-sm', thread.unread && 'font-semibold')}>
                      {thread.sender?.display_name ?? thread.sender?.address ?? 'Unknown sender'}
                      <span className="text-muted"> — </span>
                      {thread.subject ?? '(no subject)'}
                      {thread.subject_truncated && <span title="Subject shortened">…</span>}
                    </span>
                    <span className="hidden max-w-[14rem] truncate text-[13px] text-muted sm:inline">{thread.preview_text}</span>
                    <Badge tone="neutral">{mailboxName(thread.mailbox_id)}</Badge>
                    <span className="shrink-0 text-[12px] tabular-nums text-muted">{thread.last_message_at === null ? 'No date' : formatWhen(thread.last_message_at)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {state.nextCursor !== null && (
            <div className="mt-2 flex justify-center">
              <Button size="sm" disabled={state.loadingMore} onClick={() => void load(state.nextCursor ?? undefined, true)}>
                {state.loadingMore ? 'Loading…' : 'Show more results'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
