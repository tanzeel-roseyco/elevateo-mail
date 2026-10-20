// Pure draft content for Reply, Reply all and Forward. The draft API only knows subject, `to`,
// plaintext body and the replied thread, so "reply all" is a recipient list and "forward" is a
// quoted plaintext body; nothing here renders or sends.
//
// AIDEV-NOTE: Addresses are untrusted display text from the server. Anything with a line break or
// angle bracket is dropped rather than repaired, so a hostile header can never be re-sent.
import type { Message } from '@/data/contract'

/** Shape of a sender or recipient as the contract delivers it. */
type Address = Message['to'][number]

export const MAX_DRAFT_RECIPIENTS = 100
export const MAX_DRAFT_SUBJECT = 998
export const MAX_DRAFT_BODY = 65_536

/**
 * A single sendable mailbox address or null. Anything that could split into several recipients or
 * smuggle a header (whitespace, control characters, `<>`, `,;"()[]\\`, missing or repeated `@`)
 * is not usable; it is dropped, never repaired.
 */
export function usableAddress(address: string | null | undefined): string | null {
  const trimmed = address?.trim() ?? ''
  if (trimmed === '' || /[\s<>,;"()[\]\\\p{Cc}]/u.test(trimmed)) return null
  const at = trimmed.indexOf('@')
  if (at <= 0 || at !== trimmed.lastIndexOf('@') || at === trimmed.length - 1) return null
  return trimmed
}

/** Header-shaped lines in the forward block are built from untrusted text: keep each value on one line. */
const oneLine = (value: string) => value.replace(/\p{Cc}+/gu, ' ').trim()

const clip = (value: string, max: number) => Array.from(value).slice(0, max).join('')

function prefixed(prefix: 'Re' | 'Fwd', subject: string | null, truncated: boolean): string {
  // A server-shortened subject is never re-used: a cut-off subject would be sent as if complete.
  if (truncated || subject === null || subject === '') return ''
  const pattern = prefix === 'Re' ? /^re:\s*/i : /^fwd?:\s*/i
  return clip(pattern.test(subject) ? subject : `${prefix}: ${subject}`, MAX_DRAFT_SUBJECT)
}

export const replySubject = (subject: string | null, truncated: boolean) => prefixed('Re', subject, truncated)
export const forwardSubject = (subject: string | null, truncated: boolean) => prefixed('Fwd', subject, truncated)

/**
 * Sender plus every original recipient, minus the mailbox's own address, de-duplicated
 * case-insensitively and capped at the draft limit. Display names travel with the first
 * occurrence of each address.
 */
export function replyAllRecipients(message: Message, ownAddress: string | null): Address[] {
  const own = usableAddress(ownAddress)?.toLowerCase() ?? null
  const seen = new Set<string>()
  const out: Address[] = []
  for (const candidate of [message.sender, ...message.to]) {
    const address = usableAddress(candidate?.address)
    if (address === null) continue
    const key = address.toLowerCase()
    if (key === own || seen.has(key)) continue
    seen.add(key)
    out.push({ display_name: candidate?.display_name ?? null, address })
    if (out.length === MAX_DRAFT_RECIPIENTS) break
  }
  return out
}

function label(address: Address | null): string {
  if (address === null) return 'Unknown'
  const name = oneLine(address.display_name ?? '')
  const addr = usableAddress(address.address)
  if (name !== '' && addr !== null) return `${name} <${addr}>`
  return name !== '' ? name : (addr ?? 'Unknown')
}

/** Plaintext forward: a conventional header block above the original body, bounded to the draft limit. */
export function forwardBody(message: Message, subject: string | null): string {
  const lines = [
    '---------- Forwarded message ----------',
    `From: ${label(message.sender)}`,
    `Date: ${oneLine(message.sent_at ?? 'Unknown')}`,
    `Subject: ${oneLine(subject ?? '(no subject)')}`,
    `To: ${message.to.length === 0 ? 'Unknown' : message.to.map(label).join(', ')}`,
    '',
    message.body_text,
  ]
  return clip(`\n\n${lines.join('\n')}`, MAX_DRAFT_BODY)
}
