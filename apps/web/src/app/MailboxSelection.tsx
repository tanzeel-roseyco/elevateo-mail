import { EmptyState, Skeleton } from '@/ui/Async'
import { useMailboxes } from './mailboxes'

export function MailboxSelection() {
  const snapshot = useMailboxes()
  // AIDEV-NOTE: Only a completed mailbox traversal establishes zero visible mailboxes.
  if (snapshot.status === 'loading') {
    return <div role="status" aria-label="Loading mailbox selection"><Skeleton rows={4} /></div>
  }
  if (snapshot.status === 'error') {
    return <EmptyState title="Mailboxes could not be loaded" body="Try again in the mailbox menu." />
  }
  if (snapshot.mailboxes.length === 0) {
    return (
      <EmptyState
        title="No visible mailboxes"
        body="If you expected a mailbox here, ask your organization administrator to check your access."
      />
    )
  }
  return <EmptyState title="Select a mailbox" body="Choose a mailbox from the list to read its conversations." />
}
