import { type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useMailboxes } from './mailboxes'
import { InboxPage } from '@/features/inbox/InboxPage'
import { CampaignOverview } from '@/features/outreach/CampaignOverview'
import { InboxIcon, SendIcon } from '@/ui/icons'

// AIDEV-NOTE: Reuse the protected inbox reader; mailbox selection stays in the URL, never a second store.
export function InboxWorkspace({ children }: { children?: ReactNode }) {
  const snapshot = useMailboxes()
  const { mailboxId, threadId } = useParams<{ mailboxId: string; threadId: string }>()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  if (snapshot.status === 'loading') return <p role="status" className="p-6">Loading your workspace…</p>
  if (snapshot.status === 'error') return <p role="alert" className="p-6">Your mailboxes could not be loaded. Refresh to try again.</p>
  // AIDEV-NOTE: An explicit unknown mailbox never falls back to a different account's conversations.
  const selected = mailboxId === undefined ? snapshot.mailboxes[0] : snapshot.mailboxes.find((mailbox) => mailbox.id === mailboxId)
  const filter = search.get('filter') === 'unread' ? '?filter=unread' : ''
  return <section className="inbox-workspace" aria-label="Unified email dashboard">
    <header className="workspace-heading">
      <div><p className="eyebrow">Your workspace</p><h1 className="page-title mt-1">Inbox</h1><p className="mt-1 text-[13px] text-muted">Every conversation. Every campaign. One place.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <Link className="workspace-link" to="/outreach/campaigns"><SendIcon aria-hidden className="size-4" />Campaigns</Link>
        {selected?.capabilities.compose && <Link className="workspace-compose" to={`/mailboxes/${selected.id}/drafts`}>+ Compose</Link>}
      </div>
    </header>
    <div className="workspace-columns">
      <div className={`workspace-mail ${threadId === undefined ? '' : 'has-reader'}`}>
        <div className="workspace-list">
          <div className="workspace-mailbox">
            <label htmlFor="workspace-mailbox" className="eyebrow">Email account</label>
            <select id="workspace-mailbox" value={selected?.id ?? ''} onChange={(event) => { void navigate(`/mailboxes/${event.target.value}${filter}`) }}>
              {!selected && <option value="">{mailboxId ? 'Mailbox unavailable' : 'No email accounts'}</option>}
              {snapshot.mailboxes.map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.display_name}</option>)}
            </select>
          </div>
          {selected ? <InboxPage selectedMailboxId={selected.id} /> : <p role="status" className="p-5 text-muted">{mailboxId ? 'This mailbox is unavailable. Choose an account you can access.' : 'No mailboxes are visible to you.'}</p>}
        </div>
        <div className="workspace-reader">
          {children ?? <div className="workspace-reader-empty">
            <div className="workspace-empty-icon"><InboxIcon aria-hidden className="size-7" /></div>
            <h2 className="mt-5 text-lg font-semibold">A little more focus.</h2>
            <p className="mt-2 max-w-64 text-[13px] leading-6 text-muted">Select a conversation to read, reply, and keep your next steps moving.</p>
            {selected?.capabilities.compose && <Link className="workspace-link mt-5" to={`/mailboxes/${selected.id}/drafts`}>Open drafts</Link>}
          </div>}
        </div>
      </div>
      <aside className="workspace-marketing" aria-label="Marketing workspace"><CampaignOverview /></aside>
    </div>
  </section>
}
