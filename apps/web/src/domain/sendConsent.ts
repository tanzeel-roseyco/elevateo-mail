// Pure consent gate for send review and lead intake (launch blocker 6). No React, no store.
// AIDEV-NOTE: Resend's acceptable use policy requires opted-in recipients, so under the resend
// transport every recipient needs server-reported consent evidence. Held and Mailpit never reach a
// real inbox, so they stay allowed. The server enforces the same gate (consent_required); this
// module only lets the UI explain the block before the person tries to approve.

export type OutboundMode = 'held' | 'mailpit' | 'resend'

export interface RecipientConsent {
  /** Zero-based position in the review's recipient list. */
  index: number
  consent_evidence: boolean
}

export type ConsentGate =
  | { allowed: true }
  | { allowed: false; reason: string; recipientIndexes: number[] }

export const CONSENT_REQUIRED_REASON =
  'Live sending through Resend is limited to recipients who opted in. Record consent evidence for every recipient before approving.'

export function consentGate(mode: OutboundMode, recipients: readonly RecipientConsent[]): ConsentGate {
  if (mode !== 'resend') return { allowed: true }
  const missing = recipients.filter((recipient) => !recipient.consent_evidence).map((recipient) => recipient.index)
  if (missing.length === 0) return { allowed: true }
  return { allowed: false, reason: CONSENT_REQUIRED_REASON, recipientIndexes: missing }
}

export type LeadIntake =
  | { ok: true; email: string; consentSource: string }
  | { ok: false; field: 'email' | 'consent_source'; message: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CONTROL = /\p{Cc}/u

/**
 * Validates a new lead before it is added. A consent source is mandatory so no lead enters the
 * system without a stated opt-in origin; the source is still only an assertion until the person
 * records attested evidence, which the backend assesses.
 */
export function validateLeadIntake(input: { email: string; consentSource: string }): LeadIntake {
  const email = input.email.trim().toLowerCase()
  const consentSource = input.consentSource.trim()
  if (!EMAIL.test(email)) return { ok: false, field: 'email', message: 'Enter a valid email address.' }
  if (consentSource === '') return { ok: false, field: 'consent_source', message: 'Enter where this person opted in, such as an inbound enquiry or an existing customer record.' }
  // Bound and character rules mirror consentEvidenceInputSchema so the prefilled evidence form accepts it.
  if (consentSource.length > 200 || CONTROL.test(consentSource)) return { ok: false, field: 'consent_source', message: 'The consent source must be plain text of at most 200 characters.' }
  return { ok: true, email, consentSource }
}
