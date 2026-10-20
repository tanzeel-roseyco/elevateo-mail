// Settings route tree, mounted at /settings/* by App.tsx. Legacy URLs from the previous shell
// (/settings/personal, /settings/organization) redirect to their new homes so bookmarks survive.
import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { SettingsLayout } from './SettingsLayout'
import { WorkspaceCreatePage, WorkspaceHubPage, WorkspaceInvitationsPage, WorkspaceInvitePage, WorkspaceMembersPage, WorkspaceNamePage } from './WorkspacePages'
import { PasswordPage, ProfileHubPage } from './ProfilePages'
import { TagsPage } from './TagsPage'
import { DeveloperApiPage } from './DeveloperApiPage'
import { WebhookCreatePage, WebhooksPage } from './WebhooksPages'
import { IntegrationDetailPage, IntegrationsPage } from './IntegrationsPages'

// The real V2 display-name page keeps its own chunk; it is the only server-backed settings form.
const PersonalSettingsPage = lazy(() => import('@/features/members/PersonalSettingsPage').then((page) => ({ default: page.PersonalSettingsPage })))

export function SettingsRoutes() {
  return (
    <Routes>
      <Route element={<SettingsLayout />}>
        {/* /settings is the hub itself: an index Navigate left the outlet empty in jsdom (R4/R6 gate). */}
        <Route index element={<WorkspaceHubPage />} />
        <Route path="workspace" element={<WorkspaceHubPage />} />
        <Route path="workspace/name" element={<WorkspaceNamePage />} />
        <Route path="workspace/invite" element={<WorkspaceInvitePage />} />
        <Route path="workspace/members" element={<WorkspaceMembersPage />} />
        <Route path="workspace/invitations" element={<WorkspaceInvitationsPage />} />
        <Route path="workspace/create" element={<WorkspaceCreatePage />} />
        <Route path="profile" element={<ProfileHubPage />} />
        <Route path="profile/personal-details" element={<PersonalSettingsPage />} />
        <Route path="profile/password" element={<PasswordPage />} />
        <Route path="tags" element={<TagsPage />} />
        <Route path="developer-api" element={<DeveloperApiPage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
        <Route path="webhooks/create" element={<WebhookCreatePage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="integrations/:slug" element={<IntegrationDetailPage />} />
        {/* Legacy routes registered by the former people/settings feature module. */}
        <Route path="personal" element={<Navigate to="/settings/profile/personal-details" replace />} />
        <Route path="organization" element={<Navigate to="/settings/workspace/members" replace />} />
        <Route path="*" element={<Navigate to="/settings/workspace" replace />} />
      </Route>
    </Routes>
  )
}
