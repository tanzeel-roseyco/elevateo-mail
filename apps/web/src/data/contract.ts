// Runtime boundary validation for contracts/v1/openapi.json (schema SHA-256
// 94c5f31bc5d514fed420dcbcee2f6ce49bf4254e325000ea0794fe6a1140e8ca). Generated wire types live in
// ./generated/api.d.ts; these Zod schemas enforce the same bounds at runtime and must not drift.
// AIDEV-NOTE: contract.test.ts pins z.infer of each schema to the generated component type both ways.
import { z } from 'zod'
import type { components } from './generated/api'
import { API_ERROR_CODES } from './errors'

const opaqueToken = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/)
const id = z.uuid()
const utcTimestamp = z.iso.datetime()
const cursor = z.string().min(1).max(2048)

export const AddressSchema = z.strictObject({
  display_name: z.string().max(256).nullable(),
  address: z.string().max(256).nullable(),
})

export const CapabilitiesSchema = z.strictObject({
  read: z.literal(true),
  compose: z.boolean(),
  approve_send: z.boolean(),
  manage_members: z.boolean(),
})

export const MailboxSchema = z.strictObject({
  id,
  display_name: z.string().max(256),
  display_address: z.string().max(256).nullable(),
  capabilities: CapabilitiesSchema,
})

export const SessionSchema = z.strictObject({
  context_id: opaqueToken,
  authorization_version: opaqueToken,
  actor: z.strictObject({ id, display_name: z.string().max(256).nullable() }),
  organization: z.strictObject({ id, name: z.string().max(256) }),
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
  subject: z.string().max(256).nullable(),
  subject_truncated: z.boolean(),
  sender: AddressSchema.nullable(),
  preview_text: z.string().max(256),
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
  body_text: z.string().max(16384),
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
    subject: z.string().max(998).nullable(),
    subject_truncated: z.boolean(),
    unread: z.boolean(),
    message_count: z.number().int().min(0).max(2147483647),
  }),
  messages: z.array(MessageSchema).max(20),
})

export const ErrorSchema = z.strictObject({
  code: z.enum(API_ERROR_CODES),
  message: z.string().max(256),
  request_id: z.string().min(1).max(128),
})

export type Session = components['schemas']['Session']
export type Mailbox = components['schemas']['Mailbox']
export type MailboxPage = components['schemas']['MailboxPage']
export type ThreadSummary = components['schemas']['ThreadSummary']
export type ThreadPage = components['schemas']['ThreadPage']
export type Message = components['schemas']['Message']
export type ThreadDetailPage = components['schemas']['ThreadDetailPage']
export type ApiError = components['schemas']['Error']

/** Maximum serialized UTF-8 JSON bytes per endpoint, from the canonical contract. */
export const MAX_BYTES = { session: 16_384, mailboxes: 131_072, threads: 262_144, thread: 2_097_152, error: 4_096 } as const
export const PAGE_LIMITS = { list: 50, messages: 20 } as const
