// Shared state between the inbox layout (folder column) and the pages it hosts. The list page
// reports what it has loaded so the folder column can show an unread badge without a second
// request; the layout owns the folder "view" (inbox, unread, starred) that the URL encodes.
//
// AIDEV-NOTE: Everything here is optional: a page rendered outside InboxLayout (unit tests, the
// search results) sees a null context and simply skips the report.
import { createContext, useContext } from 'react'
import { newId } from '@/lib/ids'

export interface InboxCounts {
  /** Unread rows loaded so far, with "+" when the server has more pages. */
  readonly unread: string
}

export interface InboxReport {
  report(counts: InboxCounts | null): void
}

export const InboxReportContext = createContext<InboxReport | null>(null)

export function useInboxReport(): InboxReport | null {
  return useContext(InboxReportContext)
}

/** Folder views the list page understands; the URL `filter` query encodes them. */
export type InboxView = 'all' | 'unread' | 'starred'

export function parseView(raw: string | null): InboxView {
  return raw === 'unread' ? 'unread' : raw === 'starred' ? 'starred' : 'all'
}

/** Keyboard shortcuts must never fire while the person is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** A fresh draft id is minted client-side; nothing exists on the server until the first save. */
export function composeDraftPath(mailboxId: string): string {
  return `/mailboxes/${mailboxId}/drafts/${newId()}?new=1`
}
