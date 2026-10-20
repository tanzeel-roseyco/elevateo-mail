// One place for the four per-thread writes (read state, folder, snooze, star) so the list, the row
// hover actions and the reader share busy tracking, error wording and the stale-session rule: the
// UI only ever applies what the server confirmed, never an optimistic flip.
//
// AIDEV-NOTE: `busy` is per thread, not per action: two writes to the same thread never overlap,
// which keeps the confirmed state ordered without version preconditions (the contract has none).
// The reservation lives in a ref (synchronous) and is mirrored into state for rendering, because a
// second click before React commits would otherwise see the thread as idle.
import { useCallback, useRef, useState } from 'react'
import type { ThreadFolder, ThreadFolderState, ThreadReadState, ThreadStarState } from '@/data/contract'
import { describeFailure } from '@/app/collaborationFailure'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useGateway } from '@/app/session'

export type MutationOutcome<T> = { kind: 'ok'; value: T } | { kind: 'failed' } | { kind: 'stale' } | { kind: 'skipped' }

export interface ThreadMutations {
  /** False without a session proof: controls that write must render disabled. */
  readonly canWrite: boolean
  readonly busy: ReadonlySet<string>
  /** Last write failure, worded for people; cleared by `clearError` (callers do so per user action). */
  readonly error: string | null
  clearError(): void
  setRead(threadId: string, read: boolean): Promise<MutationOutcome<ThreadReadState>>
  setFolder(threadId: string, folder: ThreadFolder): Promise<MutationOutcome<ThreadFolderState>>
  setSnooze(threadId: string, snoozedUntil: string | null): Promise<MutationOutcome<ThreadFolderState>>
  setStar(threadId: string, starred: boolean): Promise<MutationOutcome<ThreadStarState>>
}

export function useThreadMutations(mailboxId: string): ThreadMutations {
  const gateway = useGateway()
  const { proof, request } = useProtectedRequest()
  const reserved = useRef(new Set<string>())
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async <T>(threadId: string, work: Parameters<typeof request<T>>[0]): Promise<MutationOutcome<T>> => {
      if (!proof || reserved.current.has(threadId)) return { kind: 'skipped' }
      reserved.current.add(threadId)
      setBusy(new Set(reserved.current))
      try {
        const outcome = await request(work)
        if (outcome.kind === 'stale') return { kind: 'stale' }
        if (outcome.kind === 'failed') {
          const failure = describeFailure(outcome.error, 'write')
          setError(`${failure.message}${failure.uncertain ? ' Refresh to see the current state; repeating the same choice is safe.' : ''}`)
          return { kind: 'failed' }
        }
        return { kind: 'ok', value: outcome.value }
      } finally {
        // Released on every outcome, including stale: the same mounted page may regain a proof after
        // session recovery and must be able to write to this thread again.
        reserved.current.delete(threadId)
        setBusy(new Set(reserved.current))
      }
    },
    [proof, request],
  )

  return {
    canWrite: proof !== null,
    busy,
    error,
    clearError: () => setError(null),
    setRead: (threadId, read) => run(threadId, (ctx, signal) => gateway.setThreadReadState(ctx, proof!, threadId, { mailbox_id: mailboxId, read }, signal)),
    setFolder: (threadId, folder) => run(threadId, (ctx, signal) => gateway.setThreadFolder(ctx, proof!, threadId, { mailbox_id: mailboxId, folder }, signal)),
    setSnooze: (threadId, snoozedUntil) => run(threadId, (ctx, signal) => gateway.setThreadSnooze(ctx, proof!, threadId, { mailbox_id: mailboxId, snoozed_until: snoozedUntil }, signal)),
    setStar: (threadId, starred) => run(threadId, (ctx, signal) => gateway.setThreadStar(ctx, proof!, threadId, { mailbox_id: mailboxId, starred }, signal)),
  }
}
