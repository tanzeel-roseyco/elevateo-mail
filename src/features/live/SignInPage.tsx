import { FlaskConical, Info } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { http, live, useLive } from '@/data/http/instance'
import { createAuthGateway, openGoogleSignIn } from '@/data/http/authGateway'
import { FIXTURE_USERS, type FixtureUser } from '@/data/http/ports'
import { Callout, usePageTitle } from '@/ui/Bits'
import { Button } from '@/ui/Button'

// AIDEV-NOTE: The session is an HttpOnly cookie set by the server; this page never sees, asks for or stores a token.
const auth = createAuthGateway(http)
export function SignInPage({ expired }: { expired: boolean }) {
  usePageTitle('Sign in')
  // The reason comes from the store: this page is replaced by a loading screen while a session is being checked.
  const error = useLive((s) => (s.session.status === 'signed_out' ? (s.session.reason ?? null) : null))
  const [busy, setBusy] = useState<FixtureUser | null>(null)
  const [availability, setAvailability] = useState<'loading' | 'enabled' | 'disabled' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const active = useRef(false)
  const pending = useRef(false)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  useEffect(() => {
    let current = true
    setAvailability('loading')
    void auth.status().then(result => {
      if (current) setAvailability(result.enabled ? 'enabled' : 'disabled')
    }).catch(() => { if (current) setAvailability('error') })
    return () => { current = false }
  }, [attempt])
  const google = async () => {
    if (pending.current) return
    pending.current = true; setStarting(true); setLoginError(null)
    try {
      const result = await auth.begin()
      if (active.current) {
        if (result.expiresAt <= Date.now()) throw new Error('Expired login attempt')
        openGoogleSignIn(result.authorizationUrl)
      }
    } catch {
      if (active.current) setLoginError('Google sign-in could not start. Please try again.')
    } finally {
      pending.current = false
      if (active.current) setStarting(false)
    }
  }

  const start = (user: FixtureUser) => {
    setBusy(user)
    void live.fixtureSignIn(user).finally(() => setBusy(null))
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-5 py-10">
      <div className="flex items-center gap-2.5">
        <img src="/logo.png" alt="" width={36} height={36} className="size-9 object-contain" />
        <h1 className="text-xl font-semibold tracking-tight">Elevateo Mail</h1>
      </div>
      {expired && (
        <div role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-[13px]">
          <p className="font-semibold">Your session has ended</p>
          <p className="mt-0.5">The server no longer accepts it, so the mail and account details that were on screen have been cleared. Requests you had already approved are still with the server.</p>
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px]">
          {error}
        </div>
      )}
      <section aria-label="Sign-in" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 text-sm shadow-sm">
        <p className="font-semibold">Sign in to your private workspace</p>
        {availability === 'loading' && <p role="status">Checking sign-in availability…</p>}
        {availability === 'enabled' && <Button variant="primary" disabled={starting} onClick={() => void google()}>{starting ? 'Opening Google…' : 'Continue with Google'}</Button>}
        {availability === 'disabled' && <p>Google sign-in is not enabled on this server. Deployment credentials and approved accounts must be configured first.</p>}
        {availability === 'error' && <p role="alert">Could not check sign-in availability.</p>}
        {(availability === 'error' || availability === 'disabled') && <Button onClick={() => setAttempt(value => value + 1)}>Check sign-in again</Button>}
        {loginError && <p role="alert">{loginError}</p>}
      </section>
      {live.canFixtureSignIn && (
        <section aria-label="Test fixture sign-in" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical aria-hidden className="size-4" />
            Test fixture
          </p>
          <p className="text-[13px] text-muted">This build is connected to a local test server with two synthetic accounts. Choosing one asks that server to start a session; no password or token is entered or shown.</p>
          <div className="flex flex-wrap gap-2">
            {FIXTURE_USERS.map((user) => (
              <Button key={user} variant="primary" disabled={busy !== null} onClick={() => start(user)}>
                {busy === user ? 'Starting…' : `Continue as synthetic user ${user}`}
              </Button>
            ))}
          </div>
        </section>
      )}
      <Callout tone="info" icon={Info}>
        Google sign-in opens Google's own page. This screen never asks for your password or a session token. Connecting a mailbox is a separate permission step.
      </Callout>
    </main>
  )
}
