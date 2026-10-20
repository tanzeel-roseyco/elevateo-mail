// Immutable plaintext internal notes (BE-02 D §7). Rendering is React text in a wrapping <pre>:
// no HTML, Markdown, autolinks or remote resources. A new note is created under a caller id that
// is kept for an exact retry when the outcome is uncertain; changing the text after that is a
// deliberate new note (fresh id), and the earlier attempt may or may not exist until reloaded.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { describeFailure, type CollaborationFailure } from '@/app/collaborationFailure'
import { useProtectedRequest } from '@/app/protectedRequest'
import { useGateway, useSession } from '@/app/session'
import type { ThreadNote, ThreadNotePage } from '@/data/contract'
import { isApiError } from '@/data/errors'
import { codePoints, newId } from '@/lib/ids'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/ui/Button'
import { Field, TextArea } from '@/ui/Field'

const NOTE_MAX_CODE_POINTS = 4096
/** Bounded list traversal: at most this many pages per load (50 notes each). */
const MAX_NOTE_PAGES = 10

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; notes: ThreadNote[]; more: boolean }
  | { status: 'unavailable' }
  | { status: 'error'; failure: CollaborationFailure }

/** One note attempt frozen for exact retry. */
interface NoteAttempt {
  noteId: string
  body: string
}

type ComposeState =
  | { kind: 'idle' }
  | { kind: 'sending'; attempt: NoteAttempt }
  | { kind: 'uncertain'; attempt: NoteAttempt; failure: CollaborationFailure }
  | { kind: 'failed'; failure: CollaborationFailure }

export function NotesPanel({ threadId, mailboxId }: { threadId: string; mailboxId: string }) {
  const gateway = useGateway()
  const { state: sessionState } = useSession()
  const actorId = sessionState.status === 'ready' ? sessionState.session.actor.id : null
  const { proof, request } = useProtectedRequest()
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [body, setBody] = useState('')
  const [compose, setCompose] = useState<ComposeState>({ kind: 'idle' })
  // The next note's id exists before the first send so a retry can reuse it unchanged.
  const noteIdRef = useRef(newId())
  const ids = { body: useId() }

  const load = useCallback(async () => {
    setList({ status: 'loading' })
    let notes: ThreadNote[] = []
    const seen = new Set<string>()
    let cursor: string | undefined
    let pages = 0
    // One cursor reset per traversal (D4): a continuation cursor the server no longer accepts
    // restarts from page one once; a second failure is reported for manual retry.
    let resetUsed = false
    do {
      const requestCursor = cursor
      const outcome = await request((ctx, signal) => gateway.listThreadNotes(ctx, threadId, mailboxId, requestCursor === undefined ? {} : { cursor: requestCursor }, signal))
      if (outcome.kind === 'stale') return
      if (outcome.kind === 'failed') {
        if (isApiError(outcome.error, 'cursor_invalid') && requestCursor !== undefined && !resetUsed) {
          resetUsed = true
          notes = []
          seen.clear()
          cursor = undefined
          continue
        }
        const failure = describeFailure(outcome.error, 'read')
        setList(failure.code === 'unavailable_resource' ? { status: 'unavailable' } : { status: 'error', failure })
        return
      }
      const page: ThreadNotePage = outcome.value
      for (const note of page.items) {
        if (!seen.has(note.id)) {
          seen.add(note.id)
          notes.push(note)
        }
      }
      cursor = page.next_cursor ?? undefined
      pages += 1
    } while (cursor !== undefined && pages < MAX_NOTE_PAGES)
    setList({ status: 'ready', notes, more: cursor !== undefined })
  }, [gateway, request, threadId, mailboxId])

  useEffect(() => {
    void load()
  }, [load])

  const send = async (attempt: NoteAttempt) => {
    if (!proof) return
    setCompose({ kind: 'sending', attempt })
    const outcome = await request((ctx, signal) => gateway.createThreadNote(ctx, proof, threadId, { mailbox_id: mailboxId, note_id: attempt.noteId, body_text: attempt.body }, signal))
    if (outcome.kind === 'stale') {
      // Ownership moved on (context invalidated) with the note possibly stored: keep the attempt.
      setCompose({ kind: 'uncertain', attempt, failure: describeFailure(undefined, 'write') })
      return
    }
    if (outcome.kind === 'failed') {
      const failure = describeFailure(outcome.error, 'write')
      setCompose(failure.uncertain ? { kind: 'uncertain', attempt, failure } : { kind: 'failed', failure })
      return
    }
    const note = outcome.value.response.note
    setList((prev) => (prev.status === 'ready' && !prev.notes.some((n) => n.id === note.id) ? { ...prev, notes: [...prev.notes, note] } : prev))
    setBody('')
    noteIdRef.current = newId()
    setCompose({ kind: 'idle' })
  }

  const submit = () => {
    const bodyLength = codePoints(body)
    if (bodyLength === 0 || bodyLength > NOTE_MAX_CODE_POINTS) return
    void send({ noteId: noteIdRef.current, body })
  }

  const discardAttempt = () => {
    // Deliberate new intent: the earlier id stays unknown until the list is reloaded.
    noteIdRef.current = newId()
    setCompose({ kind: 'idle' })
  }

  const length = codePoints(body)
  const tooLong = length > NOTE_MAX_CODE_POINTS
  const sending = compose.kind === 'sending'
  const frozen = compose.kind === 'uncertain'

  return (
    <section aria-labelledby={`${ids.body}-heading`} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-700 dark:bg-zinc-800">
      <h2 id={`${ids.body}-heading`} className="mb-2 text-sm font-medium text-zinc-800 dark:text-white">Internal notes</h2>
      <p className="mb-2 text-xs text-zinc-500">Plain text only, visible to people who can read this mailbox. Notes cannot be edited or deleted.</p>
      {list.status === 'loading' && <p role="status" className="text-sm text-zinc-500">Loading notes…</p>}
      {list.status === 'unavailable' && <p className="text-sm text-zinc-500">Notes are unavailable for this conversation.</p>}
      {list.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-500">
          <span>{list.failure.message}</span>
          <Button size="sm" onClick={() => void load()}>Try again</Button>
        </div>
      )}
      {list.status === 'ready' && (
        <>
          {list.notes.length === 0 && <p className="text-sm text-zinc-500">No notes yet.</p>}
          <ol className="flex flex-col gap-2">
            {list.notes.map((note) => (
              <li key={note.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                <p className="mb-1 text-xs text-zinc-500">
                  {note.author_id === actorId ? 'You' : `User ${note.author_id}`} · {formatDateTime(note.created_at)}
                </p>
                {/* Escaped plaintext only; nothing is parsed or fetched. */}
                <pre className="whitespace-pre-wrap break-words font-sans text-sm">{note.body_text}</pre>
              </li>
            ))}
          </ol>
          {list.more && <p className="mt-1 text-xs text-zinc-500">More notes exist than are shown here.</p>}
        </>
      )}
      {proof && list.status !== 'unavailable' && (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          aria-busy={sending}
          noValidate
        >
          <Field id={ids.body} label="Add a note" hint={`${length} / ${NOTE_MAX_CODE_POINTS} characters`} error={tooLong ? `A note is at most ${NOTE_MAX_CODE_POINTS} characters.` : null}>
            <TextArea
              id={ids.body}
              value={frozen ? compose.attempt.body : body}
              onChange={(e) => setBody(e.target.value)}
              disabled={sending || frozen}
              readOnly={frozen}
              aria-invalid={tooLong ? true : undefined}
              aria-describedby={`${ids.body}-hint`}
              rows={3}
            />
          </Field>
          {compose.kind === 'failed' && <p role="alert" className="text-xs text-red-500">{compose.failure.message}</p>}
          {compose.kind === 'uncertain' && (
            <div role="alert" className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs">
              <span>{compose.failure.message} Retrying the same note is safe: an identical retry is recognized and not duplicated.</span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => void send(compose.attempt)}>Retry the same note</Button>
                <Button size="sm" onClick={() => void load()}>Reload notes</Button>
                <Button size="sm" variant="ghost" onClick={discardAttempt}>Write a different note</Button>
              </div>
            </div>
          )}
          {!frozen && (
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" variant="primary" disabled={sending || length === 0 || tooLong}>
                {sending ? 'Adding…' : 'Add note'}
              </Button>
            </div>
          )}
        </form>
      )}
    </section>
  )
}
