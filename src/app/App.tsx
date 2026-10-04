import { AlertTriangle, Compass } from 'lucide-react'
import { lazy, useCallback, useEffect, useState } from 'react'
import { createBrowserRouter, Link, Navigate, RouterProvider, useRouteError } from 'react-router'
import { gateway } from '@/data/gateway'
import { startPersistence } from '@/data/store'
import { MailPage } from '@/features/mail/MailPage'
import { ActivityPage } from '@/features/overview/ActivityPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { SearchPage } from '@/features/search/SearchPage'
import { EmptyState, Skeleton } from '@/ui/Bits'
import { Button, buttonClass } from '@/ui/Button'
import { ConfirmHost } from '@/ui/confirm'
import { toast, Toaster } from '@/ui/toast'
import { useApplyAppearance } from './appearance'
import { Shell } from './Shell'

// Less-visited areas load on demand to keep the initial bundle inside the STANDARDS §10 budget.
const CampaignsPage = lazy(() => import('@/features/campaigns/CampaignsPage').then((m) => ({ default: m.CampaignsPage })))
const CampaignDetailPage = lazy(() => import('@/features/campaigns/CampaignDetailPage').then((m) => ({ default: m.CampaignDetailPage })))
const CampaignWizard = lazy(() => import('@/features/campaigns/CampaignWizard').then((m) => ({ default: m.CampaignWizard })))
const ContactsPage = lazy(() => import('@/features/contacts/ContactsPage').then((m) => ({ default: m.ContactsPage })))
const ImportPage = lazy(() => import('@/features/contacts/ImportPage').then((m) => ({ default: m.ImportPage })))
const AssistantPage = lazy(() => import('@/features/assistant/AssistantPage').then((m) => ({ default: m.AssistantPage })))
const ConnectionsPage = lazy(() => import('@/features/connections/ConnectionsPage').then((m) => ({ default: m.ConnectionsPage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))

function RouteError() {
  const error = useRouteError()
  return (
    <div className="flex h-dvh items-center justify-center bg-surface">
      <EmptyState
        icon={AlertTriangle}
        title="This page hit a problem"
        body={error instanceof Error ? error.message : 'Something unexpected went wrong while showing this page.'}
        action={
          <a href="/overview" className={buttonClass('primary')}>
            Back to overview
          </a>
        }
      />
    </div>
  )
}

function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      body="That address does not match any page in the mailroom."
      action={
        <Link to="/overview" className={buttonClass('primary')}>
          Go to overview
        </Link>
      }
    />
  )
}

// AIDEV-NOTE: Sitemap lives here. Filters and open items are URL state so back/forward and deep links work.
const router = createBrowserRouter([
  {
    element: <Shell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: 'overview', element: <OverviewPage /> },
      { path: 'activity', element: <ActivityPage /> },
      { path: 'mail', element: <Navigate to="/mail/inbox" replace /> },
      { path: 'mail/:folder/:threadId?', element: <MailPage /> },
      { path: 'campaigns', element: <CampaignsPage /> },
      { path: 'campaigns/new', element: <CampaignWizard /> },
      { path: 'campaigns/:campaignId/:tab?', element: <CampaignDetailPage /> },
      { path: 'contacts', element: <ContactsPage /> },
      { path: 'contacts/import', element: <ImportPage /> },
      { path: 'assistant', element: <AssistantPage /> },
      { path: 'connections', element: <Navigate to="/connections/mailboxes" replace /> },
      { path: 'connections/:section', element: <ConnectionsPage /> },
      { path: 'settings', element: <Navigate to="/settings/appearance" replace /> },
      { path: 'settings/:section', element: <SettingsPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string }

export function App() {
  useApplyAppearance()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const load = useCallback(() => {
    setState({ status: 'loading' })
    gateway
      .load()
      .then(({ recovered }) => {
        startPersistence((message) => toast(message, { tone: 'error' }))
        setState({ status: 'ready' })
        if (recovered) toast('Saved prototype data could not be read, so the demo data was restored.', { tone: 'error' })
      })
      .catch((error: unknown) => setState({ status: 'error', message: error instanceof Error ? error.message : 'The mailroom could not be loaded.' }))
  }, [])

  useEffect(load, [load])

  return (
    <>
      {state.status === 'loading' && (
        <div className="mx-auto max-w-2xl pt-24">
          <p className="px-6 text-sm text-muted">Loading mailroom…</p>
          <Skeleton rows={8} />
        </div>
      )}
      {state.status === 'error' && (
        <div className="flex h-dvh items-center justify-center">
          <EmptyState icon={AlertTriangle} title="The mailroom could not be loaded" body={state.message} action={<Button variant="primary" onClick={load}>Try again</Button>} />
        </div>
      )}
      {state.status === 'ready' && <RouterProvider router={router} />}
      <Toaster />
      <ConfirmHost />
    </>
  )
}
