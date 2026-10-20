import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useSession } from '@/app/session'
import { useFeatureGateways } from '@/app/featureGateways'
import { describeFailure } from '@/app/collaborationFailure'
import type { MailboxAssigneeOptionPage } from '@/data/v2Contract'
import { Button } from '@/ui/Button'

const PAGE_LIMIT = 50

type DirectoryState =
  | { kind: 'closed' }
  | { kind: 'loading'; items: string[]; cursor: string | null }
  | { kind: 'ready'; items: string[]; cursor: string | null }
  | { kind: 'error'; items: string[]; cursor: string | null; message: string }

interface Props {
  mailboxId: string
  actorId: string | null
  currentAssigneeId: string | null
  disabled: boolean
  onAssign(userId: string): void
}

/** A deliberately opt-in, mailbox-scoped directory. The assignment mutation still checks its revision. */
export function AssigneePicker({ mailboxId, actorId, currentAssigneeId, disabled, onAssign }: Props) {
  const id = useId()
  const { state: sessionState } = useSession()
  const { request } = useProtectedRequest()
  const { assigneeOptions } = useFeatureGateways()
  const portAvailable = assigneeOptions !== undefined
  const [directory, setDirectory] = useState<DirectoryState>({ kind: 'closed' })
  const epoch = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const sessionKey = sessionState.status === 'ready'
    ? [sessionState.session.actor.id, sessionState.session.organization.id,
      sessionState.session.context_id, sessionState.session.authorization_version].join('\n')
    : null

  useLayoutEffect(() => {
    // A mailbox or session replacement must invalidate even a transport that ignores abort.
    epoch.current += 1
    controller.current?.abort()
    controller.current = null
    setDirectory({ kind: 'closed' })
    return () => {
      epoch.current += 1
      controller.current?.abort()
      controller.current = null
    }
  }, [mailboxId, sessionKey, portAvailable])

  const load = useCallback(async (cursor: string | null, previous: string[]) => {
    if (!assigneeOptions) return
    controller.current?.abort()
    const local = new AbortController()
    controller.current = local
    const generation = ++epoch.current
    setDirectory({ kind: 'loading', items: previous, cursor })
    const outcome = await request(async (ctx, protectedSignal): Promise<MailboxAssigneeOptionPage> => {
      const abortLocal = () => local.abort()
      if (protectedSignal.aborted) abortLocal()
      protectedSignal.addEventListener('abort', abortLocal, { once: true })
      try {
        return await assigneeOptions.listMailboxAssigneeOptions(ctx, mailboxId,
          cursor === null ? { limit: PAGE_LIMIT } : { cursor, limit: PAGE_LIMIT }, local.signal)
      } finally {
        protectedSignal.removeEventListener('abort', abortLocal)
      }
    })
    if (local.signal.aborted || epoch.current !== generation) return
    controller.current = null
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed') {
      const failure = describeFailure(outcome.error, 'read')
      setDirectory({ kind: 'error', items: previous, cursor,
        message: failure.code === 'unavailable_resource' ? 'Assignee options are unavailable.' : failure.message })
      return
    }
    // The adapter validates these fields too; retain this check at the component seam.
    if (sessionKey === null || sessionState.status !== 'ready' ||
      outcome.value.context_id !== sessionState.session.context_id ||
      outcome.value.authorization_version !== sessionState.session.authorization_version ||
      outcome.value.mailbox_id !== mailboxId) {
      setDirectory({ kind: 'error', items: previous, cursor, message: 'Assignee options changed scope. Try again.' })
      return
    }
    if (cursor !== null && outcome.value.next_cursor === cursor) {
      setDirectory({ kind: 'error', items: previous, cursor: null, message: 'Assignee choices could not advance.' })
      return
    }
    const seen = new Set(previous)
    const items = [...previous]
    for (const option of outcome.value.items) {
      if (!seen.has(option.user_id)) {
        seen.add(option.user_id)
        items.push(option.user_id)
      }
    }
    setDirectory({ kind: 'ready', items, cursor: outcome.value.next_cursor })
  }, [assigneeOptions, mailboxId, request, sessionKey, sessionState])

  const open = () => void load(null, [])
  const close = () => {
    epoch.current += 1
    controller.current?.abort()
    controller.current = null
    setDirectory({ kind: 'closed' })
  }

  return (
    <div className="flex flex-col gap-2">
      {!portAvailable ? (
        <p className="text-xs text-zinc-500">Assignee choices are unavailable.</p>
      ) : directory.kind === 'closed' ? (
        <Button size="sm" disabled={disabled || sessionKey === null} onClick={open}>Choose assignee</Button>
      ) : (
        <div className="rounded-lg border border-zinc-200 p-2" aria-labelledby={`${id}-label`}>
          <div className="flex items-center justify-between gap-2">
            <h3 id={`${id}-label`} className="text-sm font-medium">Eligible mailbox users</h3>
            <Button size="sm" onClick={close}>Close assignee choices</Button>
          </div>
          <p className="text-xs text-zinc-500">Verified user IDs only. The server checks assignment permission when you save.</p>
          {currentAssigneeId !== null && !directory.items.includes(currentAssigneeId) && (
            <p className="text-xs text-zinc-500">Current assignee: {currentAssigneeId}</p>
          )}
          {directory.items.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {directory.items.map((userId) => (
                <li key={userId}>
                  <Button size="sm" disabled={disabled || userId === currentAssigneeId}
                    aria-label={`Assign to ${userId === actorId ? 'you' : `user ${userId}`}`}
                    onClick={() => onAssign(userId)}>
                    {userId === actorId ? 'You' : `User ${userId}`}
                    {userId === currentAssigneeId ? ' (current)' : ''}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {directory.kind === 'loading' && <p role="status" className="text-xs text-zinc-500">Loading assignee choices…</p>}
          {directory.kind === 'ready' && directory.items.length === 0 && <p className="text-xs text-zinc-500">No eligible users were returned.</p>}
          {directory.kind === 'error' && (
            <div role="alert" className="flex items-center gap-2 text-xs text-red-500">
              <span>{directory.message}</span>
              <Button size="sm" onClick={() => void load(directory.cursor, directory.items)}>Try assignee choices again</Button>
            </div>
          )}
          {directory.kind === 'ready' && directory.cursor !== null && (
            <Button size="sm" onClick={() => void load(directory.cursor, directory.items)}>Load more users</Button>
          )}
        </div>
      )}
    </div>
  )
}
