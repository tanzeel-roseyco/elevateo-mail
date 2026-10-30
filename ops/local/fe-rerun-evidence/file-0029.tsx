// BE-02 D inside the reader: the explicit read-state control reports the server's answer and
// never flips optimistically; assignment carries the revision it was decided against and a stale
// revision reloads before choosing again; notes are inert plaintext whose uncertain attempt is
// retried under the SAME note id; the reply-as-draft entry mints one stable draft id per visit.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SessionProvider } from '@/app/session'
import type { ThreadNoteInput } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { createCollaborationState, createFixtureGateway, type FixtureScript } from '@/data/fixtures/fixtureGateway'
import type { MailroomGateway } from '@/data/gateway'
import { ThreadPage } from './ThreadPage'

const api = (code: GatewayError['code'], status: number) => new GatewayError('api', code, 'synthetic', { status, requestId: 'r1' })
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const HOSTILE_NOTE = '<img src="https://example.invalid/pixel">\n[unsafe](javascript:alert(1))\nPlaintext note \u{1F4E8}'
/** A note is on screen only when its exact text sits in a <pre>; the textarea never counts. */
const noteShown = (text: string) => screen.findByText((_content, element) => element?.tagName === 'PRE' && element.textContent === text)

function harness(script: FixtureScript = {}) {
  const state = createCollaborationState()
  const base = createFixtureGateway(script, { state })
  const h = {
    state,
    notes: [] as ThreadNoteInput[],
    failNextNote: null as GatewayError | null,
    failNextReadState: null as GatewayError | null,
    gateway: base,
  }
  h.gateway = {
    ...base,
    setThreadReadState: async (ctx, proof, threadId, input, signal) => {
      const failure = h.failNextReadState
      if (failure) {
        h.failNextReadState = null
        throw failure
      }
      return base.setThreadReadState(ctx, proof, threadId, input, signal)
    },
    createThreadNote: async (ctx, proof, threadId, input, signal) => {
      h.notes.push(input)
      const failure = h.failNextNote
      if (failure) {
        h.failNextNote = null
        throw failure
      }
      return base.createThreadNote(ctx, proof, threadId, input, signal)
    },
  }
  return h
}

function renderReader(gateway: MailroomGateway) {
  return render(
    <SessionProvider gateway={gateway}>
      <MemoryRouter initialEntries={[`/mailboxes/${CD.mailboxId}/threads/${CD.threadId}`]}>
        <Routes>
          <Route path="/mailboxes/:mailboxId/threads/:threadId" element={<ThreadPage />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

async function readerReady() {
  await screen.findByRole('button', { name: /Mark as (read|unread)/ })
  await screen.findByText('Unassigned')
  await screen.findByText('No notes yet.')
}

describe('read state', () => {
  it('marks read only through the explicit control and reports the server answer', async () => {
    const h = harness()
    renderReader(h.gateway)
    await readerReady()
    expect(screen.getByText('Unread')).toBeTruthy()
    expect(h.state.readStateFor(CD.threadId).read).toBe(false)
    fireEvent.click(button('Mark as read'))
    expect(await screen.findByRole('button', { name: 'Mark as unread' })).toBeTruthy()
    expect(screen.queryByText('Unread')).toBeNull()
    expect(h.state.readStateFor(CD.threadId)).toMatchObject({ read: true, version: 1 })
    fireEvent.click(button('Mark as unread'))
    expect(await screen.findByRole('button', { name: 'Mark as read' })).toBeTruthy()
    expect(h.state.readStateFor(CD.threadId)).toMatchObject({ read: false, version: 2 })
  })

  it('an unconfirmed write does not flip the control and says the same choice is safe to repeat', async () => {
    const h = harness()
    h.failNextReadState = api('temporarily_unavailable', 503)
    renderReader(h.gateway)
    await readerReady()
    fireEvent.click(button('Mark as read'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('may or may not have been stored')
    expect(alert.textContent).toContain('repeating the same choice is safe')
    expect(button('Mark as read')).toBeTruthy()
    expect(h.state.readStateFor(CD.threadId).read).toBe(false)
    fireEvent.click(button('Mark as read'))
    expect(await screen.findByRole('button', { name: 'Mark as unread' })).toBeTruthy()
  })
})

describe('assignment', () => {
  it('assigns to me, clears, and assigns a typed member id, each advancing the revision', async () => {
    const h = harness()
    renderReader(h.gateway)
    await readerReady()
    expect(screen.getByText(/revision 0/)).toBeTruthy()
    fireEvent.click(button('Assign to me'))
    expect(await screen.findByText('Assigned to you')).toBeTruthy()
    expect(screen.getByText(/revision 1/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Assign to me' })).toBeNull()
    fireEvent.click(button('Clear assignment'))
    expect(await screen.findByText('Unassigned')).toBeTruthy()
    expect(screen.getByText(/revision 2/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Assign to user id'), { target: { value: 'nope' } })
    fireEvent.click(button('Assign'))
    expect(screen.getByText('Enter a user id in UUID form.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Assign to user id'), { target: { value: CD.readerId.toUpperCase() } })
    fireEvent.click(button('Assign'))
    expect(await screen.findByText(`Assigned to user ${CD.readerId}`)).toBeTruthy()
    expect(h.state.getAssignment(CD.threadId, CD.mailboxId)).toMatchObject({ assignee_id: CD.readerId, assignment_version: 3 })
    expect(screen.getByText('UUID of a current organization member. No user directory exists in this build.')).toBeTruthy()
  })

  it('a stale revision is refused and the reload shows what the server holds', async () => {
    const h = harness()
    renderReader(h.gateway)
    await readerReady()
    // Someone else assigned the conversation after this panel loaded revision 0.
    h.state.setAssignment(CD.threadId, CD.mailboxId, CD.readerId, 0)
    fireEvent.click(button('Assign to me'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('This changed elsewhere since you loaded it')
    expect(screen.getByText('Unassigned')).toBeTruthy()
    fireEvent.click(button('Reload assignment'))
    expect(await screen.findByText(`Assigned to user ${CD.readerId}`)).toBeTruthy()
    expect(screen.getByText(/revision 1/)).toBeTruthy()
    expect(h.state.getAssignment(CD.threadId, CD.mailboxId).assignee_id).toBe(CD.readerId)
  })

  it('an ineligible target is unavailable, not silently dropped', async () => {
    const h = harness()
    renderReader(h.gateway)
    await readerReady()
    fireEvent.change(screen.getByLabelText('Assign to user id'), { target: { value: '00000000-0000-4000-8000-000000000002' } })
    fireEvent.click(button('Assign'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('This item is unavailable to you now.')
    expect(screen.getByText('Unassigned')).toBeTruthy()
  })
})

describe('notes', () => {
  it('adds an immutable plaintext note rendered inertly and attributed to you', async () => {
    const h = harness()
    const { container } = renderReader(h.gateway)
    await readerReady()
    expect(button('Add note').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Add a note'), { target: { value: HOSTILE_NOTE } })
    fireEvent.click(button('Add note'))
    expect(await noteShown(HOSTILE_NOTE)).toBeTruthy()
    expect(container.querySelector('img, script, a[href^="javascript"]')).toBeNull()
    expect(screen.getByText(/^You ·/)).toBeTruthy()
    expect((screen.getByLabelText('Add a note') as HTMLTextAreaElement).value).toBe('')
    expect(h.state.listNotes(CD.threadId)).toHaveLength(1)
    expect(h.notes[0]).toMatchObject({ mailbox_id: CD.mailboxId, body_text: HOSTILE_NOTE })
  })

  // Uncertainty-to-success regression at the observable gateway boundary (review-fe02-dark-repair
  // defect 1): the e2e fixture script cannot fail once then succeed, so the same-id and
  // exactly-once guarantees are proven here, where every createThreadNote input is recorded.
  it('uncertainty then success: the retry resends the SAME note id and payload and exactly one note results', async () => {
    const h = harness()
    h.failNextNote = api('temporarily_unavailable', 503)
    const { container } = renderReader(h.gateway)
    await readerReady()
    fireEvent.change(screen.getByLabelText('Add a note'), { target: { value: 'first note' } })
    fireEvent.click(button('Add note'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('may or may not have been stored')
    expect(alert.textContent).toContain('identical retry is recognized')
    expect((screen.getByLabelText('Add a note') as HTMLTextAreaElement).readOnly).toBe(true)
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull()
    expect(h.state.listNotes(CD.threadId)).toHaveLength(0)

    fireEvent.click(button('Retry the same note'))
    await noteShown('first note')
    // The boundary saw two submissions whose note_id and whole payload are identical: a retry
    // under a changed id would fail the deep equality below.
    expect(h.notes).toHaveLength(2)
    expect(h.notes[1]).toEqual(h.notes[0])
    expect(h.notes[1]?.note_id).toBe(h.notes[0]?.note_id)
    // Exactly one note resulted, in the stateful fixture and on screen (message bodies also render
    // in <pre>, so count only the pres carrying this note's text).
    expect(h.state.listNotes(CD.threadId)).toHaveLength(1)
    expect([...container.querySelectorAll('pre')].filter((el) => el.textContent === 'first note')).toHaveLength(1)

    fireEvent.change(screen.getByLabelText('Add a note'), { target: { value: 'second note' } })
    fireEvent.click(button('Add note'))
    await noteShown('second note')
    expect(h.notes[2]?.note_id).not.toBe(h.notes[0]?.note_id)
    expect(h.state.listNotes(CD.threadId).map((n) => n.body_text)).toEqual(['first note', 'second note'])
  })

  it('"Write a different note" abandons the frozen attempt without pretending it failed or succeeded', async () => {
    const h = harness()
    h.failNextNote = api('internal_error', 500)
    renderReader(h.gateway)
    await readerReady()
    fireEvent.change(screen.getByLabelText('Add a note'), { target: { value: 'maybe stored' } })
    fireEvent.click(button('Add note'))
    await screen.findByRole('alert')
    fireEvent.click(button('Write a different note'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect((screen.getByLabelText('Add a note') as HTMLTextAreaElement).readOnly).toBe(false)
    fireEvent.change(screen.getByLabelText('Add a note'), { target: { value: 'another' } })
    fireEvent.click(button('Add note'))
    await noteShown('another')
    expect(h.notes[1]?.note_id).not.toBe(h.notes[0]?.note_id)
  })

  it('an over-long note is refused locally and an unavailable list hides the form', async () => {
    const h = harness()
    renderReader(h.gateway)
    await readerReady()
    fireEvent.change(screen.getByLabelText('Add a note'), { target: { value: '\u{1F4E8}'.repeat(4097) } })
    expect(screen.getByText('A note is at most 4096 characters.')).toBeTruthy()
    expect(button('Add note').disabled).toBe(true)
    expect(h.notes).toHaveLength(0)

    const unavailable = harness({ listThreadNotes: 'not_available' })
    renderReader(unavailable.gateway)
    expect(await screen.findByText('Notes are unavailable for this conversation.')).toBeTruthy()
    const section = screen.getByText('Notes are unavailable for this conversation.').closest('section')!
    expect(within(section).queryByLabelText('Add a note')).toBeNull()
  })
})

describe('reply as draft', () => {
  it('links to a new draft bound to this conversation with one stable id per visit', async () => {
    const h = harness()
    renderReader(h.gateway)
    await readerReady()
    const link = screen.getByRole('link', { name: 'Reply as draft' })
    const href = link.getAttribute('href') ?? ''
    expect(href).toMatch(new RegExp(`^/mailboxes/${CD.mailboxId}/drafts/[0-9a-f-]{36}\\?new=1&reply_to=${CD.threadId}$`))
    fireEvent.click(button('Mark as read'))
    await screen.findByRole('button', { name: 'Mark as unread' })
    expect(screen.getByRole('link', { name: 'Reply as draft' }).getAttribute('href')).toBe(href)
    expect(() => h.state.getDraft(href.split('/')[4]!.split('?')[0]!, CD.mailboxId)).toThrow('This item is unavailable.')
  })
})
