// Runtime boundary validation for contracts/v1/openapi.json version 1.0.0-collaboration.1 (schema
// SHA-256 859041382484a3a001ae087ca88e02eeb23540f2cf46aec795b064aa8ea66073; the generated types
// are coordinator-owned and copied into ./generated/api.d.ts). The A/B and session schemas are
// byte-identical to 1.0.0-session.1; C/D adds the collaboration section at the end of this file.
// These Zod schemas enforce the same bounds at runtime and must not drift from the generated types.
// AIDEV-NOTE: contract.test.ts pins z.infer of each schema to the generated component type both ways.
import { z } from 'zod'
import type { components } from './generated/api'
import { API_ERROR_CODES, COLLABORATION_ERROR_CODES } from './errors'

// AIDEV-NOTE: JSON Schema maxLength counts Unicode CODE POINTS; Zod .max counts UTF-16 units and
// would reject contract-legal astral text (256 emoji = 512 units). Every unconstrained string
// field uses this counting — cursors and request ids included, since the contract gives them no
// ASCII pattern; only opaqueToken keeps .max, where its regex makes units equal points. Minimums
// are preserved unchanged (non-empty is identical in both countings).
const codePointMax = (max: number) => (value: string) => {
  const iterator = value[Symbol.iterator]()
  let count = 0
  while (!iterator.next().done) {
    count += 1
    if (count > max) return false
  }
  return true
}
const text = (max: number) => z.string().refine(codePointMax(max), { message: `Must be at most ${max} Unicode code points` })

const opaqueToken = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/)
const id = z.uuid()
const utcTimestamp = z.iso.datetime()
const cursor = z.string().min(1).refine(codePointMax(2048), { message: 'Must be at most 2048 Unicode code points' })

export const AddressSchema = z.strictObject({
  display_name: text(256).nullable(),
  address: text(256).nullable(),
})

export const CapabilitiesSchema = z.strictObject({
  read: z.literal(true),
  compose: z.boolean(),
  approve_send: z.boolean(),
  manage_members: z.boolean(),
})

export const MailboxSchema = z.strictObject({
  id,
  display_name: text(256),
  display_address: text(256).nullable(),
  capabilities: CapabilitiesSchema,
})

export const SessionSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  actor: z.strictObject({ id, display_name: text(256).nullable() }),
  organization: z.strictObject({ id, name: text(256) }),
  simulation_mode: z.literal(true),
  csrf_token: opaqueToken,
})

export const MailboxPageSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  next_cursor: cursor.nullable(),
  items: z.array(MailboxSchema).max(50),
})

export const ThreadSummarySchema = z.strictObject({
  id,
  mailbox_id: id,
  subject: text(256).nullable(),
  subject_truncated: z.boolean(),
  sender: AddressSchema.nullable(),
  preview_text: text(256),
  last_message_at: utcTimestamp.nullable(),
  unread: z.boolean(),
  message_count: z.number().int().min(0).max(2147483647),
})

export const ThreadPageSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  next_cursor: cursor.nullable(),
  mailbox_id: id,
  items: z.array(ThreadSummarySchema).max(50),
})

export const MessageSchema = z.strictObject({
  id,
  sender: AddressSchema.nullable(),
  to: z.array(AddressSchema).max(100),
  sent_at: utcTimestamp.nullable(),
  body_text: text(16384),
  body_truncated: z.boolean(),
  attachment_count: z.number().int().min(0).max(1000),
})

export const ThreadDetailPageSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  next_cursor: cursor.nullable(),
  thread: z.strictObject({
    id,
    mailbox_id: id,
    subject: text(998).nullable(),
    subject_truncated: z.boolean(),
    unread: z.boolean(),
    message_count: z.number().int().min(0).max(2147483647),
  }),
  messages: z.array(MessageSchema).max(20),
})

export const ErrorSchema = z.strictObject({
  code: z.enum(API_ERROR_CODES),
  message: text(256),
  request_id: z.string().min(1).refine(codePointMax(128), { message: 'Must be at most 128 Unicode code points' }),
})

// --- BE-02A session lifecycle (responses) ---------------------------------------------------
// AIDEV-NOTE: Lifecycle successes embed the unchanged Session; the UI treats them exactly like a
// session bootstrap (D2/D3) and never stores csrf/challenge proofs outside component memory.

export const AuthChallengeSchema = z.strictObject({
  csrf_token: opaqueToken,
  expires_at: utcTimestamp,
})

export const AuthLifecycleSchema = z.strictObject({
  session: SessionSchema,
  access_expires_at: utcTimestamp,
})

export const AuthAcceptedSchema = z.strictObject({ accepted: z.literal(true) })

export const AuthLogoutSchema = z.strictObject({
  local_revoked: z.literal(true),
  upstream_status: z.enum(['complete', 'pending']),
})

export const OrganizationSchema = z.strictObject({ id, name: text(256) })

export const OrganizationPageSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  next_cursor: cursor.nullable(),
  items: z.array(OrganizationSchema).max(50),
})

// --- BE-02A session lifecycle (browser-validated inputs) ------------------------------------
// AIDEV-NOTE: Inputs are validated before any request so a malformed value never leaves the
// browser; the server re-validates. Passwords are bounded by UTF-8 BYTES (x-max-utf8-bytes), the
// entry minimum (12) counts code points per the configured Auth policy. Nothing here logs values.
const utf8ByteMax = (max: number) => (value: string) => new TextEncoder().encode(value).byteLength <= max
const email = z.email().min(1).max(320)
const password = z.string().min(1).refine(utf8ByteMax(1024), { message: 'Must be at most 1024 UTF-8 bytes' })

export const LoginInputSchema = z.strictObject({ email, password })
export const RecoveryInputSchema = z.strictObject({ email })
export const AcceptInputSchema = z.strictObject({
  password: password.refine(codePointMax(1024), { message: 'Must be at most 1024 characters' }).refine((value) => !codePointMax(11)(value), { message: 'Must be at least 12 characters' }),
})
export const RefreshInputSchema = z.strictObject({})
export const LogoutInputSchema = z.strictObject({ scope: z.enum(['local', 'global']) })
export const OrganizationInputSchema = z.strictObject({ organization_id: id })

export type AuthChallenge = components['schemas']['AuthChallenge']
export type AuthLifecycle = components['schemas']['AuthLifecycle']
export type AuthAccepted = components['schemas']['AuthAccepted']
export type AuthLogout = components['schemas']['AuthLogout']
export type Organization = components['schemas']['Organization']
export type OrganizationPage = components['schemas']['OrganizationPage']
export type LoginInput = components['schemas']['LoginInput']
export type RecoveryInput = components['schemas']['RecoveryInput']
export type AcceptInput = components['schemas']['AcceptInput']
export type RefreshInput = components['schemas']['RefreshInput']
export type LogoutInput = components['schemas']['LogoutInput']
export type OrganizationInput = components['schemas']['OrganizationInput']

export type Session = components['schemas']['Session']
export type Mailbox = components['schemas']['Mailbox']
export type MailboxPage = components['schemas']['MailboxPage']
export type ThreadSummary = components['schemas']['ThreadSummary']
export type ThreadPage = components['schemas']['ThreadPage']
export type Message = components['schemas']['Message']
export type ThreadDetailPage = components['schemas']['ThreadDetailPage']
export type ApiError = components['schemas']['Error']

/** Maximum serialized UTF-8 JSON bytes per endpoint, from the canonical contract. */
export const MAX_BYTES = {
  session: 16_384,
  mailboxes: 131_072,
  threads: 262_144,
  thread: 2_097_152,
  error: 4_096,
  // BE-02A lifecycle (x-max-response-bytes per operation).
  challenge: 1_024,
  lifecycle: 20_480,
  accepted: 4_096,
  logout: 4_096,
  organizations: 131_072,
} as const
/** Maximum serialized UTF-8 JSON request bytes for lifecycle POSTs (x-max-request-bytes). */
export const MAX_REQUEST_BYTES = 8_192
export const PAGE_LIMITS = { list: 50, messages: 20 } as const

// --- BE-02 C/D collaboration (responses) ----------------------------------------------------
// AIDEV-NOTE: Every C/D object is closed (strictObject) with all fields required; nullable fields
// are explicit nulls. ResourceVersion is a server-owned revision 0..2^31-1. Code-point counting
// (text) applies to every bounded string, so astral subjects/bodies at the limit stay valid.

const resourceVersion = z.number().int().min(0).max(2147483647)
const draftState = z.enum(['editable', 'consumed'])
const requestId = z.string().min(1).refine(codePointMax(128), { message: 'Must be at most 128 Unicode code points' })

export const CollaborationErrorSchema = z.strictObject({
  code: z.enum(COLLABORATION_ERROR_CODES),
  message: text(256),
  request_id: requestId,
})

export const DraftSchema = z.strictObject({
  id,
  mailbox_id: id,
  subject: text(998),
  to: z.array(AddressSchema).max(100),
  body_text: text(65536),
  reply_to_thread_id: id.nullable(),
  version: resourceVersion.min(1),
  state: draftState,
  created_at: utcTimestamp,
  updated_at: utcTimestamp,
})

export const DraftSaveResultSchema = z.strictObject({
  draft_id: id,
  operation_id: id,
  version: resourceVersion.min(1),
  state: z.literal('editable'),
})

export const DraftResponseSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  draft: DraftSchema,
})

export const DraftSummarySchema = z.strictObject({
  id,
  mailbox_id: id,
  subject: text(256),
  subject_truncated: z.boolean(),
  reply_to_thread_id: id.nullable(),
  version: resourceVersion.min(1),
  state: draftState,
  updated_at: utcTimestamp,
})

export const DraftPageSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  mailbox_id: id,
  next_cursor: cursor.nullable(),
  items: z.array(DraftSummarySchema).max(50),
})

const operationBinding = { operation_id: id, mailbox_id: id, draft_id: id }
export const DraftOperationAppliedSchema = z.strictObject({
  ...operationBinding,
  outcome: z.literal('applied'),
  expected_version: resourceVersion,
  version: resourceVersion.min(1),
  state: z.literal('editable'),
  recorded_at: utcTimestamp,
  detail_expires_at: utcTimestamp,
})
export const DraftOperationConflictSchema = z.strictObject({
  ...operationBinding,
  outcome: z.literal('conflict'),
  code: z.enum(['draft_conflict', 'draft_consumed']),
  expected_version: resourceVersion,
  current_version: resourceVersion,
  state: draftState.nullable(),
  recorded_at: utcTimestamp,
  detail_expires_at: utcTimestamp,
})
export const DraftOperationExpiredSchema = z.strictObject({ ...operationBinding, outcome: z.literal('expired') })
export const DraftOperationUnknownSchema = z.strictObject({ ...operationBinding, outcome: z.literal('unknown') })
export const DraftOperationSchema = z.discriminatedUnion('outcome', [
  DraftOperationAppliedSchema,
  DraftOperationConflictSchema,
  DraftOperationExpiredSchema,
  DraftOperationUnknownSchema,
])
export const DraftOperationResponseSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  operation: DraftOperationSchema,
})

export const ThreadReadStateSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  thread_id: id,
  mailbox_id: id,
  read: z.boolean(),
  read_state_version: resourceVersion,
  updated_at: utcTimestamp.nullable(),
})

export const ThreadAssignmentSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  thread_id: id,
  mailbox_id: id,
  assignee_id: id.nullable(),
  assignment_version: resourceVersion,
  updated_at: utcTimestamp.nullable(),
})

const noteBody = z.string().min(1).refine(codePointMax(4096), { message: 'Must be at most 4096 Unicode code points' })
export const ThreadNoteSchema = z.strictObject({
  id,
  author_id: id,
  body_text: noteBody,
  version: z.literal(1),
  created_at: utcTimestamp,
})
export const ThreadNoteResponseSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  thread_id: id,
  mailbox_id: id,
  note: ThreadNoteSchema,
})
export const ThreadNotePageSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  thread_id: id,
  mailbox_id: id,
  next_cursor: cursor.nullable(),
  items: z.array(ThreadNoteSchema).max(50),
})

export const MembershipCapabilitiesSchema = z.strictObject({
  compose: z.boolean(),
  approve_send: z.boolean(),
  manage_members: z.boolean(),
})
export const MailboxMemberSchema = z.strictObject({ user_id: id, capabilities: MembershipCapabilitiesSchema })
export const MailboxMemberPageSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  mailbox_id: id,
  membership_version: resourceVersion,
  next_cursor: cursor.nullable(),
  items: z.array(MailboxMemberSchema).max(50),
})
export const MailboxMembershipResultSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  mailbox_id: id,
  user_id: id,
  membership_version: resourceVersion,
  member: MailboxMemberSchema.nullable(),
})

const searchText = z.string().min(1).refine(codePointMax(256), { message: 'Must be at most 256 Unicode code points' })
export const SearchPageSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  q: searchText,
  mailbox_id: id.nullable(),
  next_cursor: cursor.nullable(),
  items: z.array(ThreadSummarySchema).max(50),
})

// --- BE-02 C/D collaboration (browser-validated inputs) -------------------------------------
// AIDEV-NOTE: Inputs are validated before dispatch so an out-of-bound value never leaves the
// browser; the server re-validates everything. Empty subject/body/to are valid unsent content.

export const DraftSaveInputSchema = z.strictObject({
  mailbox_id: id,
  operation_id: id,
  expected_version: resourceVersion,
  subject: text(998),
  to: z.array(AddressSchema).max(100),
  body_text: text(65536),
  reply_to_thread_id: id.nullable(),
})
export const ThreadReadStateInputSchema = z.strictObject({ mailbox_id: id, read: z.boolean() })
export const ThreadAssignmentInputSchema = z.strictObject({
  mailbox_id: id,
  assignee_id: id.nullable(),
  expected_assignment_version: resourceVersion,
})
export const ThreadNoteInputSchema = z.strictObject({ mailbox_id: id, note_id: id, body_text: noteBody })
export const MailboxMemberInputSchema = z.strictObject({
  expected_membership_version: resourceVersion,
  capabilities: MembershipCapabilitiesSchema,
})

/** Unicode White_Space per the contract's search rule; a query made only of these is invalid.
 *  \v is U+000B (vertical tab), written as the named escape so the control character is explicit. */
const WHITE_SPACE_ONLY = /^[\t\n\v\f\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]*$/u
export const SearchQuerySchema = z.strictObject({
  q: searchText.refine((value) => !WHITE_SPACE_ONLY.test(value), { message: 'Must contain a non-whitespace character' }),
  mailbox_id: id.optional(),
})
/** Membership DELETE carries the mailbox-wide revision as its single query parameter. */
export const MembershipDeleteQuerySchema = z.strictObject({ expected_membership_version: resourceVersion })

export type CollaborationError = components['schemas']['CollaborationError']
export type Draft = components['schemas']['Draft']
export type DraftSaveInput = components['schemas']['DraftSaveInput']
export type DraftSaveResult = components['schemas']['DraftSaveResult']
export type DraftResponse = components['schemas']['DraftResponse']
export type DraftSummary = components['schemas']['DraftSummary']
export type DraftPage = components['schemas']['DraftPage']
export type DraftOperation = components['schemas']['DraftOperation']
export type DraftOperationResponse = components['schemas']['DraftOperationResponse']
export type ThreadReadState = components['schemas']['ThreadReadState']
export type ThreadReadStateInput = components['schemas']['ThreadReadStateInput']
export type ThreadAssignment = components['schemas']['ThreadAssignment']
export type ThreadAssignmentInput = components['schemas']['ThreadAssignmentInput']
export type ThreadNote = components['schemas']['ThreadNote']
export type ThreadNoteInput = components['schemas']['ThreadNoteInput']
export type ThreadNoteResponse = components['schemas']['ThreadNoteResponse']
export type ThreadNotePage = components['schemas']['ThreadNotePage']
export type MembershipCapabilities = components['schemas']['MembershipCapabilities']
export type MailboxMember = components['schemas']['MailboxMember']
export type MailboxMemberInput = components['schemas']['MailboxMemberInput']
export type MailboxMemberPage = components['schemas']['MailboxMemberPage']
export type MailboxMembershipResult = components['schemas']['MailboxMembershipResult']
export type SearchPage = components['schemas']['SearchPage']
export type SearchQuery = z.infer<typeof SearchQuerySchema>

/** C/D success maxima (x-max-response-bytes) and request maxima (x-max-request-bytes). */
export const CD_MAX_BYTES = {
  draft: 2_097_152,
  draftSave: 4_096,
  drafts: 262_144,
  operation: 4_096,
  readState: 4_096,
  assignment: 4_096,
  notes: 262_144,
  note: 65_536,
  members: 131_072,
  membership: 4_096,
  search: 262_144,
} as const
export const CD_MAX_REQUEST_BYTES = {
  draftSave: 1_048_576,
  note: 65_536,
  small: 8_192,
} as const
