// Sign-in and recovery forms for the session gate (BE-02A). Credentials live only in component
// state for the duration of the form; nothing is stored, logged or echoed. The controller owns the
// challenge/login exchange; this page only renders its generic outcomes (contract: no account
// existence leakage, bounded 429/503 retry, 503 keeps the entries).
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { ActionFailure } from '@/app/actionFailure'
import { useSession, type SignedOutNotice } from '@/app/session'
import { Button } from '@/ui/Button'
import { MailboxIcon } from '@/ui/icons'

const FOOTNOTE = 'Simulated local mail. Sign-in talks only to this installation; no live email is sent.'

type Mode = 'sign_in' | 'recovery' | 'recovery_sent'

function noticeText(notice: SignedOutNotice | null): string | null {
  if (notice === null) return null
  if (notice.kind === 'session_ended') return 'Your session ended. Sign in again to continue.'
  return notice.upstream === 'pending'
    ? 'You are signed out here. The identity provider sign-out is still pending.'
    : 'You are signed out.'
}

/**
 * Bounded retry hold for 429/503: the submit stays disabled until the server's Retry-After has
 * elapsed, then re-enables once. There is no automatic resubmission.
 */
function useRetryHold(failure: ActionFailure | null): number {
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    const seconds = failure?.retryAfterSeconds ?? 0
    setRemaining(seconds)
    if (seconds === 0) return
    const startedAt = Date.now()
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const left = Math.max(0, seconds - Math.floor((Date.now() - startedAt) / 1000))
      setRemaining(left)
      if (left > 0) timer = setTimeout(tick, 1000)
    }
    timer = setTimeout(tick, 1000)
    return () => clearTimeout(timer)
  }, [failure])
  return remaining
}

export function SignInPage() {
  const { state, signIn, requestRecovery } = useSession()
  const notice = state.status === 'unauthenticated' ? noticeText(state.notice) : null
  const [mode, setMode] = useState<Mode>('sign_in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ActionFailure | null>(null)
  const hold = useRetryHold(failure)
  const ids = { email: useId(), password: useId(), error: useId(), notice: useId() }
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  // Each submission gets a token so a superseded or post-unmount result cannot touch the form.
  const attemptRef = useRef(0)

  useEffect(() => {
    headingRef.current?.focus()
    return () => {
      attemptRef.current += 1
    }
  }, [mode])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || hold > 0) return
    const attempt = ++attemptRef.current
    setBusy(true)
    setFailure(null)
    const result = mode === 'recovery' ? await requestRecovery({ email }) : await signIn({ email, password })
    if (attemptRef.current !== attempt) return
    setBusy(false)
    if (result.kind === 'superseded') return
    if (result.kind === 'failed') {
      setFailure(result.failure)
      if (result.failure.code === 'rejected') setPassword('') // never keep a rejected password around
      return
    }
    if (mode === 'recovery') {
      setMode('recovery_sent')
      setPassword('')
    }
    // A successful sign-in replaces this page through the session gate; nothing to reset here.
  }

  const switchMode = (next: Mode) => {
    attemptRef.current += 1
    setBusy(false)
    setFailure(null)
    setMode(next)
  }

  const disabled = busy || hold > 0
  const describedBy = [failure ? ids.error : null, notice ? ids.notice : null].filter(Boolean).join(' ') || undefined

  if (mode === 'recovery_sent') {
    return (
      <main className="mx-auto flex max-w-sm flex-col gap-4 p-8" aria-labelledby="recovery-sent-heading">
        <Brand />
        <h1 id="recovery-sent-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold tracking-tight">Check your email</h1>
        <p role="status" className="text-[13px] text-muted">
          If an account exists for that address, a recovery message has been sent. Open the link in it to set a new password. The link works once and expires.
        </p>
        <Button variant="secondary" onClick={() => switchMode('sign_in')}>Back to sign-in</Button>
        <p className="text-[11px] leading-snug text-fg">{FOOTNOTE}</p>
      </main>
    )
  }

  const recovery = mode === 'recovery'
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-8" aria-labelledby="sign-in-heading">
      <Brand />
      <h1 id="sign-in-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold tracking-tight">
        {recovery ? 'Recover access' : 'Sign in'}
      </h1>
      {notice && !recovery && (
        <p id={ids.notice} role="status" className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px]">
          {notice}
        </p>
      )}
      {recovery && (
        <p className="text-[13px] text-muted">Enter your email address. If an account exists, a message with a one-time link will be sent to it.</p>
      )}
      <form onSubmit={submit} aria-busy={busy} aria-describedby={describedBy} className="flex flex-col gap-3" noValidate>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.email} className="text-[13px] font-medium">Email address</label>
          <input
            id={ids.email}
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            maxLength={320}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={disabled}
            aria-invalid={failure?.code === 'invalid' || failure?.code === 'rejected' ? true : undefined}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-fg disabled:opacity-55"
          />
        </div>
        {!recovery && (
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.password} className="text-[13px] font-medium">Password</label>
            <input
              id={ids.password}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={disabled}
              aria-invalid={failure?.code === 'invalid' || failure?.code === 'rejected' ? true : undefined}
              className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-fg disabled:opacity-55"
            />
          </div>
        )}
        {failure && (
          <p id={ids.error} role="alert" className="text-[13px] text-danger">
            {failure.message}
            {hold > 0 && ` You can try again in ${hold} s.`}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={disabled}>
          {busy ? (recovery ? 'Sending…' : 'Signing in…') : recovery ? 'Send recovery message' : 'Sign in'}
        </Button>
      </form>
      <Button variant="ghost" size="sm" className="self-start" onClick={() => switchMode(recovery ? 'sign_in' : 'recovery')} disabled={busy}>
        {recovery ? 'Back to sign-in' : 'Forgot your password?'}
      </Button>
      <p className="text-[11px] leading-snug text-fg">{FOOTNOTE}</p>
    </main>
  )
}

function Brand() {
  return (
    <div className="flex h-9 items-center gap-2.5">
      <MailboxIcon aria-hidden className="size-6 shrink-0 text-accent-text" />
      <span className="truncate text-[15px] font-semibold tracking-tight">Elevateo Mail</span>
    </div>
  )
}
