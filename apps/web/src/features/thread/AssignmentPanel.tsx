// Versioned thread assignment (BE-02 D §6). The panel shows the server's current assignee and
// revision, and every change carries the revision it was decided against; a stale revision is a
// 409 even when the desired value matches, and the person then reloads before choosing again.
// V2 mailbox options may add eligible UUID targets; the V1 assignment write remains authoritative.
import { useCallback, useEffect, useId, useState } from 'react'
import { describeFailure, type CollaborationFailure } from '@/app/collaborationFailure'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useGateway, useSession } from '@/app/session'
import type { ThreadAssignment } from '@/data/contract'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/ui/Button'
import { AssigneePicker } from './AssigneePicker'

type PanelState =
  | { status: 'loading' }
  | { status: 'ready'; assignment: ThreadAssignment }
  | { status: 'unavailable' }
  | { status: 'error'; failure: CollaborationFailure }

export function AssignmentPanel({ threadId, mailboxId }: { threadId: string; mailboxId: string }) {
  const gateway = useGateway()
  const { state: sessionState } = useSession()
  const actorId = sessionState.status === 'ready' ? sessionState.session.actor.id : null
  const { proof, request } = useProtectedRequest()
  const [state, setState] = useState<PanelState>({ status: 'loading' })
  const [writing, setWriting] = useState(false)
  const [writeFailure, setWriteFailure] = useState<CollaborationFailure | null>(null)
  const ids = { target: useId() }

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    setWriteFailure(null)
    const outcome = await request((ctx, signal) => gateway.getThreadAssignment(ctx, threadId, mailboxId, signal))
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'failed') {
      const failure = describeFailure(outcome.error, 'read')
      setState(failure.code === 'unavailable_resource' ? { status: 'unavailable' } : { status: 'error', failure })
      return
    }
    setState({ status: 'ready', assignment: outcome.value })
  }, [gateway, request, threadId, mailboxId])

  useEffect(() => {
    void load()
  }, [load])

  const assign = async (assigneeId: string | null) => {
    if (state.status !== 'ready' || !proof || writing) return
    const expected = state.assignment.assignment_version
    setWriting(true)
    setWriteFailure(null)
    const outcome = await request((ctx, signal) =>
      gateway.setThreadAssignment(ctx, proof, threadId, { mailbox_id: mailboxId, assignee_id: assigneeId, expected_assignment_version: expected }, signal),
    )
    if (outcome.kind === 'stale') return
    setWriting(false)
    if (outcome.kind === 'failed') {
      setWriteFailure(describeFailure(outcome.error, 'write'))
      return
    }
    setState({ status: 'ready', assignment: outcome.value })
  }

  const describeAssignee = (assignment: ThreadAssignment): string => {
    if (assignment.assignee_id === null) return 'Unassigned'
    if (assignment.assignee_id === actorId) return 'Assigned to you'
    return `Assigned to user ${assignment.assignee_id}`
  }

  return (
    <section aria-labelledby={`${ids.target}-heading`} className="rounded-lg border border-line bg-surface p-3">
      <h2 id={`${ids.target}-heading`} className="eyebrow mb-2">Assignment</h2>
      {state.status === 'loading' && <p role="status" className="text-[13px] text-muted">Loading assignment…</p>}
      {state.status === 'unavailable' && <p className="text-[13px] text-muted">Assignment is unavailable for this conversation.</p>}
      {state.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
          <span>{state.failure.message}</span>
          <Button size="sm" onClick={() => void load()}>Try again</Button>
        </div>
      )}
      {state.status === 'ready' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            <span className="font-medium">{describeAssignee(state.assignment)}</span>
            <span className="text-[12px] text-muted">
              {' '}· revision {state.assignment.assignment_version}
              {state.assignment.updated_at !== null && ` · ${formatDateTime(state.assignment.updated_at)}`}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {actorId !== null && state.assignment.assignee_id !== actorId && (
              <Button size="sm" variant="primary" disabled={writing || !proof} onClick={() => void assign(actorId)}>Assign to me</Button>
            )}
            {state.assignment.assignee_id !== null && (
              <Button size="sm" disabled={writing || !proof} onClick={() => void assign(null)}>Clear assignment</Button>
            )}
          </div>
          <AssigneePicker key={mailboxId} mailboxId={mailboxId} actorId={actorId}
            currentAssigneeId={state.assignment.assignee_id} disabled={writing || !proof}
            onAssign={(id) => void assign(id)} />
          {writing && <p role="status" className="text-[12px] text-muted">Saving assignment…</p>}
          {writeFailure && (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-[12px] text-danger">
              <span>{writeFailure.message}</span>
              {(writeFailure.code === 'stale_version' || writeFailure.uncertain) && (
                <Button size="sm" onClick={() => void load()}>Reload assignment</Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
