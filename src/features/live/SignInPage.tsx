import { FlaskConical, Info } from 'lucide-react'
import { useState } from 'react'
import { live, useLive } from '@/data/http/instance'
import { FIXTURE_USERS, type FixtureUser } from '@/data/http/ports'
import { Callout, usePageTitle } from '@/ui/Bits'
import { Button } from '@/ui/Button'

// AIDEV-NOTE: The session is an HttpOnly cookie set by the server; this page never sees, asks for or stores a token.
// The server has no production sign-in yet. Only the Docker fixture can start a session, for two synthetic users,
// and only fixture builds show those buttons. Production must replace this screen with real authentication.
export function SignInPage({ expired }: { expired: boolean }) {
  usePageTitle('Sign in')
  // The reason comes from the store: this page is replaced by a loading screen while a session is being checked.
  const error = useLive((s) => (s.session.status === 'signed_out' ? (s.session.reason ?? null) : null))
  const [busy, setBusy] = useState<FixtureUser | null>(null)

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
      {live.canFixtureSignIn ? (
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
      ) : (
        <section aria-label="Sign-in" className="rounded-xl border border-line bg-surface p-5 text-sm shadow-sm">
          <p className="font-semibold">You are not signed in</p>
          <p className="mt-1 text-[13px] text-muted">Sign-in is not available yet: the server does not offer it. Nothing can be loaded until it does.</p>
          <Button className="mt-3" onClick={() => void live.retry()}>
            Check again
          </Button>
        </section>
      )}
      <Callout tone="info" icon={Info}>
        Sign-in with your own account is not built yet. This screen never asks for a Google, email or provider password, and never for a session token.
      </Callout>
    </main>
  )
}
