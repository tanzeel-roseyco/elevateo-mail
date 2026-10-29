// Own draft summaries for one mailbox (BE-02 C §4): updated_at DESC, bounded pages, dedupe by
// id, one cursor reset per traversal. "New draft" mints the draft id client-side and opens the
// editor at version 0; nothing is created until the first explicit save.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { describeFailure, type CollaborationFailure } from '@/app/collaborationFailure'
import { useMailbox } from '@/app/mailboxes'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useGateway } from '@/app/session'
import type { DraftPage, DraftSummary } from '@/data/contract'
import { isApiError } from '@/data/errors'
import { newId } from '@/lib/ids'
import { cx, formatWhen } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { EmptyState, Skeleton } from '@/ui/Async'

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; items: DraftSummary[]; nextCursor: string | null; loadingMore: boolean }
  | { status: 'unavailable' }
  | { status: 'error'; failure: CollaborationFailure }

export function DraftsPage() {
  const { mailboxId } = useParams<{ mailboxId: string }>()
  if (mailboxId === undefined) return null
  // Resource owner key (D3): a different mailbox starts with fresh list state.
  return <DraftList key={mailboxId} mailboxId={mailboxId} />
}

function DraftList({ mailboxId }: { mailboxId: string }) {
  const gateway = useGateway()
  const navigate = useNavigate()
  const mailbox = useMailbox(mailboxId)
  const { request } = useProtectedRequest()
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const resetUsedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(
    async (cursor: string | undefined, append: boolean) => {
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
        return gateway.listDrafts(ctx, mailboxId, cursor === undefined ? {} : { cursor }, combined.signal)
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
      const page: DraftPage = outcome.value
      setState((prev) => {
        const existing = append && prev.status === 'ready' ? prev.items : []
        const seen = new Set(existing.map((d) => d.id))
        return { status: 'ready', items: [...existing, ...page.items.filter((d) => !seen.has(d.id))], nextCursor: page.next_cursor, loadingMore: false }
      })
    },
    [gateway, request, mailboxId],
  )

  useEffect(() => {
    void load(undefined, false)
    return () => abortRef.current?.abort()
  }, [load])
  useLayoutEffect(() => () => abortRef.current?.abort(), [])

  const canCompose = mailbox === undefined ? true : mailbox.capabilities.compose
  const startDraft = () => navigate(`/mailboxes/${mailboxId}/drafts/${newId()}?new=1`)

  return (
    <section aria-label="Drafts" className="mx-auto max-w-3xl p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
        <h1 className="text-sm font-semibold">Drafts</h1>
        <Badge tone="warn">Stored on this installation only</Badge>
        {canCompose && (
          <Button size="sm" variant="primary" className="ml-auto" onClick={startDraft}>New draft</Button>
        )}
      </div>
      {mailbox !== undefined && !canCompose && (
        <EmptyState title="Composing is not available in this mailbox" body="You can read this mailbox but not write drafts in it." />
      )}
      {state.status === 'loading' && <div role="status" aria-label="Loading drafts"><Skeleton rows={4} /></div>}
      {state.status === 'unavailable' && <EmptyState title="Drafts are unavailable" body="This mailbox may not exist, or you may not currently be able to compose in it." />}
      {state.status === 'error' && (
        <div role="alert">
          <EmptyState title="Drafts could not be loaded" body={state.failure.message} action={<Button variant="primary" onClick={() => void load(undefined, false)}>Try again</Button>} />
        </div>
      )}
      {state.status === 'ready' && (
        <>
          {state.items.length === 0 && state.nextCursor === null && <EmptyState title="No drafts" body="Drafts you save in this mailbox appear here. Only you can see your drafts." />}
          {state.items.length === 0 && state.nextCursor !== null && <EmptyState title="Nothing on this page" body="This page was empty, but more drafts may be available below." />}
          {state.items.length > 0 && (
            <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
              {state.items.map((draft) => (
                <li key={draft.id}>
                  <Link to={`/mailboxes/${mailboxId}/drafts/${draft.id}`} className="row flex items-baseline gap-3 px-3 hover:bg-surface-2">
                    <span className={cx('min-w-0 flex-1 truncate text-sm', draft.state === 'consumed' && 'text-muted')}>
                      {draft.subject === '' ? '(no subject)' : draft.subject}
                      {draft.subject_truncated && <span title="Subject shortened">…</span>}
                    </span>
                    {draft.reply_to_thread_id !== null && <Badge tone="neutral">Reply</Badge>}
                    {draft.state === 'consumed' && <Badge tone="neutral">Consumed</Badge>}
                    <span className="shrink-0 text-[12px] tabular-nums text-muted">v{draft.version} · {formatWhen(draft.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {state.nextCursor !== null && (
            <div className="mt-2 flex justify-center">
              <Button size="sm" disabled={state.loadingMore} onClick={() => void load(state.nextCursor ?? undefined, true)}>
                {state.loadingMore ? 'Loading…' : 'Show more drafts'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
