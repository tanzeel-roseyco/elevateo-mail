import { z } from 'zod'

// AIDEV-NOTE: Single source of truth for DTO shapes; types are inferred so persisted state and ports never drift.

export const DOMAIN_NAMES = ['boltloop.co', 'flooda.co', 'elevateoco.com'] as const
export const domainNameSchema = z.enum(DOMAIN_NAMES)
export type DomainName = z.infer<typeof domainNameSchema>

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
export const DAILY_LIMIT_MAX = 500
export const FOLLOW_UP_DELAY_MAX_DAYS = 30

const emailSchema = z.string().regex(EMAIL_PATTERN)
const timestampSchema = z.iso.datetime()
const timeOfDaySchema = z.string().regex(TIME_PATTERN)
const dailyLimitSchema = z.number().int().min(1).max(DAILY_LIMIT_MAX)

const addressSchema = z.object({ name: z.string(), email: emailSchema })
export type Address = z.infer<typeof addressSchema>

const attachmentSchema = z.object({ id: z.string(), name: z.string(), sizeBytes: z.number() })
export type Attachment = z.infer<typeof attachmentSchema>

const messageSchema = z.object({
  id: z.string(),
  from: addressSchema,
  to: z.array(addressSchema),
  cc: z.array(addressSchema),
  body: z.string(),
  at: timestampSchema,
  direction: z.enum(['in', 'out']),
  attachments: z.array(attachmentSchema),
  // Baked in at send time so later signature/banner edits never rewrite history.
  signature: z.string().optional(),
  bannerDomain: domainNameSchema.optional(),
  unsubscribeFooter: z.string().optional(),
})
export type Message = z.infer<typeof messageSchema>

export const STORED_FOLDERS = ['inbox', 'sent', 'archive', 'spam', 'trash'] as const
export type StoredFolder = (typeof STORED_FOLDERS)[number]

const threadSchema = z.object({
  id: z.string(),
  subject: z.string(),
  folder: z.enum(STORED_FOLDERS),
  starred: z.boolean(),
  unread: z.boolean(),
  /** The identity that received (or started) the conversation; replies default to it. */
  identityId: z.string(),
  /** null = ordinary message; otherwise the campaign this conversation belongs to. */
  campaignId: z.string().nullable(),
  messages: z.array(messageSchema).min(1),
})
export type Thread = z.infer<typeof threadSchema>

const draftSchema = z.object({
  id: z.string(),
  identityId: z.string(),
  // Recipients stay free text: a draft may hold a half-typed or invalid address until it is sent.
  to: z.array(z.string()),
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  subject: z.string(),
  body: z.string(),
  attachments: z.array(attachmentSchema),
  campaignId: z.string().nullable(),
  /** Set when the draft is a reply, so sending appends to that conversation. */
  threadId: z.string().nullable(),
  banner: z.boolean(),
  updatedAt: timestampSchema,
})
export type Draft = z.infer<typeof draftSchema>

export const SUBSCRIPTION_STATES = ['subscribed', 'unsubscribed', 'bounced', 'suppressed'] as const
const contactSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: emailSchema,
  company: z.string(),
  tags: z.array(z.string()),
  consent: z.enum(['opted_in', 'unconfirmed']),
  consentSource: z.string(),
  subscription: z.enum(SUBSCRIPTION_STATES),
})
export type Contact = z.infer<typeof contactSchema>

const identitySchema = z.object({
  /** Equal to the full address; stable because local parts and domains are fixed. */
  id: z.string(),
  local: z.string(),
  domain: domainNameSchema,
  displayName: z.string(),
  signature: z.string(),
  banner: z.boolean(),
})
export type Identity = z.infer<typeof identitySchema>

const verificationSchema = z.enum(['verified', 'pending', 'failed'])
export type Verification = z.infer<typeof verificationSchema>
const domainInfoSchema = z.object({
  domain: domainNameSchema,
  brand: z.string(),
  bannerText: z.string(),
  spf: verificationSchema,
  dkim: verificationSchema,
  dmarc: verificationSchema,
})
export type DomainInfo = z.infer<typeof domainInfoSchema>

export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'running', 'paused', 'completed'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]
export const DELIVERY_STATES = ['pending', 'delivered', 'bounced', 'failed', 'skipped'] as const
export type DeliveryState = (typeof DELIVERY_STATES)[number]

const recipientSchema = z.object({
  contactId: z.string(),
  delivery: z.enum(DELIVERY_STATES),
  replied: z.boolean(),
  unsubscribed: z.boolean(),
  at: timestampSchema.nullable(),
})
export type CampaignRecipient = z.infer<typeof recipientSchema>

const stepSchema = z.object({
  id: z.string(),
  subject: z.string(),
  body: z.string(),
  /** Days after the previous step; 0 for the first email. */
  delayDays: z.number().int().min(0).max(FOLLOW_UP_DELAY_MAX_DAYS),
})
export type CampaignStep = z.infer<typeof stepSchema>

const scheduleSchema = z.object({
  startAt: timestampSchema,
  timezone: z.string(),
  windowStart: timeOfDaySchema,
  windowEnd: timeOfDaySchema,
  dailyLimit: dailyLimitSchema,
})
export type CampaignSchedule = z.infer<typeof scheduleSchema>

const campaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(CAMPAIGN_STATUSES),
  identityIds: z.array(z.string()),
  steps: z.array(stepSchema),
  recipients: z.array(recipientSchema),
  schedule: scheduleSchema,
  unsubscribeFooter: z.string(),
  createdAt: timestampSchema,
})
export type Campaign = z.infer<typeof campaignSchema>

export const EVENT_KINDS = ['sent', 'delivered', 'reply', 'bounce', 'unsubscribe', 'failed', 'campaign'] as const
export type EventKind = (typeof EVENT_KINDS)[number]
const eventSchema = z.object({
  id: z.string(),
  at: timestampSchema,
  kind: z.enum(EVENT_KINDS),
  domain: domainNameSchema,
  identityId: z.string(),
  /** Contact address; empty for campaign lifecycle events. */
  email: z.string(),
  campaignId: z.string().nullable(),
  threadId: z.string().nullable(),
  /** Free text, used only by `campaign` lifecycle events. */
  text: z.string(),
})
export type ActivityEvent = z.infer<typeof eventSchema>

const settingsSchema = z.object({
  defaultIdentityId: z.string(),
  timezone: z.string(),
  windowStart: timeOfDaySchema,
  windowEnd: timeOfDaySchema,
  dailyLimitPerIdentity: dailyLimitSchema,
  unsubscribeFooter: z.string(),
  notifications: z.object({ replies: z.boolean(), failures: z.boolean(), completion: z.boolean() }),
  notificationsSeenAt: timestampSchema,
  profile: z.object({ name: z.string(), email: emailSchema }),
})
export type Settings = z.infer<typeof settingsSchema>

export const dataSchema = z.object({
  version: z.literal(1),
  threads: z.array(threadSchema),
  drafts: z.array(draftSchema),
  contacts: z.array(contactSchema),
  campaigns: z.array(campaignSchema),
  events: z.array(eventSchema),
  // The nine identities are fixed product data: anything else means the stored state is not ours to trust.
  identities: z
    .array(identitySchema)
    .length(9)
    .refine((list) => new Set(list.map((i) => i.id)).size === 9 && list.every((i) => i.id === `${i.local}@${i.domain}`), 'identities must be the nine fixed addresses'),
  domains: z.array(domainInfoSchema),
  settings: settingsSchema,
})
export type Data = z.infer<typeof dataSchema>
