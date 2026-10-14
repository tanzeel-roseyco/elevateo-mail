import { SendReviewPage } from '@/features/send/SendReviewPage'
import { SendStatusPage } from '@/features/send/SendStatusPage'
import { SendIntentProvider } from './sendIntent'
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
import { FeatureGatewaysProvider, useFeatureGateways, type FeatureGateways } from './featureGateways'
import { featureRoutes } from './features'
import { SessionProvider } from './session'
import { Shell } from './Shell'

// FE-805: Mira's reader takes the direct-message capability as an optional prop; absence keeps her
// honest "unavailable" state. exactOptionalPropertyTypes forbids an explicit undefined, hence the spread.
function ThreadRoute() {
  const { readDirectMessage } = useFeatureGateways()
  return <ThreadPage {...(readDirectMessage === undefined ? {} : { readDirectMessage })} />
}

// AIDEV-NOTE: Hash routing keeps deep links working when Rails or the dev proxy serves one page;
// swap to BrowserRouter once the host serves the SPA for every route.
export function App({ gateway, featureGateways = {} }: { gateway: MailroomGateway; featureGateways?: FeatureGateways }) {
  return (
    <SessionProvider gateway={gateway}>
      {/* FE-805: optional feature capabilities (Outreach reads, V2 admin) sit beside the frozen V1 gateway. */}
      <FeatureGatewaysProvider value={featureGateways}>
      {/* Unsaved draft intent lives above the router and the recoverable protected subtree. */}
      <DraftIntentProvider>
      <SendIntentProvider>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<MailboxSelection />} />
            <Route path="/mailboxes/:mailboxId" element={<InboxPage />} />
            <Route path="/mailboxes/:mailboxId/threads/:threadId" element={<ThreadRoute />} />
            {/* BE-02 C/D: drafts, membership and search are URL-addressed like every other view. */}
            <Route path="/mailboxes/:mailboxId/drafts" element={<DraftsPage />} />
            <Route path="/mailboxes/:mailboxId/drafts/:draftId" element={<DraftEditorPage />} />
            <Route path="/mailboxes/:mailboxId/drafts/:draftId/send-review" element={<SendReviewPage />} />
            <Route path="/mailboxes/:mailboxId/send-intents/:sendId" element={<SendStatusPage />} />
            <Route path="/mailboxes/:mailboxId/members" element={<MembersPage />} />
            <Route path="/search" element={<SearchPage />} />
            {/* FE-805: registered feature routes (Outreach etc.) come from the validated registry. */}
            {featureRoutes.map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      </SendIntentProvider>
      </DraftIntentProvider>
      </FeatureGatewaysProvider>
    </SessionProvider>
  )
}
