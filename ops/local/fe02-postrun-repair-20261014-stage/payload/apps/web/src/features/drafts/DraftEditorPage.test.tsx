// BE-02 C draft editor over the stateful fixture: explicit saves create and advance versions; a
// real stale-version conflict never overwrites and offers rebase/adopt after re-reading the server
// copy; an uncertain outcome keeps the text and retries the SAME operation id and payload; the
// ledger lookup resolves applied/unknown/expired without inventing certainty and refuses receipts
// bound elsewhere; a consumed draft, a 404 and a 409 context change lock, hide or restart the
// editor instead of pretending to work; and unsaved text, raw recipient input and unresolved
// attempts survive context recovery (batched and unmounting) for the same owner only.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { DraftIntentProvider } from '@/app/draftIntent'
import { SessionProvider, useSession, type SessionController } from '@/app/session'
import { Shell } from '@/app/Shell'
import type { DraftOperation, DraftSaveInput, DraftSaveResult } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { createCollaborationState, createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import type { MailroomGateway } from '@/data/gateway'
import { DraftEditorPage, formatRecipients, parseRecipients } from './DraftEditorPage'

const NEW_ID = '00000000-0000-4000-8000-0000000000aa'
const OTHER_DRAFT = '00000000-0000-4000-8000-000000000052'
const path = (draftId: string, query = '') => `/mailboxes/${CD.mailboxId}/drafts/${draftId}${query}`
const api = (code: GatewayError['code'], status: number, retryAfterSeconds?: number) =>
  new GatewayError('api', code, 'synthetic', { status, requestId: 'r1', ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) })
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const flush = () => act(async () => {})

/** A promise another party settles later; used to model replies that arrive after ownership moved on. */
interface Held<T> {
  succeed(value: T): void
  fail(error: unknown): void
}
function hold<T>(): { promise: Promise<T>; held: Held<T> } {
  let succeed!: (value: T) => void
  let fail!: (error: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    succeed = resolve
    fail = reject
  })
  return { promise, held: { succeed, fail } }
}

/**
 * Fixture gateway over one state with controllable save, read, lookup and session replies plus
 * counted session reads. Held replies ignore the abort signal on purpose: the point is what the
 * client does with an answer that arrives after it stopped owning the request.
 */
function harness() {
  const state = createCollaborationState()
  const actors = { a: createFixtureGateway({}, { state }), b: createFixtureGateway({ getSession: 'session_b' }, { state }) }
  const base = actors.a
  const h = {
    state,
    saves: [] as DraftSaveInput[],
    failNextSave: null as GatewayError | null,
    // Model a save the server committed but whose answer was lost: apply to state, then fail.
    commitBeforeFailing: false,
    holdNextSave: false,
    heldSaves: [] as Array<Held<DraftSaveResult> & { input: DraftSaveInput; commit(): DraftSaveResult }>,
    failNextRead: null as GatewayError | null,
    holdLookups: 0,
    heldLookups: [] as Array<Held<{ context_id: string; authorization_version: string; operation: DraftOperation }> & { operationId: string }>,
    lookupOverride: null as ((operationId: string, mailboxId: string, draftId: string) => DraftOperation) | null,
    sessionReads: 0,
    actor: 'a' as 'a' | 'b',
    holdNextSession: false,
    heldSessions: [] as Array<{ release(): void }>,
    gateway: base,
  }
  h.gateway = {
    ...base,
    getSession: async (signal) => {
      h.sessionReads += 1
      const session = await actors[h.actor].getSession(signal)
      if (!h.holdNextSession) return session
      h.holdNextSession = false
      const { promise, held } = hold<typeof session>()
      h.heldSessions.push({ release: () => held.succeed(session) })
      return promise
    },
    getDraft: async (ctx, draftId, mailboxId, signal) => {
      const failure = h.failNextRead
      if (failure) {
        h.failNextRead = null
        throw failure
      }
      return base.getDraft(ctx, draftId, mailboxId, signal)
    },
    getDraftOperation: async (ctx, operationId, mailboxId, draftId, signal) => {
      const answer = h.lookupOverride
        ? { context_id: CD.contextId, authorization_version: h.state.authorizationVersion, operation: h.lookupOverride(operationId, mailboxId, draftId) }
        : await base.getDraftOperation(ctx, operationId, mailboxId, draftId, signal)
      if (h.holdLookups === 0) return answer
      h.holdLookups -= 1
      const { promise, held } = hold<typeof answer>()
      h.heldLookups.push({ ...held, operationId })
      return promise
    },
    saveDraft: async (ctx, proof, draftId, saveInput, signal) => {
      h.saves.push(saveInput)
      if (h.holdNextSave) {
        h.holdNextSave = false
        const { promise, held } = hold<DraftSaveResult>()
        h.heldSaves.push({ ...held, input: saveInput, commit: () => h.state.saveDraft(draftId, saveInput) })
        return promise
      }
      const failure = h.failNextSave
      if (failure) {
        h.failNextSave = null
        if (h.commitBeforeFailing) await base.saveDraft(ctx, proof, draftId, saveInput, signal)
        throw failure
      }
      return base.saveDraft(ctx, proof, draftId, saveInput, signal)
    },
  }
  return h
}

function Probe({ grab }: { grab: (controller: SessionController) => void }) {
  grab(useSession())
  return null
}

const editorRoutes = (
  <>
    <Route path="/mailboxes/:mailboxId/drafts/:draftId" element={<DraftEditorPage />} />
    <Route path="/mailboxes/:mailboxId/drafts" element={<p>drafts-list</p>} />
  </>
)

/** Editor directly under the providers: a recovery frame does not unmount it (the batched same-identity lifetime). */
function renderEditor(gateway: MailroomGateway, entry: string) {
  let latest: SessionController | undefined
  const view = render(
    <SessionProvider gateway={gateway}>
      <DraftIntentProvider>
        <Probe grab={(c) => (latest = c)} />
        <MemoryRouter initialEntries={[entry]}>
          <Routes>{editorRoutes}</Routes>
        </MemoryRouter>
      </DraftIntentProvider>
    </SessionProvider>,
  )
  return { ...view, controller: () => latest! }
}

/** Editor inside Shell: a recovery frame or an identity change unmounts it (the keyed-subtree lifetime). */
function renderEditorInShell(gateway: MailroomGateway, entry: string) {
  let latest: SessionController | undefined
  const view = render(
    <SessionProvider gateway={gateway}>
      <DraftIntentProvider>
        <Probe grab={(c) => (latest = c)} />
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<p>index</p>} />
              {editorRoutes}
            </Route>
          </Routes>
        </MemoryRouter>
      </DraftIntentProvider>
    </SessionProvider>,
  )
  return { ...view, controller: () => latest! }
}

/** Opens the seeded draft, edits the subject and submits once. */
async function editSeededSubject(gateway: MailroomGateway, subject = 'Edited') {
  const view = renderEditor(gateway, path(CD.draftId))
  await screen.findByText('Saved version 2')
  fireEvent.change(input('Subject'), { target: { value: subject } })
  fireEvent.click(button('Save changes'))
  return view
}

/** A current 409 context_changed reaches the session policy: one automatic recovery starts. */
const changeContext = (controller: SessionController) =>
  act(() => {
    controller.handleError(api('context_changed', 409), controller.scope.current())
  })

/** Raw To text that parses fine but would be re-rendered differently by formatRecipients. */
const RAW_RECIPIENTS = 'Fixture recipient <recipient@example.test>\n\n   bare@example.test   '

describe('recipient parsing', () => {
  it('round-trips name/address pairs, bare addresses and bare names, skipping blank lines', () => {
    const to = parseRecipients('Fixture recipient <recipient@example.test>\n\n bare@example.test \nJust a name\n<only@example.test>')
    expect(to).toEqual([
      { display_name: 'Fixture recipient', address: 'recipient@example.test' },
      { display_name: null, address: 'bare@example.test' },
      { display_name: 'Just a name', address: null },
      { display_name: null, address: 'only@example.test' },
    ])
    expect(formatRecipients(to)).toBe('Fixture recipient <recipient@example.test>\nbare@example.test\nJust a name\nonly@example.test')
    expect(parseRecipients('')).toEqual([])
  })
})

describe('new and existing drafts', () => {
  it('a new link starts at version 0 with the reply binding and the first explicit save creates version 1', async () => {
    const h = harness()
    renderEditor(h.gateway, path(NEW_ID, `?new=1&reply_to=${CD.threadId}`))
    expect(await screen.findByRole('heading', { name: 'New draft' })).toBeTruthy()
    expect(screen.getByText('Not saved yet')).toBeTruthy()
    expect(screen.getByText('Draft only — nothing is sent')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Replying to a conversation' }).getAttribute('href')).toBe(`/mailboxes/${CD.mailboxId}/threads/${CD.threadId}`)
    expect(() => h.state.getDraft(NEW_ID, CD.mailboxId)).toThrow('This item is unavailable.')

    fireEvent.change(input('Subject'), { target: { value: 'Hello' } })
    fireEvent.change(input('To'), { target: { value: 'Fixture recipient <recipient@example.test>\nbare@example.test' } })
    fireEvent.change(input('Message'), { target: { value: 'Body text' } })
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    fireEvent.click(button('Save draft'))
    expect(await screen.findByText('Saved version 1')).toBeTruthy()
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeTruthy()
    expect(h.saves).toHaveLength(1)
    expect(h.saves[0]).toMatchObject({ mailbox_id: CD.mailboxId, expected_version: 0, reply_to_thread_id: CD.threadId })
    expect(h.state.getDraft(NEW_ID, CD.mailboxId)).toMatchObject({
      version: 1,
      subject: 'Hello',
      body_text: 'Body text',
      reply_to_thread_id: CD.threadId,
      to: [
        { display_name: 'Fixture recipient', address: 'recipient@example.test' },
        { display_name: null, address: 'bare@example.test' },
      ],
    })
    expect(button('Save changes')).toBeTruthy()
  })

  it('an existing draft loads its server copy as inert text in the form', async () => {
    const h = harness()
    const { container } = renderEditor(h.gateway, path(CD.draftId))
    expect(await screen.findByText('Saved version 2')).toBeTruthy()
    expect(input('Subject').value).toBe('Fixture draft')
    expect(input('To').value).toContain('Fixture recipient <recipient@example.test>')
    expect(input('Message').value).toContain('<script>alert(1)</script>')
    expect(container.querySelector('script, img')).toBeNull()
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    expect(button('Save changes').disabled).toBe(false)
  })

  it('a non-new link to an absent draft is unavailable, and a malformed id never reaches the gateway', async () => {
    const h = harness()
    renderEditor(h.gateway, path(NEW_ID))
    expect(await screen.findByText('This draft is unavailable')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to drafts' })).toBeTruthy()
    renderEditor(h.gateway, path('not-a-uuid', '?new=1'))
    expect(screen.getByText('This draft link is not valid')).toBeTruthy()
  })

  it('a 503 on load shows a retry that reloads', async () => {
    const h = harness()
    h.failNextRead = api('temporarily_unavailable', 503)
    renderEditor(h.gateway, path(CD.draftId))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The draft could not be loaded')
    fireEvent.click(button('Try again'))
    expect(await screen.findByText('Saved version 2')).toBeTruthy()
  })

  it('an over-long subject disables the save and never sends', async () => {
    const h = harness()
    renderEditor(h.gateway, path(CD.draftId))
    await screen.findByText('Saved version 2')
    fireEvent.change(input('Subject'), { target: { value: 'x'.repeat(999) } })
    expect(screen.getByText('The subject is at most 998 characters.')).toBeTruthy()
    expect(button('Save changes').disabled).toBe(true)
    fireEvent.change(input('Subject'), { target: { value: 'x'.repeat(998) } })
    expect(screen.queryByText('The subject is at most 998 characters.')).toBeNull()
    expect(button('Save changes').disabled).toBe(false)
    expect(h.saves).toHaveLength(0)
  })

  it('a consumed draft is read-only', async () => {
    const h = harness()
    h.state.markConsumed(CD.draftId)
    renderEditor(h.gateway, path(CD.draftId))
    expect(await screen.findByText('Consumed — read only')).toBeTruthy()
    expect(input('Subject').disabled).toBe(true)
    expect(input('Message').disabled).toBe(true)
    expect(button('Save changes').disabled).toBe(true)
  })
})

describe('conflicts never overwrite', () => {
  /** Someone else saved version 3 after the editor loaded version 2. */
  function changeElsewhere(h: ReturnType<typeof harness>) {
    h.state.saveDraft(CD.draftId, { mailbox_id: CD.mailboxId, operation_id: '00000000-0000-4000-8000-0000000000e1', expected_version: 2, subject: 'Elsewhere', to: [], body_text: 'server body', reply_to_thread_id: null })
  }

  it('rebase keeps my text, continues from the server version and the next save is a fresh operation', async () => {
    const h = harness()
    renderEditor(h.gateway, path(CD.draftId))
    await screen.findByText('Saved version 2')
    changeElsewhere(h)
    fireEvent.change(input('Subject'), { target: { value: 'Edited' } })
    fireEvent.click(button('Save changes'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('This draft changed elsewhere')
    expect(alert.textContent).toContain('nothing was overwritten')
    expect(input('Subject').disabled).toBe(true)
    expect(button('Save changes').disabled).toBe(true)
    expect(h.state.getDraft(CD.draftId, CD.mailboxId).subject).toBe('Elsewhere')

    fireEvent.click(button('Keep my text and continue from the server version'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(input('Subject').value).toBe('Edited')
    expect(screen.getByText('Saved version 3')).toBeTruthy()
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    fireEvent.click(button('Save changes'))
    expect(await screen.findByText('Saved version 4')).toBeTruthy()
    expect(h.saves).toHaveLength(2)
    expect(h.saves[1]?.operation_id).not.toBe(h.saves[0]?.operation_id)
    expect(h.saves[1]?.expected_version).toBe(3)
    expect(h.state.getDraft(CD.draftId, CD.mailboxId)).toMatchObject({ version: 4, subject: 'Edited' })
  })

  it('adopt discards my text for the server copy and is clean afterwards', async () => {
    const h = harness()
    renderEditor(h.gateway, path(CD.draftId))
    await screen.findByText('Saved version 2')
    changeElsewhere(h)
    fireEvent.change(input('Subject'), { target: { value: 'Edited' } })
    fireEvent.click(button('Save changes'))
    await screen.findByRole('alert')
    fireEvent.click(button('Discard my text and load the server copy'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(input('Subject').value).toBe('Elsewhere')
    expect(input('Message').value).toBe('server body')
    expect(screen.getByText('Saved version 3')).toBeTruthy()
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  it('a recovery read that fails or says "unavailable" changes nothing: text, attempt and base version stay', async () => {
    const h = harness()
    renderEditor(h.gateway, path(CD.draftId))
    await screen.findByText('Saved version 2')
    changeElsewhere(h)
    fireEvent.change(input('Subject'), { target: { value: 'Edited' } })
    fireEvent.click(button('Save changes'))
    await screen.findByRole('alert')

    // 404 on the read: no version-0 rebase, no empty adopt, no rollback inference (D05).
    h.failNextRead = api('not_available', 404)
    fireEvent.click(button('Keep my text and continue from the server version'))
    expect((await screen.findByRole('status')).textContent).toContain('reports this draft as unavailable to you now. Nothing was changed')
    expect(screen.getByRole('alert').textContent).toContain('This draft changed elsewhere')
    expect(input('Subject').value).toBe('Edited')
    expect(screen.getByText('Saved version 2')).toBeTruthy()
    expect(screen.queryByText('Not saved yet')).toBeNull()

    // 503 on the adopt read: same, with the outage message.
    h.failNextRead = api('temporarily_unavailable', 503)
    fireEvent.click(button('Discard my text and load the server copy'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('temporarily unavailable'))
    expect(screen.getByRole('alert').textContent).toContain('This draft changed elsewhere')
    expect(input('Subject').value).toBe('Edited')
    expect(input('Message').value).not.toBe('server body')

    // A successful current read is what unlocks the deliberate new intent.
    fireEvent.click(button('Keep my text and continue from the server version'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByText('Saved version 3')).toBeTruthy()
    expect(input('Subject').value).toBe('Edited')
    expect(h.saves).toHaveLength(1)
  })

  it('a conflict on a draft that became consumed: "keep my text" retains text and attempt read-only; only "discard" replaces them', async () => {
    const h = harness()
    renderEditor(h.gateway, path(CD.draftId))
    await screen.findByText('Saved version 2')
    h.state.markConsumed(CD.draftId)
    fireEvent.change(input('Subject'), { target: { value: 'Edited' } })
    fireEvent.change(input('To'), { target: { value: RAW_RECIPIENTS } })
    fireEvent.click(button('Save changes'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('This draft has been consumed')
    fireEvent.click(button('Keep my text and continue from the server version'))
    expect(await screen.findByText('Consumed — read only')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Your text and this attempt are kept on this screen, read-only')
    // Text and raw recipients retained, every write disabled, the attempt still shown.
    expect(input('Subject').value).toBe('Edited')
    expect(input('Subject').disabled).toBe(true)
    expect(input('To').value).toBe(RAW_RECIPIENTS)
    expect(screen.getByRole('alert').textContent).toContain('This draft has been consumed')
    expect(screen.queryByRole('button', { name: 'Keep my text and continue from the server version' })).toBeNull()
    expect(button('Save changes').disabled).toBe(true)
    expect(h.saves).toHaveLength(1)
    expect(h.state.getDraft(CD.draftId, CD.mailboxId).subject).toBe('Fixture draft')

    fireEvent.click(button('Discard my text and load the server copy'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(input('Subject').value).toBe('Fixture draft')
    expect(input('To').value).toBe(formatRecipients(h.state.getDraft(CD.draftId, CD.mailboxId).to))
    expect(screen.getByText('Consumed — read only')).toBeTruthy()
  })
})

describe('uncertain outcomes keep the attempt', () => {
  it('a 503 keeps the text and the retry resends the identical operation id and payload', async () => {
    const h = harness()
    h.failNextSave = api('temporarily_unavailable', 503, 7)
    await editSeededSubject(h.gateway)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The save was not confirmed')
    expect(alert.textContent).toContain('wait 7 s')
    expect(input('Subject').value).toBe('Edited')
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
    expect(h.state.getDraft(CD.draftId, CD.mailboxId).subject).toBe('Fixture draft')

    fireEvent.click(button('Retry this save'))
    expect(await screen.findByText('Saved version 3')).toBeTruthy()
    expect(h.saves).toHaveLength(2)
    expect(h.saves[1]).toEqual(h.saves[0])
    expect(h.state.getDraft(CD.draftId, CD.mailboxId).subject).toBe('Edited')
  })

  it('invalid newer local edits never block the exact retry, which sends the frozen payload', async () => {
    const h = harness()
    h.failNextSave = api('temporarily_unavailable', 503)
    await editSeededSubject(h.gateway)
    await screen.findByRole('alert')
    fireEvent.change(input('Subject'), { target: { value: 'y'.repeat(999) } })
    expect(screen.getByText('The subject is at most 998 characters.')).toBeTruthy()
    expect(button('Retry this save').disabled).toBe(false)
    fireEvent.click(button('Retry this save'))
    expect(await screen.findByText('Saved version 3')).toBeTruthy()
    expect(h.saves).toHaveLength(2)
    expect(h.saves[1]).toEqual(h.saves[0])
    expect(h.saves[1]?.subject).toBe('Edited')
    expect(h.state.getDraft(CD.draftId, CD.mailboxId).subject).toBe('Edited')
    // The newer invalid text stays local, still flagged, and still cannot start a fresh save.
    expect(input('Subject').value).toBe('y'.repeat(999))
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    expect(button('Save changes').disabled).toBe(true)
  })

  it('the lookup resolves a committed-but-unanswered save as applied without resending', async () => {
    const h = harness()
    h.commitBeforeFailing = true
    h.failNextSave = api('internal_error', 500)
    await editSeededSubject(h.gateway)
    await screen.findByRole('alert')
    fireEvent.click(button('Check what the server stored'))
    expect(await screen.findByText('Saved version 3')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(h.saves).toHaveLength(1)
  })

  it('an unknown lookup is not proof of absence: the attempt stays and still retries identically', async () => {
    const h = harness()
    h.failNextSave = api('rate_limited', 429)
    await editSeededSubject(h.gateway)
    await screen.findByRole('alert')
    fireEvent.click(button('Check what the server stored'))
    expect(await screen.findByText(/No record of this save is visible yet/)).toBeTruthy()
    expect(screen.getByText(/not proof that nothing was stored/)).toBeTruthy()
    fireEvent.click(button('Retry this save'))
    expect(await screen.findByText('Saved version 3')).toBeTruthy()
    expect(h.saves[1]).toEqual(h.saves[0])
  })

  it.each([
    ['400 request_invalid', api('request_invalid', 400)],
    ['404 not_available', api('not_available', 404)],
  ])('a lost reply followed by a retry refused with %s keeps the attempt unresolved; the lookup still answers for it', async (_name, refusal) => {
    const h = harness()
    h.commitBeforeFailing = true
    h.failNextSave = api('temporarily_unavailable', 503)
    await editSeededSubject(h.gateway)
    await screen.findByRole('alert')
    h.commitBeforeFailing = false
    h.failNextSave = refusal
    fireEvent.click(button('Retry this save'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('says nothing about the earlier attempt'))
    expect(screen.getByRole('alert').textContent).not.toContain('Nothing was saved')
    expect(screen.queryByRole('button', { name: 'Edit and try again' })).toBeNull()
    expect(input('Subject').value).toBe('Edited')
    expect(screen.getByText('Saved version 2')).toBeTruthy()
    expect(h.saves).toHaveLength(2)
    expect(h.saves[1]).toEqual(h.saves[0])
    // The first invocation did commit: the ledger answers for the same attempt id.
    fireEvent.click(button('Check what the server stored'))
    expect(await screen.findByText('Saved version 3')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(h.saves).toHaveLength(2)
  })

  it.each([
    ['another draft', (op: DraftOperation): DraftOperation => ({ ...op, draft_id: OTHER_DRAFT })],
    ['another mailbox', (op: DraftOperation): DraftOperation => ({ ...op, mailbox_id: '00000000-0000-4000-8000-000000000024' })],
    ['another base version', (op: DraftOperation): DraftOperation => (op.outcome === 'applied' ? { ...op, expected_version: 7 } : op)],
  ])('a schema-valid lookup receipt bound to %s is reported and applies nothing', async (_name, rebind) => {
    const h = harness()
    h.commitBeforeFailing = true
    h.failNextSave = api('internal_error', 500)
    await editSeededSubject(h.gateway)
    await screen.findByRole('alert')
    h.lookupOverride = (operationId, mailboxId, draftId) => rebind(h.state.getOperation(operationId, mailboxId, draftId))
    fireEvent.click(button('Check what the server stored'))
    expect((await screen.findByRole('status')).textContent).toContain('record for a different mailbox, draft or base version. Nothing was applied')
    expect(screen.getByRole('alert').textContent).toContain('The save was not confirmed')
    expect(screen.getByText('Saved version 2')).toBeTruthy()
    expect(input('Subject').value).toBe('Edited')
    // The real record still resolves the same attempt afterwards.
    h.lookupOverride = null
    fireEvent.click(button('Check what the server stored'))
    expect(await screen.findByText('Saved version 3')).toBeTruthy()
    expect(h.saves).toHaveLength(1)
  })

  it('an expired lookup makes the id unusable; a new save needs a successful current read and then uses a fresh id', async () => {
    const h = harness()
    h.failNextSave = api('temporarily_unavailable', 503)
    h.lookupOverride = (operationId, mailboxId, draftId) => ({ operation_id: operationId, mailbox_id: mailboxId, draft_id: draftId, outcome: 'expired' })
    await editSeededSubject(h.gateway)
    await screen.findByRole('alert')
    fireEvent.click(button('Check what the server stored'))
    expect(await screen.findByText(/has expired, so the attempt cannot be reused/)).toBeTruthy()
    expect(input('Subject').disabled).toBe(true)
    // "Unavailable" on the read is not permission to re-key: the id stays unusable, the text stays.
    h.failNextRead = api('not_available', 404)
    fireEvent.click(button('Start a new save from the server version'))
    expect((await screen.findByRole('status')).textContent).toContain('Nothing was changed')
    expect(screen.getByText(/has expired, so the attempt cannot be reused/)).toBeTruthy()
    expect(input('Subject').value).toBe('Edited')
    expect(h.saves).toHaveLength(1)

    fireEvent.click(button('Start a new save from the server version'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(input('Subject').value).toBe('Edited')
    fireEvent.click(button('Save changes'))
    expect(await screen.findByText('Saved version 3')).toBeTruthy()
    expect(h.saves).toHaveLength(2)
    expect(h.saves[1]?.operation_id).not.toBe(h.saves[0]?.operation_id)
  })
})

describe('context recovery keeps local intent for the same owner', () => {
  it('a 409 during a save hands control to the session; the recovered editor keeps the text and the attempt as uncertain, never as saved', async () => {
    const h = harness()
    h.failNextSave = api('context_changed', 409)
    await editSeededSubject(h.gateway)
    await waitFor(() => expect(h.sessionReads).toBeGreaterThanOrEqual(2))
    // Exactly one recovery bootstrap, no automatic resend, nothing shown as saved.
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('restored on this screen'))
    expect(h.sessionReads).toBe(2)
    expect(input('Subject').value).toBe('Edited')
    expect(screen.getByRole('alert').textContent).toContain('The save was not confirmed')
    expect(screen.getByText('Saved version 2')).toBeTruthy()
    expect(screen.queryByText('Saved version 3')).toBeNull()
    expect(h.saves).toHaveLength(1)
    expect(h.state.getDraft(CD.draftId, CD.mailboxId)).toMatchObject({ version: 2, subject: 'Fixture draft' })
    // Lookup and exact retry work under the recovered context with the original attempt.
    fireEvent.click(button('Check what the server stored'))
    expect(await screen.findByText(/No record of this save is visible yet/)).toBeTruthy()
    fireEvent.click(button('Retry this save'))
    expect(await screen.findByText('Saved version 3')).toBeTruthy()
    expect(h.saves).toHaveLength(2)
    expect(h.saves[1]).toEqual(h.saves[0])
  })

  it('batched same-identity recovery: the surviving editor restores text, raw recipients and the frozen attempt; a late success is not applied', async () => {
    const h = harness()
    const { controller } = renderEditor(h.gateway, path(CD.draftId))
    await screen.findByText('Saved version 2')
    fireEvent.change(input('Subject'), { target: { value: 'Edited' } })
    fireEvent.change(input('To'), { target: { value: RAW_RECIPIENTS } })
    h.holdNextSave = true
    fireEvent.click(button('Save changes'))
    await screen.findByRole('button', { name: 'Saving…' })
    const attemptInput = h.saves[0]!

    changeContext(controller())
    await waitFor(() => expect(h.sessionReads).toBe(2))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('restored on this screen'))
    expect(input('Subject').value).toBe('Edited')
    expect(input('To').value).toBe(RAW_RECIPIENTS)
    expect(screen.getByRole('alert').textContent).toContain('The save was not confirmed')
    expect(screen.getByText('Saved version 2')).toBeTruthy()
    expect(h.saves).toHaveLength(1)

    // The old request's success arrives after ownership moved on: it is evidence for the ledger, not for this screen.
    act(() => h.heldSaves[0]!.succeed(h.heldSaves[0]!.commit()))
    await flush()
    expect(screen.getByText('Saved version 2')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('The save was not confirmed')
    expect(h.state.getDraft(CD.draftId, CD.mailboxId)).toMatchObject({ version: 3, subject: 'Edited' })

    // The ledger resolves exactly that attempt id and payload.
    fireEvent.click(button('Check what the server stored'))
    expect(await screen.findByText('Saved version 3')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(h.saves).toHaveLength(1)
    expect(h.state.getOperation(attemptInput.operation_id, CD.mailboxId, CD.draftId)).toMatchObject({ outcome: 'applied', expected_version: 2, version: 3 })
  })

  it('unmounting recovery under Shell: the remounted editor restores the same intent; a late error is not applied as a rejection', async () => {
    const h = harness()
    const { controller } = renderEditorInShell(h.gateway, path(CD.draftId))
    await screen.findByText('Saved version 2')
    fireEvent.change(input('Subject'), { target: { value: 'Edited' } })
    fireEvent.change(input('To'), { target: { value: RAW_RECIPIENTS } })
    h.holdNextSave = true
    fireEvent.click(button('Save changes'))
    await screen.findByRole('button', { name: 'Saving…' })

    h.holdNextSession = true
    changeContext(controller())
    // The recovering frame committed: protected content, the editor included, is gone.
    await waitFor(() => expect(h.heldSessions).toHaveLength(1))
    expect(screen.getByRole('status', { name: 'Restoring session' })).toBeTruthy()
    expect(screen.queryByLabelText('Subject')).toBeNull()
    expect(controller().context).toBeNull()

    act(() => h.heldSessions[0]!.release())
    await waitFor(() => expect(screen.getByText(/restored on this screen/)).toBeTruthy())
    expect(h.sessionReads).toBe(2)
    expect(input('Subject').value).toBe('Edited')
    expect(input('To').value).toBe(RAW_RECIPIENTS)
    expect(screen.getByRole('alert').textContent).toContain('The save was not confirmed')
    expect(screen.getByText('Saved version 2')).toBeTruthy()
    expect(h.saves).toHaveLength(1)

    // Late definitive-looking error for the old request: not a rejection of a retained attempt.
    act(() => h.heldSaves[0]!.fail(api('request_invalid', 400)))
    await flush()
    expect(screen.getByRole('alert').textContent).toContain('The save was not confirmed')
    expect(screen.queryByRole('button', { name: 'Edit and try again' })).toBeNull()
    fireEvent.click(button('Retry this save'))
    expect(await screen.findByText('Saved version 3')).toBeTruthy()
    expect(h.saves).toHaveLength(2)
    expect(h.saves[1]).toEqual(h.saves[0])
  })

  it('retained intent is private to its owner: another actor never sees it, and it is dropped on the identity change', async () => {
    const h = harness()
    const { controller } = renderEditorInShell(h.gateway, path(CD.draftId))
    await screen.findByText('Saved version 2')
    fireEvent.change(input('Subject'), { target: { value: 'Private edit' } })
    fireEvent.change(input('To'), { target: { value: RAW_RECIPIENTS } })
    expect(screen.getByText('Unsaved changes')).toBeTruthy()

    h.actor = 'b'
    act(() => controller().refresh())
    await waitFor(() => expect(h.sessionReads).toBe(2))
    await screen.findByText('Saved version 2')
    expect(screen.getAllByText(/Fixture user B/).length).toBeGreaterThan(0)
    expect(input('Subject').value).toBe('Fixture draft')
    expect(input('To').value).toBe(formatRecipients(h.state.getDraft(CD.draftId, CD.mailboxId).to))
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    expect(screen.queryByText(/restored on this screen/)).toBeNull()

    h.actor = 'a'
    act(() => controller().refresh())
    await waitFor(() => expect(h.sessionReads).toBe(3))
    await screen.findByText('Saved version 2')
    expect(screen.getAllByText(/Fixture user A/).length).toBeGreaterThan(0)
    expect(input('Subject').value).toBe('Fixture draft')
    expect(screen.queryByText(/restored on this screen/)).toBeNull()
    expect(h.saves).toHaveLength(0)
  })

  it('busy state belongs to one request: a stale lookup cannot leave the editor resolving or clear a newer lookup', async () => {
    const h = harness()
    h.failNextSave = api('rate_limited', 429)
    const { controller } = await editSeededSubject(h.gateway)
    await screen.findByRole('alert')
    h.holdLookups = 1
    fireEvent.click(button('Check what the server stored'))
    expect(await screen.findByRole('button', { name: 'Checking…' })).toBeTruthy()
    expect(button('Retry this save').disabled).toBe(true)

    changeContext(controller())
    await waitFor(() => expect(h.sessionReads).toBe(2))
    await waitFor(() => expect(screen.getByText(/restored on this screen/)).toBeTruthy())
    // Lookup and recovery are available again under the renewed context.
    expect(button('Check what the server stored').disabled).toBe(false)
    expect(button('Retry this save').disabled).toBe(false)

    // Start a newer lookup, then let the OLD one complete with an applied record: nothing applies
    // and the newer lookup stays busy until its own completion.
    h.holdLookups = 1
    fireEvent.click(button('Check what the server stored'))
    expect(await screen.findByRole('button', { name: 'Checking…' })).toBeTruthy()
    const [stale, current] = h.heldLookups
    const attemptId = h.saves[0]!.operation_id
    act(() =>
      stale!.succeed({
        context_id: CD.contextId,
        authorization_version: h.state.authorizationVersion,
        operation: { operation_id: attemptId, mailbox_id: CD.mailboxId, draft_id: CD.draftId, outcome: 'applied', expected_version: 2, version: 3, state: 'editable', recorded_at: '2026-10-13T00:03:00Z', detail_expires_at: '2026-10-20T00:03:00Z' },
      }),
    )
    await flush()
    expect(screen.getByText('Saved version 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeTruthy()

    act(() => current!.succeed({ context_id: CD.contextId, authorization_version: h.state.authorizationVersion, operation: { operation_id: attemptId, mailbox_id: CD.mailboxId, draft_id: CD.draftId, outcome: 'unknown' } }))
    expect(await screen.findByText(/No record of this save is visible yet/)).toBeTruthy()
    expect(button('Check what the server stored').disabled).toBe(false)
    fireEvent.click(button('Retry this save'))
    expect(await screen.findByText('Saved version 3')).toBeTruthy()
    expect(h.saves[1]).toEqual(h.saves[0])
  })
})
