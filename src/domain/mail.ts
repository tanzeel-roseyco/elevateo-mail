import { identityDomain, isOwnAddress } from './identities'
import type { Draft, DomainName, Identity, Message, Thread } from './schema'

// AIDEV-NOTE: Mailbox views and reply rules. Folders shown in the UI are views over Thread.folder, not storage.

export const MAIL_FOLDERS = ['inbox', 'starred', 'sent', 'drafts', 'archive', 'spam', 'trash'] as const
export type MailFolder = (typeof MAIL_FOLDERS)[number]

export function isMailFolder(value: string | undefined): value is MailFolder {
  return MAIL_FOLDERS.some((f) => f === value)
}

export function lastMessage(thread: Thread): Message {
  const message = thread.messages[thread.messages.length - 1]
  // The schema guarantees ≥1 message; reaching this means corrupted state slipped past validation.
  if (!message) throw new Error(`Thread ${thread.id} has no messages`)
  return message
}

export function inFolder(thread: Thread, folder: MailFolder): boolean {
  const discarded = thread.folder === 'trash' || thread.folder === 'spam'
  switch (folder) {
    case 'starred':
      return thread.starred && !discarded
    case 'sent':
      // Like Gmail: any conversation we have written in, wherever it is filed.
      return !discarded && thread.messages.some((m) => m.direction === 'out')
    case 'drafts':
      return false
    default:
      return thread.folder === folder
  }
}

export interface ThreadFilter {
  folder: MailFolder
  q: string
  domain: DomainName | ''
  identityId: string
  unread: boolean
  /** '' = all, 'any' = campaign-linked, 'none' = ordinary, otherwise a campaign id. */
  campaign: string
}

export function matchesQuery(thread: Thread, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (thread.subject.toLowerCase().includes(q)) return true
  return thread.messages.some(
    (m) =>
      m.body.toLowerCase().includes(q) ||
      [m.from, ...m.to, ...m.cc].some((a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)),
  )
}

export function threadMatches(thread: Thread, filter: ThreadFilter): boolean {
  if (!inFolder(thread, filter.folder)) return false
  if (filter.unread && !thread.unread) return false
  if (filter.identityId && thread.identityId !== filter.identityId) return false
  if (filter.domain && identityDomain(thread.identityId) !== filter.domain) return false
  if (filter.campaign === 'any' && !thread.campaignId) return false
  if (filter.campaign === 'none' && thread.campaignId) return false
  if (filter.campaign && filter.campaign !== 'any' && filter.campaign !== 'none' && thread.campaignId !== filter.campaign) return false
  return matchesQuery(thread, filter.q)
}

export function sortByRecent(threads: Thread[]): Thread[] {
  return [...threads].sort((a, b) => lastMessage(b).at.localeCompare(lastMessage(a).at))
}

/** Inbox conversations where the other side spoke last. */
export function awaitingResponse(threads: Thread[]): Thread[] {
  return sortByRecent(threads.filter((t) => t.folder === 'inbox' && lastMessage(t).direction === 'in'))
}

export type ReplyKind = 'reply' | 'replyAll' | 'forward'
export type DraftInit = Pick<Draft, 'identityId' | 'to' | 'cc' | 'subject' | 'body' | 'attachments' | 'campaignId' | 'threadId'>

function prefixed(prefix: 'Re' | 'Fwd', subject: string): string {
  return new RegExp(`^${prefix}:`, 'i').test(subject) ? subject : `${prefix}: ${subject}`
}

export function buildReply(thread: Thread, kind: ReplyKind, identities: Identity[], formatDate: (iso: string) => string): DraftInit {
  const last = lastMessage(thread)
  // Replies go out from the identity that received the conversation, not the global default.
  const base = { identityId: thread.identityId, campaignId: thread.campaignId }

  if (kind === 'forward') {
    const header = `---------- Forwarded message ----------\nFrom: ${last.from.name} <${last.from.email}>\nDate: ${formatDate(last.at)}\nSubject: ${thread.subject}`
    return { ...base, campaignId: null, threadId: null, to: [], cc: [], subject: prefixed('Fwd', thread.subject), body: `\n\n${header}\n\n${last.body}`, attachments: last.attachments }
  }

  const external = (emails: string[]) => [...new Set(emails.map((e) => e.toLowerCase()))].filter((e) => !isOwnAddress(e, identities))
  const to = external(last.direction === 'in' ? [last.from.email] : last.to.map((a) => a.email))
  const others = external([...last.to, ...last.cc].map((a) => a.email)).filter((e) => !to.includes(e))
  return { ...base, threadId: thread.id, to, cc: kind === 'replyAll' ? others : [], subject: prefixed('Re', thread.subject), body: '', attachments: [] }
}
