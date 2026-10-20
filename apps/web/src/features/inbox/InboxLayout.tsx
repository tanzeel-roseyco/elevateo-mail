// Inbox frame (INBOX-SPEC §1–3): EmailGuard page header with a search input, the Gmail folder
// column at ≥1024px (a folder select between 768 and 1023px, nothing below), and the hosted page
// (list, thread, drafts or draft editor) in the fluid column. Layout-level keyboard shortcuts live
// here: c compose, / search, u back to the list.
//
// AIDEV-NOTE: The hosted pages keep their own keyed owners and request logic; this frame only adds
// chrome and the optional unread report from the list page (inboxContext.tsx).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { useMailbox, useMailboxes } from '@/app/mailboxes'
import { SearchBox } from '@/app/SearchBox'
import { PageHeader } from '@/ui/PageHeader'
import { ComposeFab, FolderColumn, FolderSelect } from './FolderNav'
import { InboxReportContext, composeDraftPath, isTypingTarget, parseView, type InboxCounts, type InboxReport } from './inboxContext'

/** Hosts the nested mailbox routes (App.tsx) or, in tests, explicit children. */
export function InboxLayout({ children }: { children?: ReactNode }) {
  const { mailboxId } = useParams<{ mailboxId: string }>()
  if (mailboxId === undefined) return null
  return <Frame key={mailboxId} mailboxId={mailboxId}>{children ?? <Outlet />}</Frame>
}

function Frame({ mailboxId, children }: { mailboxId: string; children: ReactNode }) {
  const mailbox = useMailbox(mailboxId)
  const snapshot = useMailboxes()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const [counts, setCounts] = useState<InboxCounts | null>(null)
  const report = useMemo<InboxReport>(() => ({ report: setCounts }), [])

  // Layout shortcuts (Gmail): never while typing, never with modifiers held.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
      if (event.key === 'c' && mailbox?.capabilities.compose === true) {
        event.preventDefault()
        navigate(composeDraftPath(mailboxId))
      } else if (event.key === '/') {
        const input = document.querySelector<HTMLInputElement>('form[role="search"] input[type="search"]')
        if (input) {
          event.preventDefault()
          input.focus()
          input.select()
        }
      } else if (event.key === 'u' && pathname.includes('/threads/')) {
        event.preventDefault()
        const view = parseView(new URLSearchParams(search).get('filter'))
        navigate(`/mailboxes/${mailboxId}${view === 'all' ? '' : `?filter=${view}`}`)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mailbox, mailboxId, navigate, pathname, search])

  const subtitle =
    mailbox !== undefined
      ? `${mailbox.display_name}${mailbox.display_address ? ` · ${mailbox.display_address}` : ''}`
      : snapshot.status === 'loading'
        ? 'Loading mailbox…'
        : 'Mailbox'
  return (
    <InboxReportContext.Provider value={report}>
      <PageHeader title="Inbox" subtitle={subtitle} actions={<SearchBox variant="header" />} />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="max-lg:hidden">
          <FolderColumn mailboxId={mailboxId} mailbox={mailbox} counts={counts} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Tablet only (768–1023px): phones get the list and the compose FAB (INBOX-SPEC §3). */}
          <div className="max-md:hidden lg:hidden">
            <FolderSelect mailboxId={mailboxId} mailbox={mailbox} counts={counts} />
          </div>
          {children}
        </div>
      </div>
      <ComposeFab mailboxId={mailboxId} mailbox={mailbox} />
    </InboxReportContext.Provider>
  )
}
