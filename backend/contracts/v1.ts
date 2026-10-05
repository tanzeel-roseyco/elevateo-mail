import { z } from 'zod'
import { sendInputSchema } from '../policies/send'

// AIDEV-NOTE: Portable schemas have no Worker bindings; the HTTP consumer validates rather than trusting casts.
export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u)
export const hash = z.string().regex(/^[a-f0-9]{64}$/u)
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const flag = z.union([z.literal(0), z.literal(1)])
export const permissionsInput = z.object({ connected: z.boolean(), sendEnabled: z.boolean(),
  aiRead: z.boolean(), aiDraft: z.boolean().default(false), aiSend: z.boolean() }).strict()
export const approvalInput = z.object({ revision: hash }).strict()
export const manualSendInput = sendInputSchema.refine(value => value.kind === 'manual', 'manual_only')
export const mailboxPage = z.object({ items: z.array(z.object({ id, address: z.email(), provider: z.enum(['fake','gmail','resend']),
  connected: flag, send_enabled: flag, ai_read: flag, ai_draft: flag, ai_send: flag }).strict()).max(100),
  next: z.object({ after: id }).strict().nullable(), simulated: z.literal(true) }).strict()
const counters = z.object({ limit: z.number().int().positive(), acceptedUsage: z.number().int().nonnegative(),
  heldReservations: z.number().int().nonnegative(), remaining: z.number().int().nonnegative(),
  nextAcceptedReleaseAt: timestamp.nullable(), reservationReleaseUnknown: z.boolean() }).strict()
export const quotaResponse = z.object({ mailboxId: id, policy: z.literal('provisional_rolling_24h_recipients'),
  windowHours: z.literal(24), mailbox: counters, user: counters, simulated: z.literal(true) }).strict()
export const summary = z.object({ id, thread_id: id, mailbox_id: id, sender: z.email(), subject: z.string(), at: timestamp }).strict()
export const messagePage = z.object({ items: z.array(summary).max(100),
  next: z.object({ before: timestamp, beforeId: id }).strict().nullable(), simulated: z.literal(true) }).strict()
export const messageDetail = z.object({ message: summary.extend({ owner: id, body: z.string().max(100_000) }).strict(),
  contentType: z.literal('text/plain'), trust: z.literal('untrusted-email') }).strict()
export const status = z.enum(['draft','pending','dispatching','accepted','rejected','unknown','cancelled'])
export const createdIntent = z.object({ id, revision: hash, status, simulated: z.literal(true) }).strict()
export const intentResponse = z.object({ intent: z.object({ id, revision: hash, status, scheduled_at: timestamp,
  dispatch_at: timestamp.nullable(), provider_id: z.string().nullable(), error_code: z.string().nullable(),
  correlation_id: z.string().uuid().nullable(), approval_expires_at: timestamp.nullable() }).strict(), simulated: z.literal(true) }).strict()
export const savedResponse = z.object({ saved: z.literal(true), simulated: z.literal(true),
  enqueue: z.enum(['queued','deferred','not_applicable']) }).strict()
export const updatedResponse = z.object({ updated: z.literal(true), simulated: z.literal(true) }).strict()
export const capabilitiesResponse = z.object({ version: z.literal(1), simulated: z.literal(true),
  liveSending: z.literal(false), dnsWrites: z.literal(false), features: z.object({ mailboxInventory: z.literal(true),
    messages: z.literal(true), manualSend: z.literal(true), campaignWizard: z.literal(false), inboxSync: z.literal(false),
    historyImport: z.literal(false), aiBridge: z.literal(false) }).strict(), policy: z.object({ provisional: z.literal(true),
    windowHours: z.literal(24), mailboxLimit: z.literal(30), userLimit: z.literal(300), users: z.literal(10),
    connectedMailboxes: z.literal(10) }).strict(), dispatchPaused: z.boolean() }).strict()
export const errorResponse = z.object({ error: z.object({ code: z.string(), requestId: z.string().uuid() }).strict() }).strict()
