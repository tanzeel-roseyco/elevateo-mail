import { HashRouter, Navigate, Route, Routes } from 'react-router'
import type { MailroomGateway } from '@/data/gateway'
import { DraftEditorPage } from '@/features/drafts/DraftEditorPage'
import { DraftsPage } from '@/features/drafts/DraftsPage'
import { InboxPage } from '@/features/inbox/InboxPage'
import { MembersPage } from '@/features/members/MembersPage'
import { SearchPage } from '@/features/search/SearchPage'
import { ThreadPage } from '@/features/thread/ThreadPage'
import { MailboxSelection } from './MailboxSelection'
import { DraftIntentProvider } from './draftIntent'
import { SessionProvider } from './session'
import { Shell } from './Shell'

// AIDEV-NOTE: Hash routing keeps deep links working when Rails or the dev proxy serves one page;
// swap to BrowserRouter once the host serves the SPA for every route.
export function App({ gateway }: { gateway: MailroomGateway }) {
  return (
    <SessionProvider gateway={gateway}>
      {/* Unsaved draft intent lives above the router and the recoverable protected subtree. */}
      <DraftIntentProvider>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<MailboxSelection />} />
            <Route path="/mailboxes/:mailboxId" element={<InboxPage />} />
            <Route path="/mailboxes/:mailboxId/threads/:threadId" element={<ThreadPage />} />
            {/* BE-02 C/D: drafts, membership and search are URL-addressed like every other view. */}
            <Route path="/mailboxes/:mailboxId/drafts" element={<DraftsPage />} />
            <Route path="/mailboxes/:mailboxId/drafts/:draftId" element={<DraftEditorPage />} />
            <Route path="/mailboxes/:mailboxId/members" element={<MembersPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      </DraftIntentProvider>
    </SessionProvider>
  )
}
