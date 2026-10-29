import { lazy } from 'react'
import { useEditableViewport } from '@/ui/useEditableViewport'
import { SendIntentProvider } from './sendIntent'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import type { MailroomGateway } from '@/data/gateway'
import { DashboardPage } from './DashboardPage'
import { DraftIntentProvider } from './draftIntent'
import { FeatureGatewaysProvider, useFeatureGateways, type FeatureGateways } from './featureGateways'
import { featureRoutes } from './features'
import { SessionProvider } from './session'
import { Shell } from './Shell'
import { RunIntentProvider } from '@/features/outreach/RunIntent'
import { InboxLayout } from '@/features/inbox/InboxLayout'
import { InboxPage } from '@/features/inbox/InboxPage'

// AIDEV-NOTE: Dashboard and the inbox list stay eager (first paint); every other page is a lazy
// chunk behind Shell's loading/error boundary and session guard.
const ComposeWindow = lazy(() => import('@/features/drafts/ComposeWindow').then((page) => ({ default: page.ComposeWindow })))
const DraftEditorPage = lazy(() => import('@/features/drafts/DraftEditorPage').then((page) => ({ default: page.DraftEditorPage })))
// The unified list is lazy: /inbox redirects straight to the mailbox page when only one is visible.
const UnifiedInboxPage = lazy(() => import('@/features/inbox/UnifiedInboxPage').then((page) => ({ default: page.UnifiedInboxPage })))
const DraftsPage = lazy(() => import('@/features/drafts/DraftsPage').then((page) => ({ default: page.DraftsPage })))
const MembersPage = lazy(() => import('@/features/members/MembersPage').then((page) => ({ default: page.MembersPage })))
const SearchPage = lazy(() => import('@/features/search/SearchPage').then((page) => ({ default: page.SearchPage })))
const ThreadPage = lazy(() => import('@/features/thread/ThreadPage').then((page) => ({ default: page.ThreadPage })))
const SendReviewPage = lazy(() => import('@/features/send/SendReviewPage').then((page) => ({ default: page.SendReviewPage })))
const SendStatusPage = lazy(() => import('@/features/send/SendStatusPage').then((page) => ({ default: page.SendStatusPage })))
const CampaignRunsPage = lazy(() => import('@/features/outreach/CampaignRunsPage').then((page) => ({ default: page.CampaignRunsPage })))
const SettingsRoutes = lazy(() => import('@/features/settings/SettingsRoutes').then((page) => ({ default: page.SettingsRoutes })))
const HelpRoutes = lazy(() => import('@/features/help/HelpRoutes').then((page) => ({ default: page.HelpRoutes })))

// FE-805: Mira's reader takes the direct-message capability as an optional prop; absence keeps her
// honest "unavailable" state. exactOptionalPropertyTypes forbids an explicit undefined, hence the spread.
function ThreadRoute() {
  const { readDirectMessage, attachmentPort } = useFeatureGateways()
  return <ThreadPage {...(readDirectMessage === undefined ? {} : { readDirectMessage })}
    {...(attachmentPort === undefined ? {} : { attachmentPort })} />
}

/** Gmail-style compose: the draft list stays behind the fixed compose window (INBOX-SPEC §5). */
function DraftEditorRoute() {
  return (
    <>
      <DraftsPage />
      <ComposeWindow><DraftEditorPage /></ComposeWindow>
    </>
  )
}

// AIDEV-NOTE: Hash routing keeps deep links working when Rails or the dev proxy serves one page;
// swap to BrowserRouter once the host serves the SPA for every route.
export function App({ gateway, featureGateways = {} }: { gateway: MailroomGateway; featureGateways?: FeatureGateways }) {
  useEditableViewport()
  return (
    <SessionProvider gateway={gateway}>
      {/* FE-805: optional feature capabilities (Outreach reads, V2 admin) sit beside the frozen V1 gateway. */}
      <FeatureGatewaysProvider value={featureGateways}>
      {/* Unsaved draft intent lives above the router and the recoverable protected subtree. */}
      <DraftIntentProvider>
      <SendIntentProvider>
      <RunIntentProvider>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<DashboardPage />} />
            {/* The old overview URL resolves to the dashboard; the sidebar "Inbox" entry is the unified
                list over every readable mailbox (one mailbox redirects to its own inbox page). */}
            <Route path="/overview" element={<Navigate to="/" replace />} />
            <Route path="/inbox" element={<UnifiedInboxPage />} />
            <Route path="/outreach/campaigns/:campaignId/runs" element={<CampaignRunsPage />} />
            {/* Gmail-structured mailbox area: folder column + list/thread/drafts (INBOX-SPEC). */}
            <Route path="/mailboxes/:mailboxId" element={<InboxLayout />}>
              <Route index element={<InboxPage />} />
              <Route path="threads/:threadId" element={<ThreadRoute />} />
              {/* BE-02 C/D: drafts, membership and search are URL-addressed like every other view. */}
              <Route path="drafts" element={<DraftsPage />} />
              <Route path="drafts/:draftId" element={<DraftEditorRoute />} />
            </Route>
            <Route path="/mailboxes/:mailboxId/drafts/:draftId/send-review" element={<SendReviewPage />} />
            <Route path="/mailboxes/:mailboxId/send-intents/:sendId" element={<SendStatusPage />} />
            <Route path="/mailboxes/:mailboxId/members" element={<MembersPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/settings/*" element={<SettingsRoutes />} />
            <Route path="/help/*" element={<HelpRoutes />} />
            {/* FE-805: registered feature routes (Outreach etc.) come from the validated registry. */}
            {featureRoutes.map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      </RunIntentProvider>
      </SendIntentProvider>
      </DraftIntentProvider>
      </FeatureGatewaysProvider>
    </SessionProvider>
  )
}
