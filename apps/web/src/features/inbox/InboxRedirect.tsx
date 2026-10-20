// `/inbox` is the sidebar entry: it opens the first visible mailbox once the traversal completes.
// A completed empty list is an explicit state (no mailbox is invented); loading and failure keep
// the page header so the shell never flashes an empty main region.
import { Link, Navigate } from 'react-router'
import { useMailboxes } from '@/app/mailboxes'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { buttonClass } from '@/ui/Button'
import { InboxIcon } from '@/ui/icons'
import { PageHeader } from '@/ui/PageHeader'

export function InboxRedirect() {
  const snapshot = useMailboxes()
  if (snapshot.status === 'ready' && snapshot.mailboxes.length > 0) {
    return <Navigate to={`/mailboxes/${snapshot.mailboxes[0]!.id}`} replace />
  }
  return (
    <>
      <PageHeader title="Inbox" subtitle="Your mailboxes" />
      {snapshot.status === 'loading' && <div role="status" aria-label="Loading mailbox selection"><Skeleton rows={4} /></div>}
      {snapshot.status === 'error' && (
        <ErrorState title="Mailboxes could not be loaded" body="Use Try again in the navigation, or reload the page." action={<a href="." className={buttonClass('primary', 'md')}>Reload page</a>} />
      )}
      {snapshot.status === 'ready' && (
        <EmptyState
          icon={<InboxIcon className="size-5" />}
          title="No visible mailboxes"
          body="If you expected a mailbox here, ask your organization administrator to check your access."
          action={<Link to="/settings/workspace" className={buttonClass('primary', 'md')}>Open workspace settings</Link>}
        />
      )}
    </>
  )
}
