// Thread summary list for the selected mailbox in the Gmail list structure (INBOX-SPEC §1–2):
// card, 48px toolbar (select / refresh / filter tabs / pager), 40px rows, selection toolbar.
// URL mailbox selection and paged summary/detail separation adapted from first-party Ledger
// frontend 4322cfbb, src/features/live/LiveInboxPage.tsx (blob 54b1284b…); old Gmail/history
// wiring, permission assumptions and account cache keys are replaced by the FE-01 contract.
//
// AIDEV-NOTE: The URL `filter` carries the folder view: `unread` is the server filter; `starred`
// is a per-device mark applied to the loaded rows (starStore.ts). Mark read/unread is the only
// real row action; archive/delete/spam/snooze are disabled "Not available yet".
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import type { ThreadPage, ThreadSummary } from '@/data/contract'
import { GatewayError, isApiError } from '@/data/errors'
import { useGateway, useSession } from '@/app/session'
import { useMailbox } from '@/app/mailboxes'
import { useProtectedRequest } from '@/app/protectedRequest'
import { describeFailure } from '@/app/collaborationFailure'
import { newTraversalBudget, readPage } from '@/lib/readPage'
import { cx } from '@/lib/format'
import { Button, IconButton } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { EmptyState } from '@/ui/Async'
import { Checkbox } from '@/ui/Field'
import { ArchiveBoxIcon, ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, EllipsisVerticalIcon, EnvelopeIcon, EnvelopeOpenIcon, ExclamationTriangleIcon, InboxIcon, PencilSquareIcon, StarIcon, TrashIcon } from '@/ui/icons'
import { composeDraftPath, isTypingTarget, parseView, useInboxReport, type InboxView } from './inboxContext'
import { MessageRow, MessageRowSkeleton } from './MessageRow'
import { useStarStore } from './starStore'

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; items: ThreadSummary[]; nextCursor: string | null; loadingMore: boolean; pageError: string | null }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }

export function InboxPage({ selectedMailboxId }: { selectedMailboxId?: string } = {}) {
  const params = useParams<{ mailboxId: string; threadId: string }>()
  const mailboxId = selectedMailboxId ?? params.mailboxId
  const [searchParams] = useSearchParams()
  const view = parseView(searchParams.get('filter'))
  const filter = view === 'unread' ? 'unread' : 'all'
  if (mailboxId === undefined) return null
  // AIDEV-NOTE: Resource owner key (D3): list state, traversal budget and in-flight controller live
  // in a component keyed by mailbox+server filter, so a changed resource begins with fresh loading
  // state in its first committed render and unmount cleanup aborts the old traversal at that commit.
  // Clearing state in a passive effect is insufficient: it would show the old rows under the new
  // URL for a frame and let an old completion landing before cleanup pass isCurrent.
  return <MailboxThreadList key={`${mailboxId}\n${filter}`} mailboxId={mailboxId} filter={filter} view={view} />
}

const TOOL = 'size-8'

function MailboxThreadList({ mailboxId, filter, view }: { mailboxId: string; filter: 'all' | 'unread'; view: InboxView }) {
  const { threadId } = useParams<{ threadId: string }>()
  const navigate = useNavigate()
  const gateway = useGateway()
  const mailbox = useMailbox(mailboxId)
  const { scope, context, handleError, state: sessionState } = useSession()
  const { proof, request } = useProtectedRequest()
  const report = useInboxReport()
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [readBusy, setReadBusy] = useState<ReadonlySet<string>>(new Set())
  const [writeError, setWriteError] = useState<string | null>(null)
  // AIDEV-NOTE: One traversal budget shared by the initial load and every continuation; only a
  // fresh traversal (initial load, mailbox/filter change, explicit retry) renews it (D4, FE-R08).
  const budgetRef = useRef(newTraversalBudget())
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  // Lets an in-flight bulk read-state loop stop once this page is gone.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const stars = useStarStore(sessionState.status === 'ready' ? { actorId: sessionState.session.actor.id, organizationId: sessionState.session.organization.id, mailboxId } : null)

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

  // Folder badge: unread rows loaded so far, "+" while the server has more (a lower bound).
  useEffect(() => {
    if (!report) return
    if (state.status !== 'ready') {
      report.report(null)
      return
    }
    const unread = state.items.filter((t) => t.unread).length
    report.report({ unread: `${unread}${state.nextCursor !== null ? '+' : ''}` })
    return () => report.report(null)
  }, [report, state])

  const visible: ThreadSummary[] = state.status === 'ready' ? (view === 'starred' ? state.items.filter((t) => stars.isStarred(t.id)) : state.items) : []

  /** Real per-actor read-state write for one thread; the row updates only from the server's answer. */
  const setRead = async (thread: ThreadSummary, read: boolean): Promise<'ok' | 'failed' | 'stale' | 'skipped'> => {
    if (!proof || readBusy.has(thread.id)) return 'skipped'
    setReadBusy((prev) => new Set(prev).add(thread.id))
    setWriteError(null)
    const outcome = await request((ctx, signal) => gateway.setThreadReadState(ctx, proof, thread.id, { mailbox_id: mailboxId, read }, signal))
    if (outcome.kind === 'stale') return 'stale'
    setReadBusy((prev) => {
      const next = new Set(prev)
      next.delete(thread.id)
      return next
    })
    if (outcome.kind === 'failed') {
      const failure = describeFailure(outcome.error, 'write')
      setWriteError(`${failure.message}${failure.uncertain ? ' Refresh to see the current state; repeating the same choice is safe.' : ''}`)
      return 'failed'
    }
    const confirmedRead = outcome.value.read
    // AIDEV-NOTE: In the Unread folder a confirmed-read row leaves the list (Gmail behaviour); the
    // server cursor stays valid because the row was already consumed from the page.
    setState((prev) => {
      if (prev.status !== 'ready') return prev
      if (view === 'unread' && confirmedRead) return { ...prev, items: prev.items.filter((t) => t.id !== thread.id) }
      return { ...prev, items: prev.items.map((t) => (t.id === thread.id ? { ...t, unread: !confirmedRead } : t)) }
    })
    return 'ok'
  }

  // One bulk run at a time; it stops as soon as the owner unmounts or the session goes stale.
  const bulkBusy = useRef(false)
  const bulkRead = async (read: boolean) => {
    if (bulkBusy.current) return
    bulkBusy.current = true
    try {
      for (const thread of visible) {
        if (!mounted.current) return
        if (!selected.has(thread.id) || thread.unread !== read) continue
        const result = await setRead(thread, read)
        if (result === 'stale' || !mounted.current) return
      }
      setSelected(new Set())
    } finally {
      bulkBusy.current = false
    }
  }

  const toggleSelect = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  const allSelected = visible.length > 0 && visible.every((t) => selected.has(t.id))
  const someSelected = visible.some((t) => selected.has(t.id))

  // Roving focus plus Gmail keys over the conversation links: ↓/j, ↑/k move; o opens; x selects;
  // s stars; Shift+U marks unread. Enter is the link's own activation.
  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
    const links = listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-thread]')
    if (!links || links.length === 0) return
    const all = Array.from(links)
    const current = all.indexOf(document.activeElement as HTMLAnchorElement)
    const focusedThread = current >= 0 ? visible[current] : undefined
    switch (event.key) {
      case 'ArrowDown':
      case 'j':
        all[Math.min(current + 1, all.length - 1)]?.focus()
        break
      case 'ArrowUp':
      case 'k':
        all[Math.max(current - 1, 0)]?.focus()
        break
      case 'o':
        if (current >= 0) all[current]?.click()
        break
      case 'x':
        if (focusedThread) toggleSelect(focusedThread.id, !selected.has(focusedThread.id))
        break
      case 's':
        if (focusedThread) stars.toggle(focusedThread.id)
        break
      case 'U':
        if (focusedThread && !focusedThread.unread) void setRead(focusedThread, false)
        break
      default:
        return
    }
    event.preventDefault()
  }

  // The active filter travels into the reader so its back link can restore this view (FE-R11).
  const viewSuffix = view === 'all' ? '' : `?filter=${view}`
  const canCompose = mailbox?.capabilities.compose === true
  const canWrite = proof !== null
  const unavailable = state.status === 'unavailable'
  const ready = state.status === 'ready'
  const rangeLabel = ready ? `1–${visible.length}${state.nextCursor !== null && view !== 'starred' ? '+' : ''} of ${visible.length}${state.nextCursor !== null && view !== 'starred' ? '+' : ''}` : ''

  return (
    <section aria-label="Conversations" className="flex min-h-0 flex-1 flex-col">
      <h2 className="sr-only">Conversations</h2>
      {/* AIDEV-NOTE: An unknown mailbox capability is never treated as compose authority. */}
      {ready && canCompose && (
        <Link to={composeDraftPath(mailboxId)} className="mb-3 inline-flex items-center gap-2 self-start rounded-lg px-2 py-1 text-sm font-medium text-(--color-accent-content) hover:bg-zinc-800/5 md:hidden">
          <PencilSquareIcon className="size-5" /> Compose draft
        </Link>
      )}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800">
        {/* Toolbar: selection controls on the start side, filter tabs and pager on the end side. */}
        {/* min-h + wrap: at 390px the selection actions wrap under the checkbox instead of clipping. */}
        <div className="flex min-h-12 flex-wrap items-center gap-x-1 gap-y-1 border-b border-zinc-200 px-2 py-1 dark:border-zinc-700">
          <Checkbox
            aria-label={allSelected ? 'Clear selection' : 'Select all conversations'}
            checked={allSelected}
            onChange={(event) => setSelected(event.target.checked ? new Set(visible.map((t) => t.id)) : new Set())}
            disabled={!ready || visible.length === 0}
            className="mx-1.5"
          />
          {someSelected ? (
            <div role="toolbar" aria-label="Selection actions" className="flex items-center gap-0.5">
              <IconButton label="Archive (not available yet)" disabled className={TOOL}><ArchiveBoxIcon className="size-5" /></IconButton>
              <IconButton label="Report spam (not available yet)" disabled className={TOOL}><ExclamationTriangleIcon className="size-5" /></IconButton>
              <IconButton label="Delete (not available yet)" disabled className={TOOL}><TrashIcon className="size-5" /></IconButton>
              <IconButton label="Mark as read" disabled={!canWrite} onClick={() => void bulkRead(true)} className={TOOL}><EnvelopeOpenIcon className="size-5" /></IconButton>
              <IconButton label="Mark as unread" disabled={!canWrite} onClick={() => void bulkRead(false)} className={TOOL}><EnvelopeIcon className="size-5" /></IconButton>
              <IconButton label="Snooze (not available yet)" disabled className={TOOL}><ClockIcon className="size-5" /></IconButton>
              <span className="ms-2 text-sm text-zinc-500">{selected.size} selected</span>
            </div>
          ) : (
            <div className="flex items-center gap-0.5">
              <IconButton label="Refresh" onClick={() => load(undefined, false)} disabled={state.status === 'loading'} className={TOOL}><ArrowPathIcon className="size-5" /></IconButton>
              <IconButton label="More (not available yet)" disabled className={TOOL}><EllipsisVerticalIcon className="size-5" /></IconButton>
            </div>
          )}
          <div className="flex-1" />
          {/* AIDEV-NOTE: A denied mailbox has no usable filter destinations; retain its unavailable explanation. */}
          {!unavailable && (
            <nav aria-label="Filter" className="flex items-center gap-1 max-sm:hidden">
              {(['all', 'unread', 'starred'] as const).map((value) => (
                <Link
                  key={value}
                  to={value === 'all' ? `/mailboxes/${mailboxId}` : `/mailboxes/${mailboxId}?filter=${value}`}
                  aria-current={view === value ? 'page' : undefined}
                  className={cx(
                    'inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm font-medium',
                    view === value ? 'border-b-2 border-(--color-accent) text-zinc-800 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-white',
                  )}
                >
                  {value === 'starred' && <StarIcon className="size-4" aria-hidden />}
                  {value === 'all' ? 'All' : value === 'unread' ? 'Unread' : 'Starred'}
                </Link>
              ))}
            </nav>
          )}
          {ready && visible.length > 0 && (
            <div className="ms-2 flex items-center gap-0.5">
              <span className="text-sm tabular-nums text-zinc-500">{rangeLabel}</span>
              <IconButton label="Newer conversations" disabled className={TOOL}><ChevronLeftIcon className="size-5" /></IconButton>
              <IconButton label="Older conversations" disabled={state.nextCursor === null || state.loadingMore || view === 'starred'} onClick={() => load(state.nextCursor ?? undefined, true)} className={TOOL}><ChevronRightIcon className="size-5" /></IconButton>
            </div>
          )}
        </div>

        {writeError !== null && (
          <div className="p-3">
            <Callout variant="danger" role="alert">{writeError}</Callout>
          </div>
        )}
        {state.status === 'loading' && <div role="status" aria-label="Loading conversations"><MessageRowSkeleton /></div>}
        {unavailable && (
          <EmptyState icon={<InboxIcon className="size-5" />} title="This mailbox is unavailable" body="It may not exist or you may not currently have access to it." className="m-6" />
        )}
        {state.status === 'error' && (
          <div role="alert" className="p-3">
            <Callout variant="danger" heading="Conversations could not be loaded" actions={<Button variant="primary" onClick={() => load(undefined, false)}>Try again</Button>}>
              {state.message}
            </Callout>
          </div>
        )}
        {ready && (
          <>
            {/* An empty page with a continuation cursor is not a terminal empty mailbox (FE-R09). */}
            {visible.length === 0 && (view === 'starred' || state.nextCursor === null) && (
              <EmptyState
                icon={<InboxIcon className="size-5" />}
                title={view === 'unread' ? 'No unread conversations' : view === 'starred' ? 'No starred conversations' : 'No conversations'}
                body={view === 'starred' ? 'Star a loaded conversation to keep it here on this device.' : 'This mailbox has nothing to show for the current filter.'}
                className="m-6"
              />
            )}
            {visible.length === 0 && view !== 'starred' && state.nextCursor !== null && (
              <EmptyState icon={<InboxIcon className="size-5" />} title="Nothing on this page" body="This page of results was empty, but more conversations may be available below." className="m-6" />
            )}
            {visible.length > 0 && (
              <ul ref={listRef} onKeyDown={onListKeyDown} aria-label="Conversation list">
                {visible.map((thread) => (
                  <MessageRow
                    key={thread.id}
                    thread={thread}
                    to={`/mailboxes/${mailboxId}/threads/${thread.id}${viewSuffix}`}
                    current={threadId === thread.id}
                    selected={selected.has(thread.id)}
                    onSelect={(checked) => toggleSelect(thread.id, checked)}
                    starred={stars.isStarred(thread.id)}
                    onStar={() => stars.toggle(thread.id)}
                    onToggleRead={canWrite ? () => void setRead(thread, thread.unread) : undefined}
                    readBusy={readBusy.has(thread.id)}
                  />
                ))}
              </ul>
            )}
            {/* Continuation depends on next_cursor, never on the row count (D4, FE-R09). */}
            {state.nextCursor !== null && view !== 'starred' && (
              <div className="flex justify-center border-t border-zinc-200 p-3 dark:border-zinc-700">
                <div className="flex flex-col items-center gap-2">
                  {state.pageError !== null && <p role="alert" className="text-sm text-red-500">{state.pageError}</p>}
                  <Button size="sm" disabled={state.loadingMore} onClick={() => load(state.nextCursor ?? undefined, true)}>
                    {state.loadingMore ? 'Loading…' : state.pageError !== null ? 'Retry more conversations' : 'Show more conversations'}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {view === 'starred' && ready && (
        <p className="mt-2 text-xs text-zinc-500">Stars are kept on this device only and apply to the conversations loaded so far.</p>
      )}
      <ShortcutHint onCompose={canCompose ? () => navigate(composeDraftPath(mailboxId)) : null} />
    </section>
  )
}

/** Discoverable shortcut legend; keeps the keyboard contract visible without a modal. */
function ShortcutHint({ onCompose }: { onCompose: (() => void) | null }) {
  return (
    <p className="mt-3 text-xs text-zinc-400 max-md:hidden">
      Keyboard: <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>o</kbd> open · <kbd>x</kbd> select · <kbd>s</kbd> star · <kbd>Shift</kbd>+<kbd>U</kbd> unread · <kbd>/</kbd> search
      {onCompose && <> · <kbd>c</kbd> compose</>} · <kbd>u</kbd> back to list
    </p>
  )
}
