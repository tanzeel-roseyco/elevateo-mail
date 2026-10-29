// Unified inbox at /inbox (sidebar "Inbox"): one Gmail-structured list over every mailbox the actor
// can read, served by the organization-wide `GET /v1/threads` list (gateway.listOrganizationThreads).
// Each row names its mailbox, opens in that mailbox's reader (`/mailboxes/{mailbox_id}/threads/{id}`),
// and every star / read / folder write is sent with the row's own mailbox id, so replies and moves
// stay pinned to the conversation's original mailbox.
//
// AIDEV-NOTE: The server owns ordering and paging (last_message_at desc, nulls last, id desc; cursor
// continuation with the shared one-reset `cursor_invalid` policy in lib/readPage.ts). This page
// replaced the provisional client-side per-mailbox merge once the server list existed; it must not
// grow a fallback that fans out per mailbox again. A failed read is an explicit error state.
// AIDEV-NOTE: One mailbox skips the unified list and redirects to that mailbox's ordinary inbox page.
// Like InboxPage, the list owner is keyed by the view so a filter change starts from a fresh loading
// state and the previous read is aborted in the unmount commit (D3/D4).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import type { Mailbox, OrganizationThreadPage, ThreadSummary } from '@/data/contract'
import { GatewayError, isApiError } from '@/data/errors'
import { useGateway, useSession } from '@/app/session'
import { useMailboxes } from '@/app/mailboxes'
import { SearchBox } from '@/app/SearchBox'
import { matchesView, type FolderFacts } from '@/domain/threadFolders'
import { cx } from '@/lib/format'
import { newTraversalBudget, readPage } from '@/lib/readPage'
import { Button, buttonClass, IconButton } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { Select } from '@/ui/Field'
import { PageHeader } from '@/ui/PageHeader'
import { ArrowPathIcon, InboxIcon, StarIcon } from '@/ui/icons'
import { isTypingTarget, parseView, VIEW_LABELS, type InboxView } from './inboxContext'
import { MessageRow, MessageRowSkeleton } from './MessageRow'
import { canSnoozeIn, folderActionsFor, type RowAction } from './rowActions'
import { useMailboxThreadWrites } from './useThreadMutations'

const VIEW_ORDER: readonly InboxView[] = ['all', 'unread', 'starred', 'snoozed', 'archive', 'spam', 'trash']

const EMPTY_COPY: Record<InboxView, { title: string; body: string }> = {
  all: { title: 'No conversations', body: 'None of your mailboxes has anything in its inbox.' },
  unread: { title: 'No unread conversations', body: 'Everything in your mailboxes has been read.' },
  starred: { title: 'No starred conversations', body: 'Star a conversation in any mailbox to keep it here for yourself.' },
  snoozed: { title: 'Nothing snoozed', body: 'Snoozed conversations wait here and return to their inbox at the chosen time.' },
  archive: { title: 'Nothing archived', body: 'Archived conversations stay available to every member of their mailbox.' },
  spam: { title: 'No spam', body: 'Conversations reported as spam in your mailboxes are kept here.' },
  trash: { title: 'Trash is empty', body: 'Deleted conversations are kept here until a retention rule removes them.' },
}

function unifiedPath(view: InboxView): string {
  return view === 'all' ? '/inbox' : `/inbox?filter=${view}`
}

export function UnifiedInboxPage() {
  const snapshot = useMailboxes()
  const [searchParams] = useSearchParams()
  const view = parseView(searchParams.get('filter'))
  if (snapshot.status === 'ready' && snapshot.mailboxes.length === 1) {
    // Nothing to unify: the ordinary mailbox inbox already is the whole picture.
    const only = snapshot.mailboxes[0]!.id
    return <Navigate to={view === 'all' ? `/mailboxes/${only}` : `/mailboxes/${only}?filter=${view}`} replace />
  }
  return (
    <>
      <PageHeader title="Inbox" subtitle={snapshot.status === 'ready' ? `All mailboxes · ${snapshot.mailboxes.length} visible` : 'All mailboxes'} actions={<SearchBox variant="header" />} />
      {snapshot.status === 'loading' && <div role="status" aria-label="Loading mailbox selection"><Skeleton rows={4} /></div>}
      {snapshot.status === 'error' && (
        <ErrorState title="Mailboxes could not be loaded" body="Use Try again in the navigation, or reload the page." action={<a href="." className={buttonClass('primary', 'md')}>Reload page</a>} />
      )}
      {snapshot.status === 'ready' && snapshot.mailboxes.length === 0 && (
        <EmptyState
          icon={<InboxIcon className="size-5" />}
          title="No visible mailboxes"
          body="If you expected a mailbox here, ask your organization administrator to check your access."
          action={<Link to="/settings/workspace" className={buttonClass('primary', 'md')}>Open workspace settings</Link>}
        />
      )}
      {snapshot.status === 'ready' && snapshot.mailboxes.length > 1 && <UnifiedList key={view} view={view} mailboxes={snapshot.mailboxes} />}
    </>
  )
}

interface ReadyState {
  status: 'ready'
  /** Rows in server order, deduplicated by id across pages. */
  items: ThreadSummary[]
  nextCursor: string | null
  loadingMore: boolean
  pageError: string | null
}
type ListState = { status: 'loading' } | ReadyState | { status: 'error'; message: string }

const TOOL = 'size-8'

function UnifiedList({ view, mailboxes }: { view: InboxView; mailboxes: readonly Mailbox[] }) {
  const gateway = useGateway()
  const navigate = useNavigate()
  const { scope, context, handleError } = useSession()
  const writes = useMailboxThreadWrites()
  const [state, setState] = useState<ListState>({ status: 'loading' })
  // One traversal budget per fresh load (initial, Refresh, Try again); continuations share it (D4).
  const budgetRef = useRef(newTraversalBudget())
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const nameOf = (mailboxId: string): string => mailboxes.find((m) => m.id === mailboxId)?.display_name ?? 'Mailbox'

  const load = useCallback(
    (cursor: string | undefined, append: boolean) => {
      if (!context) return
      const generation = scope.current()
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const isCurrent = () => scope.isCurrent(generation) && !controller.signal.aborted
      if (!append) budgetRef.current = newTraversalBudget()
      if (append) setState((prev) => (prev.status === 'ready' ? { ...prev, loadingMore: true, pageError: null } : prev))
      else setState({ status: 'loading' })

      void readPage<OrganizationThreadPage>({
        read: (requestCursor) =>
          gateway.listOrganizationThreads(context, requestCursor === undefined ? { filter: view } : { filter: view, cursor: requestCursor }, controller.signal),
        cursor,
        budget: budgetRef.current,
        isCurrent,
      }).then((outcome) => {
        // A deferred response from a gateway that ignores abort must not apply to a newer view.
        if (outcome.kind === 'stale' || !isCurrent()) return
        if (outcome.kind === 'failed') {
          if (handleError(outcome.error, generation)) return
          if (append && !isApiError(outcome.error, 'cursor_invalid')) {
            setState((prev) => (prev.status === 'ready' ? { ...prev, loadingMore: false, pageError: 'More conversations could not be loaded. Check your connection and try again.' } : prev))
            return
          }
          setState({ status: 'error', message: outcome.error instanceof GatewayError ? outcome.error.message : 'Conversations could not be loaded.' })
          return
        }
        setState((prev) => {
          // A cursor reset replaces accumulated rows with the fresh first page; an append merges onto
          // the live rows (which already hold confirmed star/read/folder changes), deduplicated by id.
          const existing = append && !outcome.replace && prev.status === 'ready' ? prev.items : []
          const seen = new Set(existing.map((t) => t.id))
          const merged = [...existing, ...outcome.page.items.filter((t) => !seen.has(t.id))]
          return { status: 'ready', items: merged, nextCursor: outcome.page.next_cursor, loadingMore: false, pageError: null }
        })
      })
    },
    [context, gateway, handleError, scope, view],
  )

  useEffect(() => {
    load(undefined, false)
    return () => abortRef.current?.abort()
  }, [load])
  useLayoutEffect(() => () => abortRef.current?.abort(), [])

  const ready = state.status === 'ready'
  const visible: ThreadSummary[] = ready ? state.items : []

  /**
   * Apply a confirmed change; the row leaves once it no longer matches the view (Gmail). When the
   * leaving row holds keyboard focus, a neighbour takes it first so j/k keep working from the list.
   */
  const reconcile = (thread: ThreadSummary, patch: Partial<FolderFacts>) => {
    if (!matchesView({ ...thread, ...patch }, view)) moveFocusAwayFrom(thread.id)
    setState((prev) => {
      if (prev.status !== 'ready') return prev
      return { ...prev, items: prev.items.flatMap((t) => (t.id !== thread.id ? [t] : matchesView({ ...t, ...patch }, view) ? [{ ...t, ...patch }] : [])) }
    })
  }
  const moveFocusAwayFrom = (threadId: string) => {
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-thread]') ?? [])
    // Rows carry a bare data-thread marker; the id lives in the link target.
    const index = links.findIndex((link) => link === document.activeElement && (link.getAttribute('href') ?? '').includes(`/threads/${threadId}`))
    if (index < 0) return
    const next = links[index + 1] ?? links[index - 1]
    if (next) next.focus()
    else listRef.current?.focus()
  }

  const begin = () => writes.clearError()
  const setRead = async (thread: ThreadSummary, read: boolean) => {
    const outcome = await writes.setRead(thread.mailbox_id, thread.id, read)
    if (outcome.kind === 'ok') reconcile(thread, { unread: !outcome.value.read })
  }
  const move = async (thread: ThreadSummary, action: RowAction) => {
    const outcome = action.move.kind === 'unsnooze' ? await writes.setSnooze(thread.mailbox_id, thread.id, null) : await writes.setFolder(thread.mailbox_id, thread.id, action.move.folder)
    if (outcome.kind === 'ok') reconcile(thread, { folder: outcome.value.folder, snoozed_until: outcome.value.snoozed_until })
  }
  const snooze = async (thread: ThreadSummary, snoozedUntil: string | null) => {
    const outcome = await writes.setSnooze(thread.mailbox_id, thread.id, snoozedUntil)
    if (outcome.kind === 'ok') reconcile(thread, { folder: outcome.value.folder, snoozed_until: outcome.value.snoozed_until })
  }
  const star = async (thread: ThreadSummary) => {
    const outcome = await writes.setStar(thread.mailbox_id, thread.id, !thread.starred)
    if (outcome.kind === 'ok') reconcile(thread, { starred: outcome.value.starred })
  }

  const actions = folderActionsFor(view)
  const snoozable = canSnoozeIn(view)
  const canWrite = writes.canWrite

  // Same roving keys as the mailbox list (j/k, o, s, Shift+U, e/!/#); selection keys are absent
  // because this view has no bulk toolbar.
  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
    const links = listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-thread]')
    if (!links || links.length === 0) return
    const all = Array.from(links)
    const current = all.indexOf(document.activeElement as HTMLAnchorElement)
    const focusedThread = current >= 0 ? visible[current] : undefined
    const shortcut = actions.find((action) => action.shortcut === event.key)
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
      case 's':
        if (focusedThread && canWrite) {
          begin()
          void star(focusedThread)
        }
        break
      case 'U':
        if (focusedThread && canWrite && !focusedThread.unread) {
          begin()
          void setRead(focusedThread, false)
        }
        break
      default:
        if (!shortcut || !focusedThread || !canWrite) return
        ;(all[current + 1] ?? all[current - 1])?.focus()
        begin()
        void move(focusedThread, shortcut)
    }
    event.preventDefault()
  }

  // Continuation depends on next_cursor, never on the row count (D4, FE-R09).
  const more = ready && state.nextCursor !== null
  const rangeLabel = ready ? `1–${visible.length}${more ? '+' : ''} of ${visible.length}${more ? '+' : ''}` : ''

  return (
    <section aria-label="Conversations" className="flex min-h-0 flex-1 flex-col">
      <h2 className="sr-only">Conversations across your mailboxes</h2>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex min-h-12 flex-wrap items-center gap-x-1 gap-y-1 border-b border-zinc-200 px-2 py-1 dark:border-zinc-700">
          <IconButton label="Refresh" onClick={() => load(undefined, false)} disabled={state.status === 'loading'} className={cx(TOOL, 'ms-1')}><ArrowPathIcon className="size-5" /></IconButton>
          <p className="ms-2 text-sm text-zinc-500">
            Across <span className="font-medium text-zinc-800 dark:text-white">{mailboxes.length}</span> mailboxes
          </p>
          <div className="flex-1" />
          <Select aria-label="Folder" value={view} onChange={(event) => navigate(unifiedPath(parseView(event.target.value)))} className="md:hidden">
            {VIEW_ORDER.map((value) => (
              <option key={value} value={value}>{VIEW_LABELS[value]}</option>
            ))}
          </Select>
          <nav aria-label="Filter" className="flex items-center gap-1 max-md:hidden">
            {VIEW_ORDER.map((value) => (
              <Link
                key={value}
                to={unifiedPath(value)}
                aria-current={view === value ? 'page' : undefined}
                className={cx(
                  'inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm font-medium',
                  view === value ? 'border-b-2 border-(--color-accent) text-zinc-800 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-white',
                )}
              >
                {value === 'starred' && <StarIcon className="size-4" aria-hidden />}
                {value === 'all' ? 'All' : VIEW_LABELS[value]}
              </Link>
            ))}
          </nav>
          {ready && visible.length > 0 && <span className="ms-2 text-sm tabular-nums text-zinc-500">{rangeLabel}</span>}
        </div>

        {writes.error !== null && (
          <div className="p-3">
            <Callout variant="danger" role="alert" actions={<Button size="sm" onClick={writes.clearError}>Dismiss</Button>}>{writes.error}</Callout>
          </div>
        )}
        {state.status === 'loading' && <div role="status" aria-label="Loading conversations"><MessageRowSkeleton /></div>}
        {state.status === 'error' && (
          <div role="alert" className="p-3">
            <Callout variant="danger" heading="Conversations could not be loaded" actions={<Button variant="primary" onClick={() => load(undefined, false)}>Try again</Button>}>{state.message}</Callout>
          </div>
        )}
        {ready && visible.length === 0 && !more && <EmptyState icon={<InboxIcon className="size-5" />} title={EMPTY_COPY[view].title} body={EMPTY_COPY[view].body} className="m-6" />}
        {ready && visible.length === 0 && more && <EmptyState icon={<InboxIcon className="size-5" />} title="Nothing on this page" body="This page was empty, but more conversations may be available below." className="m-6" />}
        {ready && visible.length > 0 && (
          <ul ref={listRef} onKeyDown={onListKeyDown} aria-label="Conversation list" tabIndex={-1}>
            {visible.map((thread) => (
              <MessageRow
                key={thread.id}
                thread={thread}
                to={`/mailboxes/${thread.mailbox_id}/threads/${thread.id}${view === 'all' ? '' : `?filter=${view}`}`}
                mailboxName={nameOf(thread.mailbox_id)}
                selected={false}
                onStar={canWrite ? () => { begin(); void star(thread) } : undefined}
                onToggleRead={canWrite ? () => { begin(); void setRead(thread, thread.unread) } : undefined}
                actions={actions}
                onAction={canWrite ? (action) => { begin(); void move(thread, action) } : undefined}
                onSnooze={canWrite && snoozable ? (at) => { begin(); void snooze(thread, at) } : undefined}
                busy={writes.busy.has(thread.id)}
              />
            ))}
          </ul>
        )}
        {more && (
          <div className="flex flex-wrap justify-center gap-2 border-t border-zinc-200 p-3 dark:border-zinc-700">
            {state.pageError !== null && <p role="alert" className="w-full text-center text-sm text-red-500">{state.pageError}</p>}
            <Button size="sm" disabled={state.loadingMore} onClick={() => load(state.nextCursor ?? undefined, true)}>
              {state.loadingMore ? 'Loading…' : 'Show more conversations'}
            </Button>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-zinc-400 max-md:hidden">
        Keyboard: <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>o</kbd> open · <kbd>s</kbd> star · <kbd>e</kbd> archive · <kbd>#</kbd> delete · <kbd>!</kbd> spam · <kbd>Shift</kbd>+<kbd>U</kbd> unread · <kbd>/</kbd> search
      </p>
    </section>
  )
}
