// Scoped literal search (BE-02 D §9). The query and optional mailbox live in the URL; results are
// unchanged ThreadSummary rows (one per thread, canonical preview, no highlights) that link into
// the reader, presented as Gmail-structured rows in the Flux list card. Metacharacters are literal
// on the server; the client only enforces the 1..256 code-point, non-whitespace rule before asking.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { describeFailure, type CollaborationFailure } from '@/app/collaborationFailure'
import { SearchBox } from '@/app/SearchBox'
import { useMailboxes } from '@/app/mailboxes'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useGateway } from '@/app/session'
import { SearchQuerySchema, type SearchPage as SearchPageResult, type ThreadSummary } from '@/data/contract'
import { isApiError } from '@/data/errors'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { EmptyState } from '@/ui/Async'
import { MagnifyingGlassIcon } from '@/ui/icons'
import { PageHeader } from '@/ui/PageHeader'
import { MessageRow, MessageRowSkeleton } from '@/features/inbox/MessageRow'

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
  return (
    <>
      <PageHeader title="Search" subtitle="Find conversations across the mailboxes you can read" />
      <SearchBox variant="expanded" />
      <SearchResults key={JSON.stringify([q, mailboxId])} q={q} mailboxId={mailboxId === '' ? undefined : mailboxId} />
    </>
  )
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
    <section aria-label="Search results" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-medium text-zinc-800 dark:text-white">Results</h2>
        {q !== '' && (
          <p className="min-w-0 truncate text-sm text-zinc-500">
            “{q}” in {mailboxId === undefined ? 'all your mailboxes' : mailboxName(mailboxId)}
          </p>
        )}
        <Badge tone="neutral" size="sm" className="ms-auto">Literal text match</Badge>
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800">
        {state.status === 'idle' && <EmptyState icon={<MagnifyingGlassIcon className="size-5" />} title="Search your mail" body="Enter a word or phrase and choose a search scope above. Matching is literal and case-insensitive; drafts and notes are not searched." className="m-6" />}
        {state.status === 'invalid' && <div role="alert"><EmptyState icon={<MagnifyingGlassIcon className="size-5" />} title="That search cannot be run" body={state.message} className="m-6" /></div>}
        {state.status === 'loading' && <div role="status" aria-label="Searching"><MessageRowSkeleton rows={5} /></div>}
        {state.status === 'unavailable' && <EmptyState icon={<MagnifyingGlassIcon className="size-5" />} title="This mailbox is unavailable" body="The selected mailbox may not exist or may not be readable by you now." className="m-6" />}
        {state.status === 'error' && (
          <div role="alert" className="p-3">
            <Callout variant="danger" heading="The search could not be completed" actions={<Button variant="primary" onClick={() => void load(undefined, false)}>Try again</Button>}>{state.failure.message}</Callout>
          </div>
        )}
        {state.status === 'ready' && (
          <>
            {state.items.length === 0 && state.nextCursor === null && <EmptyState icon={<MagnifyingGlassIcon className="size-5" />} title="No matches" body="No readable conversation contains that text." className="m-6" />}
            {state.items.length === 0 && state.nextCursor !== null && <EmptyState icon={<MagnifyingGlassIcon className="size-5" />} title="Nothing on this page" body="This page was empty, but more results may be available below." className="m-6" />}
            {state.items.length > 0 && (
              <ol aria-label="Matching conversations">
                {state.items.map((thread) => (
                  <MessageRow key={thread.id} thread={thread} to={`/mailboxes/${thread.mailbox_id}/threads/${thread.id}`} mailboxName={mailboxName(thread.mailbox_id)} selected={false} starred={false} />
                ))}
              </ol>
            )}
            {state.nextCursor !== null && (
              <div className="flex justify-center border-t border-zinc-200 p-3 dark:border-zinc-700">
                <Button size="sm" disabled={state.loadingMore} onClick={() => void load(state.nextCursor ?? undefined, true)}>
                  {state.loadingMore ? 'Loading…' : 'Show more results'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
