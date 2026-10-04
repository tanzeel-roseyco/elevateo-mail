import { AlertTriangle, Compass, ServerOff } from 'lucide-react'
import { lazy, useEffect } from 'react'
import { createBrowserRouter, Link, Navigate, RouterProvider, useRouteError } from 'react-router'
import { useApplyAppearance } from '@/app/appearance'
import { live, useLive } from '@/data/http/instance'
import { EmptyState, Skeleton } from '@/ui/Bits'
import { Button, buttonClass } from '@/ui/Button'
import { ConfirmHost } from '@/ui/confirm'
import { Toaster } from '@/ui/toast'
import { LiveInboxPage } from './LiveInboxPage'
import { LiveShell } from './LiveShell'
import { SignInPage } from './SignInPage'
import { UnavailablePage } from './UnavailablePage'

const ComposePage = lazy(() => import('./ComposePage').then((m) => ({ default: m.ComposePage })))
const SendsPage = lazy(() => import('./SendsPage').then((m) => ({ default: m.SendsPage })))
const LiveConnectionsPage = lazy(() => import('./LiveConnectionsPage').then((m) => ({ default: m.LiveConnectionsPage })))
const LiveSettingsPage = lazy(() => import('./LiveSettingsPage').then((m) => ({ default: m.LiveSettingsPage })))

function RouteError() {
  const error = useRouteError()
  return (
    <div className="flex h-dvh items-center justify-center bg-surface">
      <EmptyState
        icon={AlertTriangle}
        title="This page hit a problem"
        body={error instanceof Error ? error.message : 'Something unexpected went wrong while showing this page.'}
        action={
          <a href="/mail" className={buttonClass('primary')}>
            Back to inbox
          </a>
        }
      />
    </div>
  )
}

// AIDEV-NOTE: API-backed sitemap. Areas the server does not support yet keep their place in the layout but render
// an explicit unavailable state: no fixture data is ever shown in this mode.
const router = createBrowserRouter([
  {
    element: <LiveShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/mail" replace /> },
      { path: 'mail/:mailboxId?/:messageId?', element: <LiveInboxPage /> },
      { path: 'compose', element: <ComposePage /> },
      { path: 'sends/:key?', element: <SendsPage /> },
      { path: 'overview', element: <UnavailablePage area="overview" /> },
      { path: 'campaigns/*', element: <UnavailablePage area="campaigns" /> },
      { path: 'contacts/*', element: <UnavailablePage area="contacts" /> },
      { path: 'assistant', element: <UnavailablePage area="assistant" /> },
      { path: 'connections', element: <Navigate to="/connections/mailboxes" replace /> },
      { path: 'connections/:section', element: <LiveConnectionsPage /> },
      { path: 'settings', element: <Navigate to="/settings/account" replace /> },
      { path: 'settings/:section', element: <LiveSettingsPage /> },
      {
        path: '*',
        element: (
          <EmptyState
            icon={Compass}
            title="Page not found"
            body="That address does not match any page."
            action={
              <Link to="/mail" className={buttonClass('primary')}>
                Go to inbox
              </Link>
            }
          />
        ),
      },
    ],
  },
])

export function LiveApp() {
  useApplyAppearance()
  const session = useLive((s) => s.session)

  useEffect(() => {
    void live.start()
    // Another tab of this browser changed a send request or signed out: reflect it here.
    const onStorage = (event: StorageEvent) => live.onStorageEvent(event.key, event.newValue)
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // The next person to sign in must not land on the previous account's page or ids.
  const signedIn = session.status !== 'signed_out' && session.status !== 'expired'
  useEffect(() => {
    if (!signedIn) void router.navigate('/', { replace: true })
  }, [signedIn])

  return (
    <>
      {(session.status === 'signed_out' || session.status === 'expired') && <SignInPage expired={session.status === 'expired'} />}
      {session.status === 'loading' && (
        <div className="mx-auto max-w-2xl pt-24">
          <p className="px-6 text-sm text-muted">Contacting the server…</p>
          <Skeleton rows={8} />
        </div>
      )}
      {session.status === 'unavailable' && (
        <div role="alert" className="flex h-dvh items-center justify-center">
          <EmptyState
            icon={ServerOff}
            title="The server is unavailable"
            body={`${session.message} Nothing is shown in its place: this build has no offline copy of your mail.`}
            action={
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => void live.retry()}>
                  Try again
                </Button>
                <Button onClick={() => live.signOut()}>Sign out</Button>
              </div>
            }
          />
        </div>
      )}
      {session.status === 'ready' && <RouterProvider router={router} />}
      <Toaster />
      <ConfirmHost />
    </>
  )
}
