// Stage-A micro-gap regression: per-adapter caller-signal propagation, for EVERY gateway method.
// A pre-aborted signal must reject with the canonical 'aborted' transport error before any work
// (no fetch is issued); a mid-flight abort must reject 'aborted', never surface a success; and the
// HTTP transport must link the caller's signal to the signal it hands fetch. The transport owns a
// combined controller (deadline + caller), so the linkage — not object identity — is the contract.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CD_FIXTURE as CD } from './fixtures/collaborationState'
import { createFixtureGateway } from './fixtures/fixtureGateway'
import { createHttpGateway } from './http/httpGateway'
import type { FetchLike } from './http/transport'
import type { MailroomGateway } from './gateway'

const CTX = { contextId: 'context_A_0123456789', authorizationVersion: 'authz_A_0123456789' }
const MB = '00000000-0000-4000-8000-000000000021'
const TH = '00000000-0000-4000-8000-000000000031'
const PROOF = { csrfToken: 'synthetic_challenge_token_00000001' }
// C/D calls use cd_setup ids and version-correct inputs so the stateful fixture resolves them.
const CD_OP = '00000000-0000-4000-8000-000000000081'
const CD_NOTE = '00000000-0000-4000-8000-000000000091'
const CD_SAVE = { mailbox_id: CD.mailboxId, operation_id: CD_OP, expected_version: 2, subject: 'Signal', to: [], body_text: '', reply_to_thread_id: null }
const CD_FLAGS = { compose: false, approve_send: false, manage_members: false }

/** One invocation per gateway method, so every adapter surface is exercised identically. */
const METHODS: ReadonlyArray<[string, (gateway: MailroomGateway, signal: AbortSignal) => Promise<unknown>]> = [
  ['getSession', (g, s) => g.getSession(s)],
  ['listMailboxes', (g, s) => g.listMailboxes(CTX, {}, s)],
  ['listThreads', (g, s) => g.listThreads(CTX, MB, {}, s)],
  ['getThread', (g, s) => g.getThread(CTX, TH, MB, {}, s)],
  // BE-02A lifecycle surfaces share the same cancellation contract.
  ['getLoginChallenge', (g, s) => g.getLoginChallenge(s)],
  ['login', (g, s) => g.login(PROOF, { email: 'a@example.test', password: 'secret' }, s)],
  ['requestRecovery', (g, s) => g.requestRecovery(PROOF, { email: 'a@example.test' }, s)],
  ['acceptAuthEntry', (g, s) => g.acceptAuthEntry(PROOF, { password: 'twelve-chars-long' }, s)],
  ['refreshSession', (g, s) => g.refreshSession(PROOF, s)],
  ['logout', (g, s) => g.logout(PROOF, { scope: 'local' }, s)],
  ['listOrganizations', (g, s) => g.listOrganizations(CTX, {}, s)],
  ['switchOrganization', (g, s) => g.switchOrganization(CTX, PROOF, { organization_id: MB }, s)],
  // BE-02 C/D collaboration surfaces: reads and writes alike.
  ['getDraft', (g, s) => g.getDraft(CTX, CD.draftId, CD.mailboxId, s)],
  ['saveDraft', (g, s) => g.saveDraft(CTX, PROOF, CD.draftId, CD_SAVE, s)],
  ['listDrafts', (g, s) => g.listDrafts(CTX, CD.mailboxId, {}, s)],
  ['getDraftOperation', (g, s) => g.getDraftOperation(CTX, CD_OP, CD.mailboxId, CD.draftId, s)],
  ['setThreadReadState', (g, s) => g.setThreadReadState(CTX, PROOF, CD.threadId, { mailbox_id: CD.mailboxId, read: true }, s)],
  ['getThreadAssignment', (g, s) => g.getThreadAssignment(CTX, CD.threadId, CD.mailboxId, s)],
  ['setThreadAssignment', (g, s) => g.setThreadAssignment(CTX, PROOF, CD.threadId, { mailbox_id: CD.mailboxId, assignee_id: null, expected_assignment_version: 0 }, s)],
  ['listThreadNotes', (g, s) => g.listThreadNotes(CTX, CD.threadId, CD.mailboxId, {}, s)],
  ['createThreadNote', (g, s) => g.createThreadNote(CTX, PROOF, CD.threadId, { mailbox_id: CD.mailboxId, note_id: CD_NOTE, body_text: 'signal note' }, s)],
  ['listMailboxMembers', (g, s) => g.listMailboxMembers(CTX, CD.mailboxId, {}, s)],
  ['putMailboxMember', (g, s) => g.putMailboxMember(CTX, PROOF, CD.mailboxId, CD.readerId, { expected_membership_version: 1, capabilities: CD_FLAGS }, s)],
  ['deleteMailboxMember', (g, s) => g.deleteMailboxMember(CTX, PROOF, CD.mailboxId, CD.readerId, 1, s)],
  ['searchMail', (g, s) => g.searchMail(CTX, { q: 'plaintext' }, s)],
]

// The transport arms a deadline timer per request; fake timers plus the leak check keep these
// deterministic and prove each path cleans its timer up (same harness as the cancellation suite).
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  const remainingTimers = vi.getTimerCount()
  vi.useRealTimers()
  vi.restoreAllMocks()
  expect(remainingTimers).toBe(0)
})

describe('fixture adapter', () => {
  it.each(METHODS)('%s rejects a pre-aborted signal with the canonical aborted error', async (_name, call) => {
    const controller = new AbortController()
    controller.abort()
    await expect(call(createFixtureGateway(), controller.signal)).rejects.toMatchObject({
      name: 'GatewayError',
      kind: 'transport',
      code: 'aborted',
    })
  })

  it.each(METHODS)('%s still resolves for a live (non-aborted) signal', async (_name, call) => {
    // The default refresh fixture answers 401 (no cookie, so a 401 bootstrap ends on sign-in);
    // script a successful lifecycle so this case proves the signal path, not the default outcome.
    await expect(call(createFixtureGateway({ refreshSession: 'lifecycle_a' }), new AbortController().signal)).resolves.toBeTruthy()
  })
})

describe('HTTP adapter', () => {
  it.each(METHODS)('%s rejects a pre-aborted signal before any fetch is issued', async (_name, call) => {
    const fetchImpl = vi.fn<FetchLike>()
    const controller = new AbortController()
    controller.abort()
    await expect(call(createHttpGateway(fetchImpl), controller.signal)).rejects.toMatchObject({
      kind: 'transport',
      code: 'aborted',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each(METHODS)('%s propagates a mid-flight abort to the fetch signal and rejects aborted', async (_name, call) => {
    let innerSignal: AbortSignal | null | undefined
    const fetchImpl: FetchLike = (_path, init) => {
      innerSignal = init.signal
      return new Promise<never>(() => {}) // stays pending: only the abort can settle the request
    }
    const controller = new AbortController()
    const pending = call(createHttpGateway(fetchImpl), controller.signal).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0) // the request is in flight and holds the fetch signal
    expect(innerSignal?.aborted).toBe(false)
    controller.abort()
    expect(await pending).toMatchObject({ kind: 'transport', code: 'aborted' })
    // The caller's abort reached the signal actually handed to fetch (combined-controller linkage).
    expect(innerSignal?.aborted).toBe(true)
  })
})
