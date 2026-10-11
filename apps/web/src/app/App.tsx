import { HashRouter, Navigate, Route, Routes } from 'react-router'
import type { MailroomGateway } from '@/data/gateway'
import { InboxPage } from '@/features/inbox/InboxPage'
import { ThreadPage } from '@/features/thread/ThreadPage'
import { EmptyState } from '@/ui/Async'
import { SessionProvider } from './session'
import { Shell } from './Shell'

// AIDEV-NOTE: Hash routing keeps deep links working when Rails or the dev proxy serves one page;
// swap to BrowserRouter once the host serves the SPA for every route.
export function App({ gateway }: { gateway: MailroomGateway }) {
  return (
    <SessionProvider gateway={gateway}>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<EmptyState title="Select a mailbox" body="Choose a mailbox from the list to read its conversations." />} />
            <Route path="/mailboxes/:mailboxId" element={<InboxPage />} />
            <Route path="/mailboxes/:mailboxId/threads/:threadId" element={<ThreadPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </SessionProvider>
  )
}
