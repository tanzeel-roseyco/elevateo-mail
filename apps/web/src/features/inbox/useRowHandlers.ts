// Stable per-action handlers for memoised MessageRow lists (InboxPage, UnifiedInboxPage).
//
// AIDEV-NOTE: Each handler keeps one identity for the life of the list and resolves the thread by
// id through a ref that tracks the latest rows and write helpers, so a click always acts on the
// current thread object (confirmed star/read/folder state) and a row that already left the view
// is a no-op rather than a write against stale data.
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import type { ThreadSummary } from '@/data/contract'
import type { RowAction } from './rowActions'

export interface RowOps {
  readonly visible: readonly ThreadSummary[]
  /** Clears the last write failure before a new user action. */
  begin(): void
  star(thread: ThreadSummary): Promise<unknown>
  setRead(thread: ThreadSummary, read: boolean): Promise<unknown>
  move(thread: ThreadSummary, action: RowAction): Promise<unknown>
  snooze(thread: ThreadSummary, snoozedUntil: string | null): Promise<unknown>
}

export interface RowHandlers {
  onStar(threadId: string): void
  onToggleRead(threadId: string): void
  onAction(threadId: string, action: RowAction): void
  onSnooze(threadId: string, snoozedUntil: string | null): void
}

export function useRowHandlers(ops: RowOps): RowHandlers {
  const latest = useRef(ops)
  useLayoutEffect(() => {
    latest.current = ops
  })
  const run = useCallback((threadId: string, work: (current: RowOps, thread: ThreadSummary) => Promise<unknown>) => {
    const current = latest.current
    const thread = current.visible.find((t) => t.id === threadId)
    if (thread === undefined) return
    current.begin()
    void work(current, thread)
  }, [])
  return useMemo<RowHandlers>(
    () => ({
      onStar: (threadId) => run(threadId, (current, thread) => current.star(thread)),
      onToggleRead: (threadId) => run(threadId, (current, thread) => current.setRead(thread, thread.unread)),
      onAction: (threadId, action) => run(threadId, (current, thread) => current.move(thread, action)),
      onSnooze: (threadId, snoozedUntil) => run(threadId, (current, thread) => current.snooze(thread, snoozedUntil)),
    }),
    [run],
  )
}
