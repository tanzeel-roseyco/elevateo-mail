import { live, useLive } from '@/data/http/instance'
import { Button } from '@/ui/Button'

// AIDEV-NOTE: Archived inventory is explicit and paged; startup reads only the ten connected mailboxes.
export function MailboxHistoryControls() {
  const page = useLive((s) => s.mailboxHistory)
  const busy = page.status === 'loading'
  return <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
    <Button size="sm" disabled={busy} onClick={() => void live.loadMailboxHistory()}>Browse disconnected mailboxes</Button>
    {page.status !== 'idle' && <>
      <span role="status">{busy ? 'Loading mailbox history...' : page.status === 'error' ? page.error : `${page.items.length} archived mailboxes on this page - up to 25 per page`}</span>
      {page.status === 'error' && <Button size="sm" onClick={() => void live.loadMailboxHistory(page.after)}>Retry history</Button>}
      <Button size="sm" disabled={busy || !page.next || page.status === 'error'} onClick={() => page.next && void live.loadMailboxHistory(page.next.after)}>Next archived mailboxes</Button>
    </>}
  </div>
}
