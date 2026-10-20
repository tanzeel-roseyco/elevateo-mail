// The stateful C/D fixture models the contract's observable rules closely enough to prove CLIENT
// policy in unit and browser tests: ledger-first replay keyed by operation id, mismatch on reuse
// with different content, recorded conflicts, consumed and expired terminals, idempotent read
// state, revisioned assignment and membership with the last-manager guard and the actor's
// authorization rotation, immutable notes with identical-replay, and literal search. It proves
// nothing about Rails.
import { describe, expect, it } from 'vitest'
import type { DraftSaveInput } from '../contract'
import type { ReadContext } from '../gateway'
import { CD_FIXTURE as CD, CollaborationState } from './collaborationState'
import { createCollaborationState, createFixtureGateway } from './fixtureGateway'

const CTX: ReadContext = { contextId: CD.contextId, authorizationVersion: CD.authorizationVersion }
/** The error a synchronous state call throws; fails the test when nothing is thrown. */
function thrown(call: () => unknown): unknown {
  try {
    call()
  } catch (error) {
    return error
  }
  throw new Error('expected the call to throw')
}
const PROOF = { csrfToken: 'fixture_token_a_0123456789' }
const DRAFT_2 = '00000000-0000-4000-8000-000000000052'
const op = (n: number): string => `00000000-0000-4000-8000-0000000000${n.toString().padStart(2, '0')}`
const NOTE_1 = '00000000-0000-4000-8000-000000000071'
const NOTE_2 = '00000000-0000-4000-8000-000000000072'
const OUTSIDER = '00000000-0000-4000-8000-000000000002'
const FLAGS = { compose: false, approve_send: false, manage_members: false }
const MANAGER = { compose: true, approve_send: false, manage_members: true }

function save(operationId: string, expectedVersion: number, bodyText = 'hello', mailboxId = CD.mailboxId): DraftSaveInput {
  return { mailbox_id: mailboxId, operation_id: operationId, expected_version: expectedVersion, subject: 'Subject', to: [], body_text: bodyText, reply_to_thread_id: null }
}

describe('drafts and the operation ledger (§4–§5)', () => {
  it('seeds the canonical draft at version 2 and hides it under another mailbox with the fixed 404', () => {
    const state = createCollaborationState()
    expect(state.getDraft(CD.draftId, CD.mailboxId)).toMatchObject({ version: 2, state: 'editable', subject: 'Fixture draft' })
    expect(() => state.getDraft(CD.draftId, '00000000-0000-4000-8000-000000000021')).toThrow('This item is unavailable.')
    expect(state.getOperation(op(61), CD.mailboxId, CD.draftId)).toMatchObject({ outcome: 'applied', version: 1 })
  })

  it('creates at version 0, replays an identical retry without a new version, and lists newest first', () => {
    const state = createCollaborationState()
    expect(state.saveDraft(DRAFT_2, save(op(81), 0))).toEqual({ draft_id: DRAFT_2, operation_id: op(81), version: 1, state: 'editable' })
    expect(state.saveDraft(DRAFT_2, save(op(81), 0))).toMatchObject({ version: 1 })
    expect(state.getDraft(DRAFT_2, CD.mailboxId).version).toBe(1)
    expect(state.saveDraft(DRAFT_2, save(op(82), 1, 'second'))).toMatchObject({ version: 2 })
    // The ledger answers first: the earlier operation still reports ITS outcome after later saves.
    expect(state.saveDraft(DRAFT_2, save(op(81), 0))).toMatchObject({ version: 1 })
    expect(state.getDraft(DRAFT_2, CD.mailboxId).body_text).toBe('second')
    expect(state.listDrafts(CD.mailboxId).map((d) => d.id)).toEqual([DRAFT_2, CD.draftId])
  })

  it('refuses an operation id reused with different content or a different binding', () => {
    const state = createCollaborationState()
    state.saveDraft(DRAFT_2, save(op(81), 0))
    expect(thrown(() => state.saveDraft(DRAFT_2, save(op(81), 0, 'changed')))).toMatchObject({ code: 'operation_mismatch', status: 409 })
    expect(thrown(() => state.saveDraft(CD.draftId, save(op(81), 0)))).toMatchObject({ code: 'operation_mismatch' })
    // The applied record and the draft are untouched by the refused reuse.
    expect(state.getOperation(op(81), CD.mailboxId, DRAFT_2)).toMatchObject({ outcome: 'applied', version: 1 })
    expect(state.getDraft(DRAFT_2, CD.mailboxId).body_text).toBe('hello')
  })

  it('records a stale-version conflict in the ledger and replays it for the identical retry', () => {
    const state = createCollaborationState()
    expect(thrown(() => state.saveDraft(CD.draftId, save(op(83), 1)))).toMatchObject({ code: 'draft_conflict', status: 409 })
    expect(state.getOperation(op(83), CD.mailboxId, CD.draftId)).toMatchObject({ outcome: 'conflict', code: 'draft_conflict', expected_version: 1, current_version: 2, state: 'editable' })
    expect(thrown(() => state.saveDraft(CD.draftId, save(op(83), 1)))).toMatchObject({ code: 'draft_conflict' })
    expect(state.getDraft(CD.draftId, CD.mailboxId).version).toBe(2)
  })

  it('a consumed draft refuses every save as draft_consumed and records it', () => {
    const state = createCollaborationState()
    state.markConsumed(CD.draftId)
    expect(thrown(() => state.saveDraft(CD.draftId, save(op(84), 2)))).toMatchObject({ code: 'draft_consumed' })
    expect(state.getOperation(op(84), CD.mailboxId, CD.draftId)).toMatchObject({ outcome: 'conflict', code: 'draft_consumed', state: 'consumed' })
    expect(state.getDraft(CD.draftId, CD.mailboxId).state).toBe('consumed')
  })

  it('an expired operation id is unusable and reports expired; an unknown id is unknown; a foreign binding is 404', () => {
    const state = createCollaborationState()
    expect(thrown(() => state.saveDraft(DRAFT_2, save(CD.expiredOperationId, 0)))).toMatchObject({ code: 'operation_mismatch' })
    expect(state.getOperation(CD.expiredOperationId, CD.mailboxId, DRAFT_2)).toEqual({ operation_id: CD.expiredOperationId, mailbox_id: CD.mailboxId, draft_id: DRAFT_2, outcome: 'expired' })
    expect(state.getOperation(op(99), CD.mailboxId, DRAFT_2)).toEqual({ operation_id: op(99), mailbox_id: CD.mailboxId, draft_id: DRAFT_2, outcome: 'unknown' })
    expect(() => state.getOperation(op(61), CD.mailboxId, DRAFT_2)).toThrow('This item is unavailable.')
  })
})

describe('read state and assignment (§6)', () => {
  it('read state is per actor, versioned on change only, and repeating a value is a no-op', () => {
    const state = createCollaborationState()
    expect(state.readStateFor(CD.threadId)).toEqual({ read: false, version: 0, updatedAt: null })
    const first = state.setReadState(CD.threadId, CD.mailboxId, true)
    expect(first).toMatchObject({ thread_id: CD.threadId, read: true, read_state_version: 1 })
    expect(first.updated_at).not.toBeNull()
    expect(state.setReadState(CD.threadId, CD.mailboxId, true)).toMatchObject({ read_state_version: 1, updated_at: first.updated_at })
    expect(state.setReadState(CD.threadId, CD.mailboxId, false)).toMatchObject({ read: false, read_state_version: 2 })
    expect(state.threadsIn(CD.mailboxId).map((t) => t.unread)).toEqual([true])
  })

  it('assignment carries a revision, rejects stale revisions even for the same value, and only targets members', () => {
    const state = createCollaborationState()
    expect(state.getAssignment(CD.threadId, CD.mailboxId)).toMatchObject({ assignee_id: null, assignment_version: 0, updated_at: null })
    expect(state.setAssignment(CD.threadId, CD.mailboxId, CD.readerId, 0)).toMatchObject({ assignee_id: CD.readerId, assignment_version: 1 })
    expect(state.setAssignment(CD.threadId, CD.mailboxId, CD.readerId, 1)).toMatchObject({ assignment_version: 1 })
    expect(thrown(() => state.setAssignment(CD.threadId, CD.mailboxId, CD.readerId, 0))).toMatchObject({ code: 'assignment_conflict', status: 409 })
    expect(() => state.setAssignment(CD.threadId, CD.mailboxId, OUTSIDER, 1)).toThrow('This item is unavailable.')
    expect(state.setAssignment(CD.threadId, CD.mailboxId, null, 1)).toMatchObject({ assignee_id: null, assignment_version: 2 })
  })
})

describe('immutable notes (§7)', () => {
  it('creates once, replays the identical retry, and refuses the same id with other content or binding', () => {
    const state = createCollaborationState()
    const hostile = '<img src="https://example.invalid/pixel">\n[unsafe](javascript:alert(1))'
    const created = state.createNote(CD.threadId, CD.mailboxId, NOTE_1, hostile)
    expect(created).toMatchObject({ replayed: false, note: { id: NOTE_1, author_id: CD.actorId, body_text: hostile, version: 1 } })
    const replayed = state.createNote(CD.threadId, CD.mailboxId, NOTE_1, hostile)
    expect(replayed.replayed).toBe(true)
    expect(replayed.note).toEqual(created.note)
    expect(state.listNotes(CD.threadId)).toHaveLength(1)
    expect(thrown(() => state.createNote(CD.threadId, CD.mailboxId, NOTE_1, 'other text'))).toMatchObject({ code: 'operation_mismatch' })
    expect(thrown(() => state.createNote('00000000-0000-4000-8000-000000000031', CD.mailboxId, NOTE_1, hostile))).toMatchObject({ code: 'operation_mismatch' })
    expect(state.createNote(CD.threadId, CD.mailboxId, NOTE_2, 'second').replayed).toBe(false)
    expect(state.listNotes(CD.threadId).map((n) => n.id)).toEqual([NOTE_1, NOTE_2])
  })
})

describe('membership (§8)', () => {
  it('writes carry the mailbox-wide revision; unchanged flags do not bump it; unknown users are 404', () => {
    const state = createCollaborationState()
    expect(state.listMembers(CD.mailboxId)).toEqual({ version: 1, items: [{ user_id: CD.actorId, capabilities: MANAGER }] })
    expect(state.putMember(CD.mailboxId, CD.readerId, 1, FLAGS)).toEqual({ version: 2, member: { user_id: CD.readerId, capabilities: FLAGS } })
    expect(thrown(() => state.putMember(CD.mailboxId, CD.readerId, 1, FLAGS))).toMatchObject({ code: 'membership_conflict', status: 409 })
    expect(state.putMember(CD.mailboxId, CD.readerId, 2, FLAGS).version).toBe(2)
    expect(() => state.putMember(CD.mailboxId, OUTSIDER, 2, FLAGS)).toThrow('This item is unavailable.')
    expect(state.listMembers(CD.mailboxId).items.map((m) => m.user_id)).toEqual([CD.actorId, CD.readerId])
  })

  it('protects the last manager on both demotion and removal', () => {
    const state = createCollaborationState()
    expect(thrown(() => state.putMember(CD.mailboxId, CD.actorId, 1, { ...MANAGER, manage_members: false }))).toMatchObject({ code: 'membership_conflict' })
    expect(thrown(() => state.deleteMember(CD.mailboxId, CD.actorId, 1))).toMatchObject({ code: 'membership_conflict' })
    expect(state.listMembers(CD.mailboxId)).toMatchObject({ version: 1 })
    expect(state.authorizationVersion).toBe(CD.authorizationVersion)
  })

  it('a self-affecting change rotates the actor authorization version once another manager exists', () => {
    const state = createCollaborationState()
    expect(state.putMember(CD.mailboxId, CD.readerId, 1, MANAGER).version).toBe(2)
    expect(state.authorizationVersion).toBe(CD.authorizationVersion)
    expect(state.putMember(CD.mailboxId, CD.actorId, 2, { ...MANAGER, manage_members: false }).version).toBe(3)
    expect(state.authorizationVersion).toBe(CD.rotatedAuthorizationVersion)
    // The reader is now the last manager: removing them is refused and changes nothing (§8).
    expect(thrown(() => state.deleteMember(CD.mailboxId, CD.readerId, 3))).toMatchObject({ code: 'membership_conflict' })
    expect(state.listMembers(CD.mailboxId)).toMatchObject({ version: 3 })
    // The demoted actor can leave; the roster advances and the actor's authorization stays rotated.
    expect(state.deleteMember(CD.mailboxId, CD.actorId, 3)).toEqual({ version: 4 })
    expect(state.listMembers(CD.mailboxId).items.map((m) => m.user_id)).toEqual([CD.readerId])
    expect(state.authorizationVersion).toBe(CD.rotatedAuthorizationVersion)
    // Deleting an absent member is a no-op at the correct revision; a stale revision is refused.
    expect(state.deleteMember(CD.mailboxId, CD.actorId, 4)).toEqual({ version: 4 })
    expect(thrown(() => state.deleteMember(CD.mailboxId, CD.actorId, 3))).toMatchObject({ code: 'membership_conflict' })
  })
})

describe('literal search (§9)', () => {
  it('matches literal substrings case-insensitively, scopes by mailbox and reflects read state', () => {
    const state = createCollaborationState()
    expect(state.search('<img', undefined).map((t) => t.id).sort()).toEqual(['00000000-0000-4000-8000-000000000031', CD.threadId].sort())
    expect(state.search('<img', CD.mailboxId).map((t) => t.id)).toEqual([CD.threadId])
    expect(state.search('c/d FIXTURE thread', undefined).map((t) => t.id)).toEqual([CD.threadId])
    // Metacharacters are literal: nothing contains a percent sign.
    expect(state.search('%', undefined)).toEqual([])
    state.setReadState(CD.threadId, CD.mailboxId, true)
    expect(state.search('C/D fixture', undefined)[0]?.unread).toBe(false)
  })
})

describe('fixture gateway over the state', () => {
  it('serves the C/D mailbox after the canonical inbox with compose and manage_members', async () => {
    const page = await createFixtureGateway().listMailboxes(CTX, {})
    expect(page.items.map((m) => m.id)).toEqual(['00000000-0000-4000-8000-000000000021', CD.mailboxId])
    expect(page.items[1]?.capabilities).toEqual({ read: true, compose: true, approve_send: false, manage_members: true })
  })

  it('threads and the reader for the C/D mailbox come from the state and follow its read state', async () => {
    const state = createCollaborationState()
    const gateway = createFixtureGateway({}, { state })
    expect((await gateway.listThreads(CTX, CD.mailboxId, {})).items.map((t) => [t.id, t.unread])).toEqual([[CD.threadId, true]])
    await gateway.setThreadReadState(CTX, PROOF, CD.threadId, { mailbox_id: CD.mailboxId, read: true })
    expect((await gateway.listThreads(CTX, CD.mailboxId, {})).items[0]?.unread).toBe(false)
    expect((await gateway.listThreads(CTX, CD.mailboxId, { filter: 'unread' })).items).toEqual([])
    const detail = await gateway.getThread(CTX, CD.threadId, CD.mailboxId, {})
    expect(detail.thread).toMatchObject({ id: CD.threadId, unread: false })
    expect(detail.messages[0]?.body_text).toContain('<img src=')
  })

  it('a scripted example overrides the state for exactly that operation', async () => {
    const state = createCollaborationState()
    const conflict = createFixtureGateway({ saveDraft: 'draft_conflict' }, { state })
    await expect(conflict.saveDraft(CTX, PROOF, CD.draftId, save(op(85), 2))).rejects.toMatchObject({ kind: 'api', code: 'draft_conflict', status: 409, requestId: 'fixture-cd-request-001' })
    // The scripted refusal did not touch the state, and other operations still run over it.
    expect(state.getDraft(CD.draftId, CD.mailboxId).version).toBe(2)
    expect((await conflict.getDraftOperation(CTX, op(85), CD.mailboxId, CD.draftId)).operation.outcome).toBe('unknown')
    const expired = createFixtureGateway({ getDraftOperation: 'operation_expired' }, { state })
    expect((await expired.getDraftOperation(CTX, op(61), CD.mailboxId, CD.draftId)).operation.outcome).toBe('expired')
    await expect(createFixtureGateway({ searchMail: 'not_available' }).searchMail(CTX, { q: 'x' })).rejects.toMatchObject({ code: 'not_available', status: 404 })
    await expect(createFixtureGateway({ listThreadNotes: 'missing-example' }).listThreadNotes(CTX, CD.threadId, CD.mailboxId, {})).rejects.toThrow('Unknown fixture example')
  })

  it('note creation reports replay from the state and from the scripted replay example', async () => {
    const state = createCollaborationState()
    const gateway = createFixtureGateway({}, { state })
    const input = { mailbox_id: CD.mailboxId, note_id: NOTE_1, body_text: 'plain' }
    expect((await gateway.createThreadNote(CTX, PROOF, CD.threadId, input)).replayed).toBe(false)
    expect((await gateway.createThreadNote(CTX, PROOF, CD.threadId, input)).replayed).toBe(true)
    expect((await gateway.listThreadNotes(CTX, CD.threadId, CD.mailboxId, {})).items).toHaveLength(1)
    expect((await createFixtureGateway({ createThreadNote: 'note_replayed' }).createThreadNote(CTX, PROOF, CD.threadId, input)).replayed).toBe(true)
    expect((await createFixtureGateway({ createThreadNote: 'note_created' }).createThreadNote(CTX, PROOF, CD.threadId, input)).replayed).toBe(false)
  })

  it('membership results carry the rotated authorization version after a self-affecting change', async () => {
    const state = createCollaborationState()
    const gateway = createFixtureGateway({}, { state })
    await gateway.putMailboxMember(CTX, PROOF, CD.mailboxId, CD.readerId, { expected_membership_version: 1, capabilities: MANAGER })
    const demoted = await gateway.putMailboxMember(CTX, PROOF, CD.mailboxId, CD.actorId, { expected_membership_version: 2, capabilities: { ...MANAGER, manage_members: false } })
    expect(demoted).toMatchObject({ membership_version: 3, authorization_version: CD.rotatedAuthorizationVersion, member: { user_id: CD.actorId } })
    // The reader is the last manager now: the gateway refuses that removal with the contract code.
    await expect(gateway.deleteMailboxMember(CTX, PROOF, CD.mailboxId, CD.readerId, 3)).rejects.toMatchObject({ kind: 'api', code: 'membership_conflict', status: 409 })
    const removed = await gateway.deleteMailboxMember(CTX, PROOF, CD.mailboxId, CD.actorId, 3)
    expect(removed).toMatchObject({ membership_version: 4, member: null, authorization_version: CD.rotatedAuthorizationVersion })
    expect((await gateway.listMailboxMembers(CTX, CD.mailboxId, {})).membership_version).toBe(4)
  })

  it('two gateways over one state observe each other (the browser entry reuses one instance)', async () => {
    const state = new CollaborationState({ threads: [] })
    const a = createFixtureGateway({}, { state })
    const b = createFixtureGateway({}, { state })
    await a.saveDraft(CTX, PROOF, DRAFT_2, save(op(86), 0))
    expect((await b.getDraft(CTX, DRAFT_2, CD.mailboxId)).draft.version).toBe(1)
    expect((await b.searchMail(CTX, { q: 'anything' })).items).toEqual([])
  })
})

describe('folders, snooze and stars (BE-05)', () => {
  const T0 = Date.parse('2026-10-20T12:00:00Z')
  const iso = (ms: number) => new Date(ms).toISOString()

  it('an unknown thread and a foreign-mailbox thread are the same generic 404', () => {
    const state = createCollaborationState()
    const unknown = '00000000-0000-4000-8000-0000000000aa'
    for (const call of [
      () => state.setFolder(unknown, CD.mailboxId, 'archive'),
      () => state.setSnooze(unknown, CD.mailboxId, null),
      () => state.setStar(unknown, CD.mailboxId, true),
      () => state.setFolder(CD.threadId, OUTSIDER, 'archive'),
      () => state.setStar(CD.threadId, OUTSIDER, true),
    ]) {
      expect(thrown(call)).toMatchObject({ status: 404, code: 'not_available' })
    }
  })

  it('accepts a snooze at exactly 60 s and 366 d ahead and rejects just outside the window', () => {
    const state = createCollaborationState()
    expect(state.setSnooze(CD.threadId, CD.mailboxId, iso(T0 + 60_000), T0).snoozed_until).toBe(iso(T0 + 60_000))
    expect(state.setSnooze(CD.threadId, CD.mailboxId, iso(T0 + 366 * 86_400_000), T0).snoozed_until).toBe(iso(T0 + 366 * 86_400_000))
    expect(thrown(() => state.setSnooze(CD.threadId, CD.mailboxId, iso(T0 + 59_000), T0))).toMatchObject({ status: 400, code: 'request_invalid' })
    expect(thrown(() => state.setSnooze(CD.threadId, CD.mailboxId, iso(T0 + 366 * 86_400_000 + 1_000), T0))).toMatchObject({ status: 400, code: 'request_invalid' })
  })

  it('snoozing moves an archived thread back to the inbox; clearing keeps the folder; repeats do not bump versions', () => {
    const state = createCollaborationState()
    const archived = state.setFolder(CD.threadId, CD.mailboxId, 'archive')
    expect(archived).toMatchObject({ folder: 'archive', snoozed_until: null, folder_version: 1 })
    expect(state.setFolder(CD.threadId, CD.mailboxId, 'archive').folder_version).toBe(1)
    const snoozed = state.setSnooze(CD.threadId, CD.mailboxId, iso(T0 + 3_600_000), T0)
    expect(snoozed).toMatchObject({ folder: 'inbox', snoozed_until: iso(T0 + 3_600_000), folder_version: 2 })
    expect(state.setSnooze(CD.threadId, CD.mailboxId, iso(T0 + 3_600_000), T0).folder_version).toBe(2)
    expect(state.setFolder(CD.threadId, CD.mailboxId, 'trash')).toMatchObject({ folder: 'trash', snoozed_until: iso(T0 + 3_600_000), folder_version: 3 })
    expect(state.setSnooze(CD.threadId, CD.mailboxId, null, T0)).toMatchObject({ folder: 'trash', snoozed_until: null, folder_version: 4 })
    expect(state.setStar(CD.threadId, CD.mailboxId, true).star_version).toBe(1)
    expect(state.setStar(CD.threadId, CD.mailboxId, true).star_version).toBe(1)
    expect(state.setStar(CD.threadId, CD.mailboxId, false).star_version).toBe(2)
  })

  it('every server view lists the thread exactly where its confirmed state says', () => {
    const state = createCollaborationState()
    const ids = (filter: Parameters<typeof state.threadsIn>[1], now = T0) => state.threadsIn(CD.mailboxId, filter, now).map((t) => t.id)
    expect(ids('all')).toEqual([CD.threadId])
    expect(ids('unread')).toEqual([CD.threadId])
    expect(ids('starred')).toEqual([])
    state.setStar(CD.threadId, CD.mailboxId, true)
    expect(ids('starred')).toEqual([CD.threadId])
    state.setSnooze(CD.threadId, CD.mailboxId, iso(T0 + 3_600_000), T0)
    expect(ids('all')).toEqual([])
    expect(ids('snoozed')).toEqual([CD.threadId])
    // Once the time passes the thread is back in the inbox views without any write.
    expect(ids('all', T0 + 3_600_001)).toEqual([CD.threadId])
    expect(ids('snoozed', T0 + 3_600_001)).toEqual([])
    state.setFolder(CD.threadId, CD.mailboxId, 'spam')
    expect(ids('spam')).toEqual([CD.threadId])
    expect(ids('starred')).toEqual([])
    expect(ids('all', T0 + 3_600_001)).toEqual([])
    state.setFolder(CD.threadId, CD.mailboxId, 'trash')
    expect(ids('trash')).toEqual([CD.threadId])
    expect(ids('spam')).toEqual([])
  })

  it('the example-backed list path honours the requested view as the C/D path does', async () => {
    const state = createCollaborationState()
    const gateway = createFixtureGateway({}, { state })
    const example = '00000000-0000-4000-8000-000000000021'
    const before = await gateway.listThreads(CTX, example, {})
    const id = before.items[0]?.id
    expect(id).toBeDefined()
    expect((await gateway.listThreads(CTX, example, { filter: 'archive' })).items).toEqual([])
    await gateway.setThreadFolder(CTX, PROOF, id!, { mailbox_id: example, folder: 'archive' })
    expect((await gateway.listThreads(CTX, example, {})).items).toEqual([])
    expect((await gateway.listThreads(CTX, example, { filter: 'archive' })).items.map((t) => t.id)).toEqual([id])
  })
})
