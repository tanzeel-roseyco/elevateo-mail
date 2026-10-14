import { lazy } from 'react'
import { SendIntentProvider } from './sendIntent'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import type { MailroomGateway } from '@/data/gateway'
import { InboxPage } from '@/features/inbox/InboxPage'
import { MailboxSelection } from './MailboxSelection'
import { DraftIntentProvider } from './draftIntent'
import { FeatureGatewaysProvider, useFeatureGateways, type FeatureGateways } from './featureGateways'
import { featureRoutes } from './features'
import { SessionProvider } from './session'
import { Shell } from './Shell'

// AIDEV-NOTE: Keep the initial inbox eager; other pages share Shell's loading/error boundary and session guard.
const DraftEditorPage = lazy(() => import('@/features/drafts/DraftEditorPage').then((page) => ({ default: page.DraftEditorPage })))
const DraftsPage = lazy(() => import('@/features/drafts/DraftsPage').then((page) => ({ default: page.DraftsPage })))
const MembersPage = lazy(() => import('@/features/members/MembersPage').then((page) => ({ default: page.MembersPage })))
const SearchPage = lazy(() => import('@/features/search/SearchPage').then((page) => ({ default: page.SearchPage })))
const ThreadPage = lazy(() => import('@/features/thread/ThreadPage').then((page) => ({ default: page.ThreadPage })))
const SendReviewPage = lazy(() => import('@/features/send/SendReviewPage').then((page) => ({ default: page.SendReviewPage })))
const SendStatusPage = lazy(() => import('@/features/send/SendStatusPage').then((page) => ({ default: page.SendStatusPage })))

// FE-805: Mira's reader takes the direct-message capability as an optional prop; absence keeps her
// honest "unavailable" state. exactOptionalPropertyTypes forbids an explicit undefined, hence the spread.
function ThreadRoute() {
  const { readDirectMessage, attachmentPort } = useFeatureGateways()
  return <ThreadPage {...(readDirectMessage === undefined ? {} : { readDirectMessage })}
    {...(attachmentPort === undefined ? {} : { attachmentPort })} />
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
