// Development/test gateway over the canonical fixtures. This module and its data are only
// reachable from the dev-fixtures entry point and tests; production builds exclude them and no
// runtime failure may fall back here (contract README, R5).
//
// AIDEV-NOTE: A/B reads and the A lifecycle answer from static examples; BE-02 C/D operations run
// over CollaborationState so versions, ledger replay, read state, notes and membership behave
// like the contract across calls. A script entry for a C/D operation (an example or error name)
// overrides the state for that operation, which is how tests force 409/503/expired outcomes.
import fixtures from '../../../../../contracts/v1/fixtures.json'
import type { z } from 'zod'
import { GatewayError } from '../errors'
import {
  AuthAcceptedSchema,
  AuthChallengeSchema,
  AuthLifecycleSchema,
  AuthLogoutSchema,
  CollaborationErrorSchema,
  DraftOperationResponseSchema,
  DraftPageSchema,
  DraftResponseSchema,
  DraftSaveResultSchema,
  ErrorSchema,
  MailboxMemberPageSchema,
  MailboxMembershipResultSchema,
  MailboxPageSchema,
  OrganizationPageSchema,
  SearchPageSchema,
  SessionSchema,
  ThreadAssignmentSchema,
  ThreadDetailPageSchema,
  ThreadNotePageSchema,
  ThreadNoteResponseSchema,
  ThreadPageSchema,
  ThreadReadStateSchema,
  type ThreadSummary,
} from '../contract'
import type { MailroomGateway } from '../gateway'
import { CD_FIXTURE, CollaborationState, type ThreadSeed } from './collaborationState'

type Operation =
  | 'getSession'
  | 'listMailboxes'
  | 'listThreads'
  | 'getThread'
  | 'getLoginChallenge'
  | 'login'
  | 'requestRecovery'
  | 'acceptAuthEntry'
  | 'refreshSession'
  | 'logout'
  | 'listOrganizations'
  | 'switchOrganization'
  | 'getDraft'
  | 'saveDraft'
  | 'listDrafts'
  | 'getDraftOperation'
  | 'setThreadReadState'
  | 'getThreadAssignment'
  | 'setThreadAssignment'
  | 'listThreadNotes'
  | 'createThreadNote'
  | 'listMailboxMembers'
  | 'putMailboxMember'
  | 'deleteMailboxMember'
  | 'searchMail'

export interface FixtureScript {
  /** Fixture example name per operation; an Error example raises the matching GatewayError. */
  [operation: string]: string | undefined
}

// AIDEV-NOTE: The default refresh fails like an absent cookie (401), so a scripted 401 bootstrap
// lands on the sign-in screen after exactly one refresh attempt; login/accept/switch succeed
// with the canonical sessions. Tests script other outcomes explicitly.
const DEFAULTS: Record<Exclude<Operation, CdOperation>, string> = {
  getSession: 'session_a',
  listMailboxes: 'mailboxes_collaboration',
  listThreads: 'threads',
  getThread: 'thread_hostile_plaintext',
  getLoginChallenge: 'challenge',
  login: 'lifecycle_a',
  requestRecovery: 'recovery_accepted',
  acceptAuthEntry: 'lifecycle_a',
  refreshSession: 'unauthenticated',
  logout: 'logout_pending',
  listOrganizations: 'organizations',
  switchOrganization: 'lifecycle_b',
}

type CdOperation =
  | 'getDraft'
  | 'saveDraft'
  | 'listDrafts'
  | 'getDraftOperation'
  | 'setThreadReadState'
  | 'getThreadAssignment'
  | 'setThreadAssignment'
  | 'listThreadNotes'
  | 'createThreadNote'
  | 'listMailboxMembers'
  | 'putMailboxMember'
  | 'deleteMailboxMember'
  | 'searchMail'

interface Example {
  status: number
  body: unknown
}

const readExamples = fixtures.examples as Record<string, Example | undefined>
const lifecycleExamples = fixtures.lifecycle_examples as Record<string, { value: unknown } | undefined>
// The C/D namespace arrives with the collaboration.1 copy of fixtures.json; read it defensively so
// this module compiles against both contract versions.
const cdExamples = ((fixtures as Record<string, unknown>)['cd_examples'] ?? {}) as Record<string, Example | undefined>

// Synthetic lifecycle examples derived from the canonical sessions. fixtures.json (coordinator
// owned) carries only challenge/recovery/logout values; these stay schema-validated on use.
function sessionExample(name: string): Record<string, unknown> {
  return (readExamples[name]?.body ?? {}) as Record<string, unknown>
}
function organizationPage(items: unknown[]): Example {
  const session = sessionExample('session_a')
  return { status: 200, body: { context_id: session['context_id'], authorization_version: session['authorization_version'], next_cursor: null, items } }
}
/** The C/D fixture mailbox (compose + manage_members) appended after the canonical read-only inbox. */
const CD_MAILBOX = {
  id: CD_FIXTURE.mailboxId,
  display_name: 'C/D fixture mailbox',
  display_address: 'collaboration@example.test',
  capabilities: { read: true, compose: true, approve_send: false, manage_members: true },
}
function mailboxesWithCollaboration(): Example {
  const canonical = readExamples['mailboxes']?.body as { items?: unknown[] } & Record<string, unknown>
  return { status: 200, body: { ...canonical, items: [...(canonical.items ?? []), CD_MAILBOX] } }
}
const SYNTHETIC: Record<string, Example> = {
  lifecycle_a: { status: 200, body: { session: sessionExample('session_a'), access_expires_at: '2026-10-13T01:00:00Z' } },
  lifecycle_b: { status: 200, body: { session: sessionExample('session_b'), access_expires_at: '2026-10-13T01:00:00Z' } },
  organizations: organizationPage([sessionExample('session_a')['organization'], sessionExample('session_b')['organization']]),
  organizations_empty: organizationPage([]),
  mailboxes_collaboration: mailboxesWithCollaboration(),
}

function example(name: string): Example {
  const read = readExamples[name]
  if (read) return read
  const lifecycle = lifecycleExamples[name]
  if (lifecycle) return { status: name === 'recovery_accepted' ? 202 : 200, body: lifecycle.value }
  const synthetic = SYNTHETIC[name]
  if (synthetic) return synthetic
  const cd = cdExamples[name]
  if (cd) return cd
  throw new Error(`Unknown fixture example: ${name}`)
}

function throwExampleError(name: string, data: Example): never {
  const result = CollaborationErrorSchema.safeParse(data.body)
  if (!result.success) throw new GatewayError('transport', 'malformed', `Fixture ${name} does not match the error contract.`)
  const body = result.data
  throw new GatewayError('api', body.code, body.message, { status: data.status, requestId: body.request_id })
}

function resolve<S extends z.ZodType>(operation: Operation, script: FixtureScript, schema: S, fallback?: string): z.output<S> {
  const name = script[operation] ?? fallback ?? (DEFAULTS as Record<string, string | undefined>)[operation]
  if (name === undefined) throw new Error(`No fixture example for ${operation}`)
  const data = example(name)
  if (data.status >= 400) {
    // A/B errors must still satisfy the narrow Error enum; C/D examples carry the wider one.
    if (operation in DEFAULTS) {
      const result = ErrorSchema.safeParse(data.body)
      if (!result.success) throw new GatewayError('transport', 'malformed', `Fixture ${name} does not match the error contract.`)
      throw new GatewayError('api', result.data.code, result.data.message, { status: data.status, requestId: result.data.request_id })
    }
    throwExampleError(name, data)
  }
  // AIDEV-NOTE: Passing each concrete schema preserves its output type and the HTTP boundary validation.
  const parsed = schema.safeParse(data.body)
  if (!parsed.success) throw new GatewayError('transport', 'malformed', `Fixture ${name} does not match the contract.`)
  return parsed.data
}

// AIDEV-NOTE: An already-aborted caller signal rejects like the HTTP adapter ('aborted', before
// work). Resolution is otherwise synchronous, so a later abort is the caller's post-await concern
// (D4); tests that need an abort-IGNORING gateway override individual methods instead.
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new GatewayError('transport', 'aborted', 'The request was cancelled.')
}

/** Threads the stateful fixture knows: the canonical inbox thread plus the C/D mailbox thread. */
function threadSeeds(): ThreadSeed[] {
  const canonical = ThreadPageSchema.safeParse(readExamples['threads']?.body)
  const detail = ThreadDetailPageSchema.safeParse(readExamples['thread_hostile_plaintext']?.body)
  const seeds: ThreadSeed[] = []
  if (canonical.success) {
    for (const summary of canonical.data.items) {
      const body = detail.success && detail.data.thread.id === summary.id ? (detail.data.messages[0]?.body_text ?? '') : ''
      seeds.push({ summary, bodyText: body })
    }
  }
  const cdThread: ThreadSummary = {
    id: CD_FIXTURE.threadId,
    mailbox_id: CD_FIXTURE.mailboxId,
    subject: 'Synthetic thread',
    subject_truncated: false,
    sender: { display_name: 'Fixture sender', address: 'sender@example.test' },
    preview_text: '<img src="https://example.invalid/pixel"> & plaintext',
    last_message_at: '2026-10-13T00:00:00Z',
    unread: true,
    message_count: 1,
  }
  seeds.push({ summary: cdThread, bodyText: '<img src="https://example.invalid/pixel"> & plaintext body of the C/D fixture thread.' })
  return seeds
}

export interface FixtureGatewayOptions {
  /** Shared state so a test can seed or inspect C/D behaviour; a fresh state per gateway otherwise. */
  state?: CollaborationState
}

export function createCollaborationState(): CollaborationState {
  return new CollaborationState({ threads: threadSeeds() })
}

export function createFixtureGateway(script: FixtureScript = {}, options: FixtureGatewayOptions = {}): MailroomGateway {
  const state = options.state ?? createCollaborationState()
  const envelope = () => ({ context_id: CD_FIXTURE.contextId, authorization_version: state.authorizationVersion })
  /** Scripted C/D operations answer from the example; otherwise the state decides. */
  const scripted = <S extends z.ZodType>(operation: CdOperation, schema: S): z.output<S> | undefined =>
    script[operation] === undefined ? undefined : resolve(operation, script, schema)
  /** State results still cross the same boundary validation as HTTP responses. */
  const validated = <S extends z.ZodType>(schema: S, value: unknown): z.output<S> => {
    const parsed = schema.safeParse(value)
    if (!parsed.success) throw new GatewayError('transport', 'malformed', 'Fixture state produced data that does not match the contract.')
    return parsed.data
  }

  return {
    getSession: async (signal) => {
      throwIfAborted(signal)
      return resolve('getSession', script, SessionSchema)
    },
    listMailboxes: async (_ctx, _query, signal) => {
      throwIfAborted(signal)
      return resolve('listMailboxes', script, MailboxPageSchema)
    },
    listThreads: async (_ctx, mailboxId, query, signal) => {
      throwIfAborted(signal)
      if (script['listThreads'] === undefined && mailboxId === CD_FIXTURE.mailboxId) {
        const items = state.threadsIn(mailboxId).filter((t) => query.filter !== 'unread' || t.unread)
        return validated(ThreadPageSchema, { ...envelope(), next_cursor: null, mailbox_id: mailboxId, items })
      }
      const page = resolve('listThreads', script, ThreadPageSchema)
      // The actor's explicit read state is the exact inverse of B unread (§6).
      return { ...page, items: page.items.map((t) => ({ ...t, unread: state.readStateFor(t.id).version === 0 ? t.unread : !state.readStateFor(t.id).read })) }
    },
    getThread: async (_ctx, threadId, mailboxId, _query, signal) => {
      throwIfAborted(signal)
      const seed = script['getThread'] === undefined ? state.threadSeed(threadId) : undefined
      if (seed && seed.summary.mailbox_id === CD_FIXTURE.mailboxId && mailboxId === CD_FIXTURE.mailboxId) {
        const unread = !state.readStateFor(threadId).read
        return validated(ThreadDetailPageSchema, {
          ...envelope(),
          next_cursor: null,
          thread: { id: threadId, mailbox_id: mailboxId, subject: seed.summary.subject, subject_truncated: false, unread, message_count: 1 },
          messages: [{ id: '00000000-0000-4000-8000-000000000133', sender: seed.summary.sender, to: [], sent_at: seed.summary.last_message_at, body_text: seed.bodyText, body_truncated: false, attachment_count: 0 }],
        })
      }
      return resolve('getThread', script, ThreadDetailPageSchema)
    },
    getLoginChallenge: async (signal) => {
      throwIfAborted(signal)
      return resolve('getLoginChallenge', script, AuthChallengeSchema)
    },
    login: async (_proof, _input, signal) => {
      throwIfAborted(signal)
      return resolve('login', script, AuthLifecycleSchema)
    },
    requestRecovery: async (_proof, _input, signal) => {
      throwIfAborted(signal)
      return resolve('requestRecovery', script, AuthAcceptedSchema)
    },
    acceptAuthEntry: async (_proof, _input, signal) => {
      throwIfAborted(signal)
      return resolve('acceptAuthEntry', script, AuthLifecycleSchema)
    },
    refreshSession: async (_proof, signal) => {
      throwIfAborted(signal)
      return resolve('refreshSession', script, AuthLifecycleSchema)
    },
    logout: async (_proof, _input, signal) => {
      throwIfAborted(signal)
      return resolve('logout', script, AuthLogoutSchema)
    },
    listOrganizations: async (_ctx, _query, signal) => {
      throwIfAborted(signal)
      return resolve('listOrganizations', script, OrganizationPageSchema)
    },
    switchOrganization: async (_ctx, _proof, _input, signal) => {
      throwIfAborted(signal)
      return resolve('switchOrganization', script, AuthLifecycleSchema)
    },

    // --- BE-02 C: drafts (stateful) --------------------------------------------------------
    getDraft: async (_ctx, draftId, mailboxId, signal) => {
      throwIfAborted(signal)
      return scripted('getDraft', DraftResponseSchema) ?? validated(DraftResponseSchema, { ...envelope(), draft: state.getDraft(draftId, mailboxId) })
    },
    saveDraft: async (_ctx, _proof, draftId, input, signal) => {
      throwIfAborted(signal)
      return scripted('saveDraft', DraftSaveResultSchema) ?? validated(DraftSaveResultSchema, state.saveDraft(draftId, input))
    },
    listDrafts: async (_ctx, mailboxId, _query, signal) => {
      throwIfAborted(signal)
      const items = state.listDrafts(mailboxId).map((d) => {
        const points = [...d.subject]
        return { id: d.id, mailbox_id: d.mailbox_id, subject: points.slice(0, 256).join(''), subject_truncated: points.length > 256, reply_to_thread_id: d.reply_to_thread_id, version: d.version, state: d.state, updated_at: d.updated_at }
      })
      return scripted('listDrafts', DraftPageSchema) ?? validated(DraftPageSchema, { ...envelope(), mailbox_id: mailboxId, next_cursor: null, items })
    },
    getDraftOperation: async (_ctx, operationId, mailboxId, draftId, signal) => {
      throwIfAborted(signal)
      return scripted('getDraftOperation', DraftOperationResponseSchema) ?? validated(DraftOperationResponseSchema, { ...envelope(), operation: state.getOperation(operationId, mailboxId, draftId) })
    },

    // --- BE-02 D (stateful) -----------------------------------------------------------------
    setThreadReadState: async (_ctx, _proof, threadId, input, signal) => {
      throwIfAborted(signal)
      return scripted('setThreadReadState', ThreadReadStateSchema) ?? validated(ThreadReadStateSchema, state.setReadState(threadId, input.mailbox_id, input.read))
    },
    getThreadAssignment: async (_ctx, threadId, mailboxId, signal) => {
      throwIfAborted(signal)
      return scripted('getThreadAssignment', ThreadAssignmentSchema) ?? validated(ThreadAssignmentSchema, state.getAssignment(threadId, mailboxId))
    },
    setThreadAssignment: async (_ctx, _proof, threadId, input, signal) => {
      throwIfAborted(signal)
      return scripted('setThreadAssignment', ThreadAssignmentSchema) ?? validated(ThreadAssignmentSchema, state.setAssignment(threadId, input.mailbox_id, input.assignee_id, input.expected_assignment_version))
    },
    listThreadNotes: async (_ctx, threadId, mailboxId, _query, signal) => {
      throwIfAborted(signal)
      return scripted('listThreadNotes', ThreadNotePageSchema) ?? validated(ThreadNotePageSchema, { ...envelope(), thread_id: threadId, mailbox_id: mailboxId, next_cursor: null, items: state.listNotes(threadId) })
    },
    createThreadNote: async (_ctx, _proof, threadId, input, signal) => {
      throwIfAborted(signal)
      const scriptedResponse = scripted('createThreadNote', ThreadNoteResponseSchema)
      if (scriptedResponse) return { response: scriptedResponse, replayed: script['createThreadNote'] === 'note_replayed' }
      const { note, replayed } = state.createNote(threadId, input.mailbox_id, input.note_id, input.body_text)
      return { response: validated(ThreadNoteResponseSchema, { ...envelope(), thread_id: threadId, mailbox_id: input.mailbox_id, note }), replayed }
    },
    listMailboxMembers: async (_ctx, mailboxId, _query, signal) => {
      throwIfAborted(signal)
      const { version, items } = state.listMembers(mailboxId)
      return scripted('listMailboxMembers', MailboxMemberPageSchema) ?? validated(MailboxMemberPageSchema, { ...envelope(), mailbox_id: mailboxId, membership_version: version, next_cursor: null, items })
    },
    putMailboxMember: async (_ctx, _proof, mailboxId, userId, input, signal) => {
      throwIfAborted(signal)
      const scriptedResult = scripted('putMailboxMember', MailboxMembershipResultSchema)
      if (scriptedResult) return scriptedResult
      const { version, member } = state.putMember(mailboxId, userId, input.expected_membership_version, input.capabilities)
      return validated(MailboxMembershipResultSchema, { ...envelope(), mailbox_id: mailboxId, user_id: userId, membership_version: version, member })
    },
    deleteMailboxMember: async (_ctx, _proof, mailboxId, userId, expectedMembershipVersion, signal) => {
      throwIfAborted(signal)
      const scriptedResult = scripted('deleteMailboxMember', MailboxMembershipResultSchema)
      if (scriptedResult) return scriptedResult
      const { version } = state.deleteMember(mailboxId, userId, expectedMembershipVersion)
      return validated(MailboxMembershipResultSchema, { ...envelope(), mailbox_id: mailboxId, user_id: userId, membership_version: version, member: null })
    },
    searchMail: async (_ctx, query, signal) => {
      throwIfAborted(signal)
      return scripted('searchMail', SearchPageSchema) ?? validated(SearchPageSchema, { ...envelope(), q: query.q, mailbox_id: query.mailbox_id ?? null, next_cursor: null, items: state.search(query.q, query.mailbox_id) })
    },
  }
}
