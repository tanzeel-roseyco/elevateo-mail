// Explicit read/unread toggle (BE-02 D §6): PUT the desired boolean for this actor only. Reads
// never mark mail read; only this control does, and it reports the server's answer, never an
// optimistic flip. Repeating the same desired state is a server no-op, so retry is always safe.
import { useState } from 'react'
import { describeFailure, type CollaborationFailure } from '@/app/collaborationFailure'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useGateway } from '@/app/session'
import { Button } from '@/ui/Button'

interface Props {
  threadId: string
  mailboxId: string
  unread: boolean
  /** The server-confirmed read value after a successful write. */
  onConfirmed(read: boolean): void
}

export function ReadStateControl({ threadId, mailboxId, unread, onConfirmed }: Props) {
  const gateway = useGateway()
  const { proof, request } = useProtectedRequest()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<CollaborationFailure | null>(null)

  const toggle = async () => {
    if (!proof || busy) return
    const desired = unread // currently unread → mark read
    setBusy(true)
    setFailure(null)
    const outcome = await request((ctx, signal) => gateway.setThreadReadState(ctx, proof, threadId, { mailbox_id: mailboxId, read: desired }, signal))
    if (outcome.kind === 'stale') return
    setBusy(false)
    if (outcome.kind === 'failed') {
      setFailure(describeFailure(outcome.error, 'write'))
      return
    }
    onConfirmed(outcome.value.read)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => void toggle()} disabled={busy || !proof} aria-busy={busy}>
        {busy ? 'Saving…' : unread ? 'Mark as read' : 'Mark as unread'}
      </Button>
      {failure && (
        <p role="alert" className="text-[12px] text-danger">
          {failure.message}
          {failure.uncertain && ' Reload the conversation to see the current state, or try again (repeating the same choice is safe).'}
        </p>
      )}
    </div>
  )
}
