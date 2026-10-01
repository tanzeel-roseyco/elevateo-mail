import { DAILY_LIMIT_MAX, EMAIL_PATTERN, TIME_PATTERN, type Campaign, type Contact, type Draft, type Identity } from './schema'

// AIDEV-NOTE: Consent/suppression and send-validation rules. The UI must ask these functions, never re-derive them.

export { EMAIL_PATTERN }

// The form checks below mirror the persisted schema exactly: a value the UI accepts must also load back.
export function dailyLimitError(limit: number): string | null {
  return Number.isInteger(limit) && limit >= 1 && limit <= DAILY_LIMIT_MAX ? null : `Enter a whole number between 1 and ${DAILY_LIMIT_MAX}.`
}

export function sendingWindowError(start: string, end: string): string | null {
  if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) return 'Enter both a start and an end time.'
  return start < end ? null : 'The window must end after it starts.'
}

/** Why a contact cannot receive campaign email, or null when they can. */
export function sendBlockReason(contact: Contact): string | null {
  if (contact.subscription === 'unsubscribed') return 'unsubscribed'
  if (contact.subscription === 'bounced') return 'marked as bounced'
  if (contact.subscription === 'suppressed') return 'on the suppression list'
  if (contact.consent !== 'opted_in') return 'missing opt-in consent'
  return null
}

export function isSendable(contact: Contact): boolean {
  return sendBlockReason(contact) === null
}

export type SendField = 'from' | 'to' | 'subject' | 'body'
export interface SendCheck {
  ok: boolean
  errors: Array<{ field: SendField; message: string }>
  /** Non-blocking notes, e.g. a 1:1 message to an unsubscribed contact. */
  warnings: string[]
}

/**
 * A draft is a campaign send only when it starts a new conversation for a campaign. A reply inside a campaign
 * thread keeps the campaign link for context but is ordinary 1:1 mail.
 */
export function isCampaignSend(draft: Pick<Draft, 'campaignId' | 'threadId'>): boolean {
  return draft.campaignId !== null && draft.threadId === null
}

export function validateSend(draft: Draft, contacts: Contact[], identities: Identity[]): SendCheck {
  const errors: SendCheck['errors'] = []
  const warnings: string[] = []
  const recipients = [...draft.to, ...draft.cc, ...draft.bcc]

  if (!identities.some((i) => i.id === draft.identityId)) {
    errors.push({ field: 'from', message: 'Choose a sender identity.' })
  }
  if (draft.to.length === 0) errors.push({ field: 'to', message: 'Add at least one recipient.' })
  for (const email of recipients) {
    if (!EMAIL_PATTERN.test(email)) errors.push({ field: 'to', message: `“${email}” is not a valid email address.` })
  }
  if (draft.subject.trim() === '') errors.push({ field: 'subject', message: 'Add a subject.' })
  if (draft.body.trim() === '') errors.push({ field: 'body', message: 'Write a message.' })

  const byEmail = new Map(contacts.map((c) => [c.email.toLowerCase(), c]))
  const campaignSend = isCampaignSend(draft)
  for (const email of recipients) {
    const contact = byEmail.get(email.toLowerCase())
    if (!contact) {
      // No contact record means no recorded opt-in, which campaign mail always requires.
      if (campaignSend) errors.push({ field: 'to', message: `${email} is not an opted-in contact and cannot receive campaign emails.` })
      continue
    }
    const reason = sendBlockReason(contact)
    if (!reason) continue
    if (campaignSend) {
      errors.push({ field: 'to', message: `${email} is ${reason} and cannot receive campaign emails.` })
    } else {
      // An ordinary 1:1 reply to someone who wrote in is legitimate; a campaign send is not.
      warnings.push(`${email} is ${reason}. This will go as an ordinary message, not a campaign email.`)
    }
  }
  return { ok: errors.length === 0, errors, warnings }
}

export interface CampaignMetrics {
  total: number
  /** Attempted sends: delivered + bounced + failed. */
  sent: number
  delivered: number
  bounced: number
  failed: number
  pending: number
  skipped: number
  replies: number
  unsubscribes: number
}

export function campaignMetrics(campaign: Campaign): CampaignMetrics {
  const m: CampaignMetrics = { total: campaign.recipients.length, sent: 0, delivered: 0, bounced: 0, failed: 0, pending: 0, skipped: 0, replies: 0, unsubscribes: 0 }
  for (const r of campaign.recipients) {
    if (r.delivery === 'pending') m.pending++
    else if (r.delivery === 'skipped') m.skipped++
    else {
      m.sent++
      if (r.delivery === 'delivered') m.delivered++
      else if (r.delivery === 'bounced') m.bounced++
      else m.failed++
    }
    if (r.replied) m.replies++
    if (r.unsubscribed) m.unsubscribes++
  }
  return m
}

export function percent(part: number, whole: number): string {
  return whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`
}

/** Short description of what the (simulated) scheduler would do next. */
export function nextAction(campaign: Campaign, formatDate: (iso: string, timeZone?: string) => string): string {
  const { pending } = campaignMetrics(campaign)
  switch (campaign.status) {
    case 'draft':
      return 'Finish setup and schedule'
    case 'scheduled':
      // Shown in the campaign's own timezone, matching what was entered when it was scheduled.
      return `Starts ${formatDate(campaign.schedule.startAt, campaign.schedule.timezone)}`
    case 'running':
      return pending > 0 ? `Next batch: up to ${Math.min(pending, batchSize(campaign))} recipients` : 'Finishing'
    case 'paused':
      return `Paused with ${pending} remaining`
    case 'completed':
      return 'No further sends'
  }
}

/** Recipients one simulated sending day covers: the daily limit applies per sender identity. */
export function batchSize(campaign: Campaign): number {
  return Math.max(1, campaign.schedule.dailyLimit * Math.max(1, campaign.identityIds.length))
}

/** Fills {{first_name}} and {{company}}; unknown placeholders are left visible so mistakes are noticed. */
export function personalise(template: string, contact: Pick<Contact, 'name' | 'company'>): string {
  return template
    .replaceAll('{{first_name}}', contact.name.split(' ')[0] ?? contact.name)
    .replaceAll('{{company}}', contact.company)
}

export function contactMatches(contact: Contact, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [contact.name, contact.email, contact.company, ...contact.tags].some((v) => v.toLowerCase().includes(q))
}

export function validateCampaignName(name: string, existing: Campaign[]): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Give the campaign a name.'
  if (trimmed.length > 120) return 'Keep the name under 120 characters.'
  if (existing.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return 'A campaign with this name already exists.'
  return null
}
