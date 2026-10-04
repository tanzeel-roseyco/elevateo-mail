import { filterEvents } from './activity'
import { awaitingResponse, lastMessage } from './mail'
import { DAILY_LIMIT_MAX, EMAIL_PATTERN, MAX_MAILBOXES_PER_USER, type ActivityEvent, type AiAccess, type Connections, type Identity, type MailboxConnection, type Thread } from './schema'

// AIDEV-NOTE: Pure rules for Connections and the AI Assistant preview. The backend owns real enforcement; this mirrors it.

/** Seed state: the nine fixture identities appear as connected Google mailboxes. Nothing is really connected. */
export function defaultConnections(identities: Identity[], nowIso: string): Connections {
  const first = identities[0]
  return {
    mailboxes: identities.map((i) => ({ id: `mbx-${i.id}`, address: i.id, provider: 'google', status: 'connected', connectedAt: nowIso, historyImport: 'not_started', importedConversations: 0, sendEnabled: true })),
    // Fictional examples on subdomains: Resend never hosts an inbox and never touches a root domain's mail routing.
    resendIdentities: [
      { id: 'rsd-campaign', address: 'hello@updates.boltloop.co', purpose: 'campaign', status: 'verified' },
      { id: 'rsd-transactional', address: 'receipts@notify.boltloop.co', purpose: 'transactional', status: 'pending' },
    ],
    // Narrowest useful default: one mailbox readable, drafting on, sending off.
    ai: { readMailboxIds: first ? [`mbx-${first.id}`] : [], allowDrafts: true, allowSend: false },
  }
}

/** Demo mailboxes back the nine fixture identities; removing one would orphan its mail and sender settings. */
export function isDemoMailbox(mailbox: Pick<MailboxConnection, 'address'>, identities: Identity[]): boolean {
  return identities.some((i) => i.id === mailbox.address)
}

/** Strips a "+tag" so name+sales@x and name@x share one mailbox and one daily allowance. */
export function canonicalAddress(address: string): string {
  const [local = '', domain = ''] = address.trim().toLowerCase().split('@')
  return `${local.split('+')[0]}@${domain}`
}

export type ConnectCheck = { ok: true; address: string } | { ok: false; reason: string }

/** Validates an address before a (simulated) connection. An alias of a connected address counts as that address. */
export function checkNewMailbox(raw: string, mailboxes: MailboxConnection[]): ConnectCheck {
  const address = raw.trim().toLowerCase()
  if (mailboxes.length >= MAX_MAILBOXES_PER_USER) return { ok: false, reason: `You can connect at most ${MAX_MAILBOXES_PER_USER} mailboxes.` }
  if (!EMAIL_PATTERN.test(address)) return { ok: false, reason: 'Enter a full email address, such as name@example.com.' }
  if (mailboxes.some((m) => canonicalAddress(m.address) === canonicalAddress(address))) return { ok: false, reason: 'That mailbox, or an alias of it, is already connected.' }
  return { ok: true, address }
}

export type QuotaLevel = 'ok' | 'near' | 'reached'
export interface QuotaUsage {
  used: number
  limit: number
  remaining: number
  level: QuotaLevel
}

/** Usage against the 30-per-mailbox ceiling. "near" starts at 80% so the warning arrives before the limit does. */
export function quotaUsage(used: number, limit: number = DAILY_LIMIT_MAX): QuotaUsage {
  const remaining = Math.max(0, limit - used)
  return { used, limit, remaining, level: used >= limit ? 'reached' : used >= limit * 0.8 ? 'near' : 'ok' }
}

// AIDEV-QUESTION: Daily window and To/CC/BCC counting are undecided. Provisional: local midnight, one per recipient.
/** Simulated sends since local midnight per sending address, with aliases folded into their mailbox. */
export function sentTodayByAddress(events: ActivityEvent[], now: number): Map<string, number> {
  const counts = new Map<string, number>()
  for (const e of filterEvents(events, { range: 'today', domain: '', kind: 'sent', now })) {
    const key = canonicalAddress(e.identityId)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** The most one user can send in a day: 30 for each connected mailbox, so ten mailboxes allow 300. */
export function userDailyCeiling(mailboxCount: number): number {
  return Math.max(0, Math.min(mailboxCount, MAX_MAILBOXES_PER_USER)) * DAILY_LIMIT_MAX
}

type AiScope = Pick<Connections, 'mailboxes' | 'ai'>

/** Conversations the assistant may prepare a reply for: awaiting a response, in a mailbox it is allowed to read. */
export function assistantQueue(threads: Thread[], connections: AiScope): Thread[] {
  const readable = new Set(connections.mailboxes.filter((m) => connections.ai.readMailboxIds.includes(m.id)).map((m) => m.address))
  return awaitingResponse(threads).filter((t) => readable.has(t.identityId))
}

export type AiDraftCheck = { ok: true; thread: Thread } | { ok: false; reason: string }

/** Re-checked by the gateway at the moment a draft is requested, because permissions may have changed since render. */
export function checkAiDraft(thread: Thread | undefined, connections: AiScope): AiDraftCheck {
  if (!thread) return { ok: false, reason: 'That conversation no longer exists.' }
  if (!connections.ai.allowDrafts) return { ok: false, reason: 'Drafting is turned off in Connections → AI.' }
  if (assistantQueue([thread], connections).length === 0) return { ok: false, reason: 'The assistant may not read this mailbox, or the conversation is no longer awaiting a reply.' }
  return { ok: true, thread }
}

/**
 * Placeholder reply for the preview. Built only from the sender's first name: message content is untrusted input
 * and is never copied into, or treated as instructions for, the draft.
 */
export function simulatedReplyBody(thread: Thread): string {
  const first = lastMessage(thread).from.name.trim().split(/\s+/)[0] || 'there'
  return `Hi ${first},\n\nThanks for your message. [Simulated draft: the real assistant would write a reply here from this conversation. Replace this text before sending.]\n\nKind regards,`
}

export interface SendingDomain {
  name: string
  /** False when the address sits on a root domain (or an unknown one): never manageable, root mail routing is protected. */
  approvable: boolean
}

/** Domains used by Resend identities. Only a proper subdomain of a known root can ever be put forward for approval. */
export function sendingDomains(addresses: string[], roots: string[]): SendingDomain[] {
  const names = [...new Set(addresses.map((a) => (a.split('@')[1] ?? '').toLowerCase()).filter(Boolean))].sort()
  return names.map((name) => ({ name, approvable: roots.some((root) => name.endsWith(`.${root.toLowerCase()}`)) }))
}

export function describeAiAccess(ai: AiAccess): string {
  const count = ai.readMailboxIds.length
  const scope = count === 0 ? 'no mailboxes' : count === 1 ? '1 mailbox' : `${count} mailboxes`
  return `Reads ${scope} · drafting ${ai.allowDrafts ? 'on' : 'off'} · sending ${ai.allowSend ? 'needs your approval each time' : 'off'}`
}
