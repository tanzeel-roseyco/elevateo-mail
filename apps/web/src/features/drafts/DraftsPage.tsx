// Own draft summaries for one mailbox (BE-02 C §4) shown as the "Drafts" folder in the Gmail list
// structure: updated_at DESC, bounded pages, dedupe by id, one cursor reset per traversal.
// "New draft" mints the draft id client-side and opens the compose window at version 0; nothing
// is created until the first explicit save.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { describeFailure, type CollaborationFailure } from '@/app/collaborationFailure'
import { useMailbox } from '@/app/mailboxes'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useGateway } from '@/app/session'
import type { DraftPage, DraftSummary } from '@/data/contract'
import { isApiError } from '@/data/errors'
import { cx, formatWhen } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { Button, IconButton } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { EmptyState } from '@/ui/Async'
import { ArrowPathIcon, DocumentTextIcon, PencilSquareIcon } from '@/ui/icons'
import { composeDraftPath } from '@/features/inbox/inboxContext'
import { MessageRowSkeleton } from '@/features/inbox/MessageRow'

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
    resetUsedRef.current = false
    void load(undefined, false)
    return () => abortRef.current?.abort()
  }, [load])
  useLayoutEffect(() => () => abortRef.current?.abort(), [])

  const canCompose = mailbox === undefined ? true : mailbox.capabilities.compose
  const startDraft = () => navigate(composeDraftPath(mailboxId))
  const retry = () => {
    resetUsedRef.current = false
    void load(undefined, false)
  }

  return (
    <section aria-label="Drafts" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-base font-medium text-zinc-800 dark:text-white">Drafts</h1>
        <Badge tone="warn" size="sm">Stored on this installation only</Badge>
        {canCompose && (
          <Button size="sm" variant="primary" icon={<PencilSquareIcon className="size-4" />} className="ms-auto" onClick={startDraft}>New draft</Button>
        )}
      </div>
      {mailbox !== undefined && !canCompose && (
        <EmptyState icon={<DocumentTextIcon className="size-5" />} title="Composing is not available in this mailbox" body="You can read this mailbox but not write drafts in it." className="mb-4" />
      )}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex h-12 items-center gap-1 border-b border-zinc-200 px-2 dark:border-zinc-700">
          <IconButton label="Refresh drafts" onClick={retry} disabled={state.status === 'loading'}><ArrowPathIcon className="size-5" /></IconButton>
          <div className="flex-1" />
          {state.status === 'ready' && state.items.length > 0 && (
            <span className="pe-2 text-sm tabular-nums text-zinc-500">1–{state.items.length}{state.nextCursor !== null ? '+' : ''} of {state.items.length}{state.nextCursor !== null ? '+' : ''}</span>
          )}
        </div>
        {state.status === 'loading' && <div role="status" aria-label="Loading drafts"><MessageRowSkeleton rows={4} /></div>}
        {state.status === 'unavailable' && <EmptyState icon={<DocumentTextIcon className="size-5" />} title="Drafts are unavailable" body="This mailbox may not exist, or you may not currently be able to compose in it." className="m-6" />}
        {state.status === 'error' && (
          <div role="alert" className="p-3">
            <Callout variant="danger" heading="Drafts could not be loaded" actions={<Button variant="primary" onClick={retry}>Try again</Button>}>{state.failure.message}</Callout>
          </div>
        )}
        {state.status === 'ready' && (
          <>
            {state.items.length === 0 && state.nextCursor === null && <EmptyState icon={<DocumentTextIcon className="size-5" />} title="No drafts" body="Drafts you save in this mailbox appear here. Only you can see your drafts." className="m-6" />}
            {state.items.length === 0 && state.nextCursor !== null && <EmptyState icon={<DocumentTextIcon className="size-5" />} title="Nothing on this page" body="This page was empty, but more drafts may be available below." className="m-6" />}
            {state.items.length > 0 && (
              <ol>
                {state.items.map((draft) => (
                  <li key={draft.id} className="border-b border-zinc-800/10 last:border-b-0 dark:border-white/10">
                    <Link to={`/mailboxes/${mailboxId}/drafts/${draft.id}`} className="flex h-10 items-center gap-3 px-3 text-sm hover:bg-zinc-50 focus-visible:outline-offset-[-2px] dark:hover:bg-white/5">
                      <DocumentTextIcon aria-hidden className="size-5 shrink-0 text-zinc-400" />
                      <span className="w-20 shrink-0 font-medium text-(--color-accent-content)">Draft</span>
                      <span className={cx('min-w-0 flex-1 truncate', draft.state === 'consumed' ? 'text-zinc-500' : 'text-zinc-800 dark:text-white')}>
                        {draft.subject === '' ? '(no subject)' : draft.subject}
                        {draft.subject_truncated && <span title="Subject shortened">…</span>}
                      </span>
                      {draft.reply_to_thread_id !== null && <Badge tone="neutral" size="sm">Reply</Badge>}
                      {draft.state === 'consumed' && <Badge tone="neutral" size="sm">Consumed</Badge>}
                      <span className="w-18 shrink-0 text-end text-xs tabular-nums text-zinc-500 max-sm:hidden">v{draft.version}</span>
                      <span className="w-18 shrink-0 text-end text-xs tabular-nums text-zinc-500">{formatWhen(draft.updated_at)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {state.nextCursor !== null && (
              <div className="flex justify-center border-t border-zinc-200 p-3 dark:border-zinc-700">
                <Button size="sm" disabled={state.loadingMore} onClick={() => void load(state.nextCursor ?? undefined, true)}>
                  {state.loadingMore ? 'Loading…' : 'Show more drafts'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
