// In-memory BE-02 C/D state for the fixture gateway: draft versions and the operation ledger,
// per-thread read state, assignment, immutable notes, mailbox membership with its mailbox-wide
// revision and last-manager guard, and literal search. It models the contract's observable rules
// (be02-cd-contract.md §4–§9) closely enough for browser/unit proof of CLIENT policy; it is not a
// backend emulator and proves nothing about Rails. Only the dev-fixtures entry and tests load it.
import { matchesView } from '@/domain/threadFolders'
import type {
  Draft,
  DraftOperation,
  DraftSaveInput,
  DraftSaveResult,
  MailboxMember,
  MembershipCapabilities,
  ThreadAssignment,
  ThreadFolder,
  ThreadFolderState,
  ThreadNote,
  ThreadReadState,
  ThreadStarState,
  ThreadSummary,
} from '../contract'
import type { ThreadFilter } from '../gateway'
import { GatewayError, type CollaborationErrorCode } from '../errors'

export const CD_FIXTURE = {
  actorId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000011',
  mailboxId: '00000000-0000-4000-8000-000000000023',
  threadId: '00000000-0000-4000-8000-000000000033',
  readerId: '00000000-0000-4000-8000-000000000003',
  draftId: '00000000-0000-4000-8000-000000000051',
  contextId: 'context_A_0123456789',
  authorizationVersion: 'authz_A_0123456789',
  /** Returned after a self-affecting membership change so the client must re-bootstrap. */
  rotatedAuthorizationVersion: 'authz_A_rotated_0123456789',
  /** Operation ids whose detail has expired: any reuse is 409 operation_mismatch (§5). */
  expiredOperationId: '00000000-0000-4000-8000-000000000069',
  detailLifetimeMs: 604_800_000,
} as const

const NOT_AVAILABLE = 'This item is unavailable.'

function fail(status: number, code: CollaborationErrorCode, message = `Synthetic ${code.replace(/_/g, ' ')}.`): never {
  throw new GatewayError('api', code, message, { status, requestId: 'fixture-cd-state-001' })
}

/** Deterministic synthetic clock: each stored change is one minute after the previous one. */
class Clock {
  private tick = Date.parse('2026-10-13T00:02:00Z')
  next(): string {
    this.tick += 60_000
    return new Date(this.tick).toISOString().replace('.000Z', 'Z')
  }
}

interface LedgerRecord {
  mailboxId: string
  draftId: string
  digest: string
  outcome: Exclude<DraftOperation, { outcome: 'unknown' }>
}

/** Canonical semantic array of the save (§5); JSON.stringify is adequate for the fixture digest. */
function digestOf(draftId: string, input: DraftSaveInput): string {
  return JSON.stringify([
    input.mailbox_id,
    draftId,
    input.expected_version,
    input.subject,
    input.to.map((a) => [a.display_name, a.address]),
    input.body_text,
    input.reply_to_thread_id,
  ])
}

export interface ThreadSeed {
  summary: ThreadSummary
  bodyText: string
}

export interface CollaborationStateOptions {
  /** Threads searchable and readable in the fixture (by thread id), with their plaintext body. */
  threads: ThreadSeed[]
}

export class CollaborationState {
  private readonly clock = new Clock()
  private readonly drafts = new Map<string, Draft>()
  private readonly ledger = new Map<string, LedgerRecord>()
  private readonly readStates = new Map<string, { read: boolean; version: number; updatedAt: string | null }>()
  // BE-05: folder/snooze are mailbox-shared (one entry per thread); stars are the actor's own.
  private readonly folderStates = new Map<string, { folder: ThreadFolder; snoozedUntil: string | null; version: number; updatedAt: string | null }>()
  private readonly stars = new Map<string, { starred: boolean; version: number; updatedAt: string | null }>()
  private readonly assignments = new Map<string, { assigneeId: string | null; version: number; updatedAt: string | null }>()
  private readonly notes = new Map<string, ThreadNote[]>()
  private readonly noteBindings = new Map<string, { threadId: string; mailboxId: string; body: string }>()
  private readonly memberships = new Map<string, { version: number; members: Map<string, MembershipCapabilities> }>()
  private readonly threads: ThreadSeed[]
  /** Set once an authorization-affecting membership change hit the actor; reads carry the rotated version. */
  authorizationVersion: string = CD_FIXTURE.authorizationVersion

  constructor(options: CollaborationStateOptions) {
    this.threads = options.threads
    // Seed: the canonical draft 51 at version 2 with its two applied operations (cd_examples).
    const seeded: Draft = {
      id: CD_FIXTURE.draftId,
      mailbox_id: CD_FIXTURE.mailboxId,
      subject: 'Fixture draft',
      to: [
        { display_name: null, address: null },
        { display_name: 'Fixture recipient', address: 'recipient@example.test' },
      ],
      body_text: 'Draft plaintext <script>alert(1)</script>\nNo remote image: https://example.invalid/pixel\nUnicode: \u{1F4E8}',
      reply_to_thread_id: CD_FIXTURE.threadId,
      version: 2,
      state: 'editable',
      created_at: '2026-10-13T00:00:00Z',
      updated_at: '2026-10-13T00:01:00Z',
    }
    this.drafts.set(seeded.id, seeded)
    this.ledger.set('00000000-0000-4000-8000-000000000061', {
      mailboxId: seeded.mailbox_id,
      draftId: seeded.id,
      digest: digestOf(seeded.id, { mailbox_id: seeded.mailbox_id, operation_id: '00000000-0000-4000-8000-000000000061', expected_version: 0, subject: '', to: [], body_text: '', reply_to_thread_id: null }),
      outcome: {
        operation_id: '00000000-0000-4000-8000-000000000061',
        mailbox_id: seeded.mailbox_id,
        draft_id: seeded.id,
        outcome: 'applied',
        expected_version: 0,
        version: 1,
        state: 'editable',
        recorded_at: '2026-10-13T00:00:00Z',
        detail_expires_at: '2026-10-20T00:00:00Z',
      },
    })
    this.memberships.set(CD_FIXTURE.mailboxId, {
      version: 1,
      members: new Map([[CD_FIXTURE.actorId, { compose: true, approve_send: false, manage_members: true }]]),
    })
  }

  private envelope() {
    return { context_id: CD_FIXTURE.contextId, authorization_version: this.authorizationVersion }
  }

  // --- C: drafts ------------------------------------------------------------------------------

  getDraft(draftId: string, mailboxId: string): Draft {
    const draft = this.drafts.get(draftId)
    if (!draft || draft.mailbox_id !== mailboxId) fail(404, 'not_available', NOT_AVAILABLE)
    return draft
  }

  listDrafts(mailboxId: string): Draft[] {
    return [...this.drafts.values()]
      .filter((d) => d.mailbox_id === mailboxId)
      .sort((a, b) => (a.updated_at === b.updated_at ? (a.id < b.id ? 1 : -1) : a.updated_at < b.updated_at ? 1 : -1))
  }

  saveDraft(draftId: string, input: DraftSaveInput): DraftSaveResult {
    const digest = digestOf(draftId, input)
    if (input.operation_id === CD_FIXTURE.expiredOperationId) fail(409, 'operation_mismatch')
    // Ledger first (§5): an identical retry replays the original outcome even after later saves.
    const record = this.ledger.get(input.operation_id)
    if (record) {
      if (record.draftId !== draftId || record.mailboxId !== input.mailbox_id || record.digest !== digest) fail(409, 'operation_mismatch')
      if (record.outcome.outcome === 'applied') {
        return { draft_id: draftId, operation_id: input.operation_id, version: record.outcome.version, state: 'editable' }
      }
      fail(409, record.outcome.outcome === 'conflict' ? record.outcome.code : 'operation_mismatch')
    }
    const existing = this.drafts.get(draftId)
    if (existing && existing.mailbox_id !== input.mailbox_id) fail(404, 'not_available', NOT_AVAILABLE)
    const recordConflict = (code: 'draft_conflict' | 'draft_consumed'): never => {
      const recordedAt = this.clock.next()
      this.ledger.set(input.operation_id, {
        mailboxId: input.mailbox_id,
        draftId,
        digest,
        outcome: {
          operation_id: input.operation_id,
          mailbox_id: input.mailbox_id,
          draft_id: draftId,
          outcome: 'conflict',
          code,
          expected_version: input.expected_version,
          current_version: existing?.version ?? 0,
          state: existing?.state ?? null,
          recorded_at: recordedAt,
          detail_expires_at: new Date(Date.parse(recordedAt) + CD_FIXTURE.detailLifetimeMs).toISOString().replace('.000Z', 'Z'),
        },
      })
      return fail(409, code)
    }
    if (existing?.state === 'consumed') recordConflict('draft_consumed')
    if (input.expected_version !== (existing?.version ?? 0)) recordConflict('draft_conflict')
    const now = this.clock.next()
    const version = (existing?.version ?? 0) + 1
    this.drafts.set(draftId, {
      id: draftId,
      mailbox_id: input.mailbox_id,
      subject: input.subject,
      to: input.to,
      body_text: input.body_text,
      reply_to_thread_id: input.reply_to_thread_id,
      version,
      state: 'editable',
      created_at: existing?.created_at ?? now,
      updated_at: now,
    })
    this.ledger.set(input.operation_id, {
      mailboxId: input.mailbox_id,
      draftId,
      digest,
      outcome: {
        operation_id: input.operation_id,
        mailbox_id: input.mailbox_id,
        draft_id: draftId,
        outcome: 'applied',
        expected_version: input.expected_version,
        version,
        state: 'editable',
        recorded_at: now,
        detail_expires_at: new Date(Date.parse(now) + CD_FIXTURE.detailLifetimeMs).toISOString().replace('.000Z', 'Z'),
      },
    })
    return { draft_id: draftId, operation_id: input.operation_id, version, state: 'editable' }
  }

  /** Marks an own draft consumed (reserved BE-03 state) so tests can observe the terminal path. */
  markConsumed(draftId: string): void {
    const draft = this.drafts.get(draftId)
    if (draft) this.drafts.set(draftId, { ...draft, state: 'consumed' })
  }

  getOperation(operationId: string, mailboxId: string, draftId: string): DraftOperation {
    const binding = { operation_id: operationId, mailbox_id: mailboxId, draft_id: draftId }
    if (operationId === CD_FIXTURE.expiredOperationId) return { ...binding, outcome: 'expired' }
    const record = this.ledger.get(operationId)
    if (!record) return { ...binding, outcome: 'unknown' }
    // A known own record under a different binding is a generic 404 (§5).
    if (record.mailboxId !== mailboxId || record.draftId !== draftId) fail(404, 'not_available', NOT_AVAILABLE)
    return record.outcome
  }

  // --- D: read state / assignment --------------------------------------------------------------

  readStateFor(threadId: string) {
    return this.readStates.get(threadId) ?? { read: false, version: 0, updatedAt: null }
  }

  setReadState(threadId: string, mailboxId: string, read: boolean): ThreadReadState {
    const current = this.readStateFor(threadId)
    const next = current.read === read ? current : { read, version: current.version + 1, updatedAt: this.clock.next() }
    this.readStates.set(threadId, next)
    return { ...this.envelope(), thread_id: threadId, mailbox_id: mailboxId, read: next.read, read_state_version: next.version, updated_at: next.updatedAt }
  }

  // --- BE-05: folder / snooze / star ------------------------------------------------------------

  /** Shared folder state; a thread that never moved reports its seed folder at version 0. */
  folderStateFor(threadId: string) {
    const seed = this.threadSeed(threadId)
    return this.folderStates.get(threadId) ?? { folder: seed?.summary.folder ?? 'inbox', snoozedUntil: seed?.summary.snoozed_until ?? null, version: 0, updatedAt: null }
  }

  starFor(threadId: string) {
    const seed = this.threadSeed(threadId)
    return this.stars.get(threadId) ?? { starred: seed?.summary.starred ?? false, version: 0, updatedAt: null }
  }

  private folderResponse(threadId: string, mailboxId: string): ThreadFolderState {
    const s = this.folderStateFor(threadId)
    return { ...this.envelope(), thread_id: threadId, mailbox_id: mailboxId, folder: s.folder, snoozed_until: s.snoozedUntil, folder_version: s.version, updated_at: s.updatedAt }
  }

  setFolder(threadId: string, mailboxId: string, folder: ThreadFolder): ThreadFolderState {
    this.requireThread(threadId, mailboxId)
    const current = this.folderStateFor(threadId)
    // A folder move leaves the snooze alone (contract: snooze untouched).
    const next = current.folder === folder ? current : { ...current, folder, version: current.version + 1, updatedAt: this.clock.next() }
    this.folderStates.set(threadId, next)
    return this.folderResponse(threadId, mailboxId)
  }

  /** Mirrors the server window: a non-null time must be 60 s .. 366 d after "now" (the real clock here). */
  setSnooze(threadId: string, mailboxId: string, snoozedUntil: string | null, now = Date.now()): ThreadFolderState {
    this.requireThread(threadId, mailboxId)
    if (snoozedUntil !== null) {
      const at = Date.parse(snoozedUntil)
      if (!(at >= now + 60_000 && at <= now + 366 * 86_400_000)) fail(400, 'request_invalid', 'Synthetic snooze time outside the allowed window.')
    }
    const current = this.folderStateFor(threadId)
    // Snoozing returns the thread to the inbox so it reappears there; clearing keeps the folder.
    const folder = snoozedUntil === null ? current.folder : 'inbox'
    const unchanged = current.snoozedUntil === snoozedUntil && current.folder === folder
    const next = unchanged ? current : { folder, snoozedUntil, version: current.version + 1, updatedAt: this.clock.next() }
    this.folderStates.set(threadId, next)
    return this.folderResponse(threadId, mailboxId)
  }

  setStar(threadId: string, mailboxId: string, starred: boolean): ThreadStarState {
    this.requireThread(threadId, mailboxId)
    const current = this.starFor(threadId)
    const next = current.starred === starred ? current : { starred, version: current.version + 1, updatedAt: this.clock.next() }
    this.stars.set(threadId, next)
    return { ...this.envelope(), thread_id: threadId, mailbox_id: mailboxId, starred: next.starred, star_version: next.version, updated_at: next.updatedAt }
  }

  /** A thread outside the stated mailbox is the generic 404, like every foreign relation. */
  /** Unknown and foreign threads share the generic 404 so existence never leaks across mailboxes. */
  private requireThread(threadId: string, mailboxId: string): void {
    const seed = this.threadSeed(threadId)
    if (!seed || seed.summary.mailbox_id !== mailboxId) fail(404, 'not_available', NOT_AVAILABLE)
  }

  /** Seed summary with the actor's read/star state and the shared folder state applied. */
  private decorate(seed: ThreadSeed): ThreadSummary {
    const folder = this.folderStateFor(seed.summary.id)
    return { ...seed.summary, unread: !this.readStateFor(seed.summary.id).read, folder: folder.folder, snoozed_until: folder.snoozedUntil, starred: this.starFor(seed.summary.id).starred }
  }

  /** The server's folder-view predicate (contract filter description), evaluated at `now`. */
  /** Same rule as the UI: the fixture filter is the domain `matchesView` so the two never drift. */
  static matchesFilter(t: ThreadSummary, filter: ThreadFilter, now = Date.now()): boolean {
    return matchesView(t, filter, now)
  }

  getAssignment(threadId: string, mailboxId: string): ThreadAssignment {
    const a = this.assignments.get(threadId) ?? { assigneeId: null, version: 0, updatedAt: null }
    return { ...this.envelope(), thread_id: threadId, mailbox_id: mailboxId, assignee_id: a.assigneeId, assignment_version: a.version, updated_at: a.updatedAt }
  }

  // AIDEV-NOTE: The picker and assignment writes share the fixture's two eligible organization members.
  assigneeIds(): string[] {
    return [CD_FIXTURE.actorId, CD_FIXTURE.readerId]
  }

  setAssignment(threadId: string, mailboxId: string, assigneeId: string | null, expectedVersion: number): ThreadAssignment {
    const current = this.assignments.get(threadId) ?? { assigneeId: null, version: 0, updatedAt: null }
    // Only current members of the fixture organization are eligible targets (§6).
    if (assigneeId !== null && !this.assigneeIds().includes(assigneeId)) fail(404, 'not_available', NOT_AVAILABLE)
    if (expectedVersion !== current.version) fail(409, 'assignment_conflict')
    const next = current.assigneeId === assigneeId ? current : { assigneeId, version: current.version + 1, updatedAt: this.clock.next() }
    this.assignments.set(threadId, next)
    return this.getAssignment(threadId, mailboxId)
  }

  // --- D: notes ---------------------------------------------------------------------------------

  listNotes(threadId: string): ThreadNote[] {
    return [...(this.notes.get(threadId) ?? [])]
  }

  createNote(threadId: string, mailboxId: string, noteId: string, bodyText: string): { note: ThreadNote; replayed: boolean } {
    const bound = this.noteBindings.get(noteId)
    if (bound) {
      if (bound.threadId !== threadId || bound.mailboxId !== mailboxId || bound.body !== bodyText) fail(409, 'operation_mismatch')
      const note = this.notes.get(threadId)?.find((n) => n.id === noteId)
      if (!note) fail(404, 'not_available', NOT_AVAILABLE)
      return { note, replayed: true }
    }
    const note: ThreadNote = { id: noteId, author_id: CD_FIXTURE.actorId, body_text: bodyText, version: 1, created_at: this.clock.next() }
    this.noteBindings.set(noteId, { threadId, mailboxId, body: bodyText })
    this.notes.set(threadId, [...(this.notes.get(threadId) ?? []), note])
    return { note, replayed: false }
  }

  // --- D: membership ----------------------------------------------------------------------------

  private roster(mailboxId: string) {
    let roster = this.memberships.get(mailboxId)
    if (!roster) {
      roster = { version: 1, members: new Map([[CD_FIXTURE.actorId, { compose: false, approve_send: false, manage_members: true }]]) }
      this.memberships.set(mailboxId, roster)
    }
    return roster
  }

  listMembers(mailboxId: string): { version: number; items: MailboxMember[] } {
    const roster = this.roster(mailboxId)
    const items = [...roster.members.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([user_id, capabilities]) => ({ user_id, capabilities }))
    return { version: roster.version, items }
  }

  private managerCount(roster: { members: Map<string, MembershipCapabilities> }): number {
    return [...roster.members.values()].filter((c) => c.manage_members).length
  }

  putMember(mailboxId: string, userId: string, expectedVersion: number, capabilities: MembershipCapabilities): { version: number; member: MailboxMember } {
    // Targets must be current organization members (§8); the fixture knows two.
    if (userId !== CD_FIXTURE.actorId && userId !== CD_FIXTURE.readerId) fail(404, 'not_available', NOT_AVAILABLE)
    const roster = this.roster(mailboxId)
    if (expectedVersion !== roster.version) fail(409, 'membership_conflict')
    const current = roster.members.get(userId)
    const unchanged = current !== undefined && current.compose === capabilities.compose && current.approve_send === capabilities.approve_send && current.manage_members === capabilities.manage_members
    if (!unchanged) {
      if (current?.manage_members && !capabilities.manage_members && this.managerCount(roster) === 1) fail(409, 'membership_conflict')
      roster.members.set(userId, { ...capabilities })
      roster.version += 1
      if (userId === CD_FIXTURE.actorId) this.authorizationVersion = CD_FIXTURE.rotatedAuthorizationVersion
    }
    return { version: roster.version, member: { user_id: userId, capabilities: { ...capabilities } } }
  }

  deleteMember(mailboxId: string, userId: string, expectedVersion: number): { version: number } {
    if (userId !== CD_FIXTURE.actorId && userId !== CD_FIXTURE.readerId) fail(404, 'not_available', NOT_AVAILABLE)
    const roster = this.roster(mailboxId)
    if (expectedVersion !== roster.version) fail(409, 'membership_conflict')
    const current = roster.members.get(userId)
    if (current) {
      if (current.manage_members && this.managerCount(roster) === 1) fail(409, 'membership_conflict')
      roster.members.delete(userId)
      roster.version += 1
      if (userId === CD_FIXTURE.actorId) this.authorizationVersion = CD_FIXTURE.rotatedAuthorizationVersion
    }
    return { version: roster.version }
  }

  // --- D: search --------------------------------------------------------------------------------

  /** Literal case-insensitive substring over subject, preview/body, sender name and address (§9). */
  search(q: string, mailboxId: string | undefined): ThreadSummary[] {
    const needle = q.toLowerCase()
    return this.threads
      .filter((t) => mailboxId === undefined || t.summary.mailbox_id === mailboxId)
      .filter((t) => {
        const fields = [t.summary.subject, t.summary.preview_text, t.bodyText, t.summary.sender?.display_name, t.summary.sender?.address]
        return fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(needle))
      })
      .map((t) => this.decorate(t))
      // Search never surfaces spam or trash (contract 1.0.0-folders.1).
      .filter((t) => t.folder !== 'spam' && t.folder !== 'trash')
  }

  /** Thread rows for a fixture mailbox in one server folder view, with read/star/folder state applied. */
  threadsIn(mailboxId: string, filter: ThreadFilter = 'all', now = Date.now()): ThreadSummary[] {
    return this.threads
      .filter((t) => t.summary.mailbox_id === mailboxId)
      .map((t) => this.decorate(t))
      .filter((t) => CollaborationState.matchesFilter(t, filter, now))
  }

  threadSeed(threadId: string): ThreadSeed | undefined {
    return this.threads.find((t) => t.summary.id === threadId)
  }
}
