import { Info } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { live, useLive } from '@/data/http/instance'
import { Callout, usePageTitle } from '@/ui/Bits'
import { Button } from '@/ui/Button'
import { Field, Input } from '@/ui/Field'

// AIDEV-NOTE: There is no real sign-in yet (the server mints no sessions). A pilot session issued offline is entered
// here and kept for this tab only. Production must replace this screen with real authentication.
export function SignInPage({ expired }: { expired: boolean }) {
  usePageTitle('Sign in')
  const [token, setToken] = useState('')
  // The reason comes from the store: this page is replaced by a loading screen while a session is being checked.
  const error = useLive((s) => (s.session.status === 'signed_out' ? (s.session.reason ?? null) : null))
  const [busy, setBusy] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    void live.signIn(token).finally(() => setBusy(false))
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
      <form noValidate onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-sm">
        <Field label="Pilot session" error={error} hint="Issued to you offline for the pilot. It is kept for this tab only and is cleared when you sign out.">
          {(p) => <Input {...p} type="password" autoComplete="off" spellCheck={false} disabled={busy} value={token} onChange={(e) => setToken(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" disabled={busy || token.trim() === ''}>
          {busy ? 'Checking…' : 'Continue'}
        </Button>
      </form>
      <Callout tone="info" icon={Info}>
        Sign-in with your own account is not built yet. This screen never asks for a Google, email or provider password.
      </Callout>
    </main>
  )
}
