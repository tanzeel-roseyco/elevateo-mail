// Sign-in and recovery forms for the session gate (BE-02A). Credentials live only in component
// state for the duration of the form; nothing is stored, logged or echoed. The controller owns the
// challenge/login exchange; this page only renders its generic outcomes (contract: no account
// existence leakage, bounded 429/503 retry, 503 keeps the entries).
// Presentation: a centred Flux card on the zinc-50 canvas (DESIGN-SPEC §5.3/§5.5).
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { ActionFailure } from '@/app/actionFailure'
import { useSession, type SignedOutNotice } from '@/app/session'
import { BrandLockup } from '@/ui/BrandLockup'
import { Button } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { Field, TextInput } from '@/ui/Field'

// AIDEV-NOTE: Transport mode is only known after authentication; this form must not claim mail is simulated.
const FOOTNOTE = 'Sign in securely to this Elevateo Mail installation.'

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

/** Centred card frame shared by sign-in, recovery and the completion form. */
export function AuthFrame({ children, labelledBy }: { children: ReactNode; labelledBy?: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-900" aria-labelledby={labelledBy}>
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-700 dark:bg-zinc-800">
        <BrandLockup />
        {children}
        <p className="text-xs leading-snug text-zinc-500">{FOOTNOTE}</p>
      </div>
    </main>
  )
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
  const invalid = failure?.code === 'invalid' || failure?.code === 'rejected' ? true : undefined

  if (mode === 'recovery_sent') {
    return (
      <AuthFrame labelledBy="recovery-sent-heading">
        <div className="space-y-2">
          <h1 id="recovery-sent-heading" ref={headingRef} tabIndex={-1} className="text-lg font-medium text-zinc-800 dark:text-white">Check your email</h1>
          <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
            If an account exists for that address, a recovery message has been sent. Open the link in it to set a new password. The link works once and expires.
          </p>
        </div>
        <Button variant="outline" onClick={() => switchMode('sign_in')}>Back to sign-in</Button>
      </AuthFrame>
    )
  }

  const recovery = mode === 'recovery'
  return (
    <AuthFrame labelledBy="sign-in-heading">
      <div className="space-y-2">
        <h1 id="sign-in-heading" ref={headingRef} tabIndex={-1} className="text-lg font-medium text-zinc-800 dark:text-white">
          {recovery ? 'Recover access' : 'Sign in'}
        </h1>
        {recovery && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Enter your email address. If an account exists, a message with a one-time link will be sent to it.</p>
        )}
      </div>
      {notice && !recovery && (
        <div id={ids.notice}>
          <Callout variant="neutral" role="status">{notice}</Callout>
        </div>
      )}
      <form onSubmit={submit} aria-busy={busy} aria-describedby={describedBy} className="flex flex-col gap-4" noValidate>
        <Field id={ids.email} label="Email address">
          <TextInput
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
            aria-invalid={invalid}
          />
        </Field>
        {!recovery && (
          <Field
            id={ids.password}
            label="Password"
            labelAside={
              <button type="button" className="text-sm font-medium text-(--color-accent-content) hover:underline" onClick={() => switchMode('recovery')} disabled={busy}>
                Forgot your password?
              </button>
            }
          >
            <TextInput
              id={ids.password}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={disabled}
              aria-invalid={invalid}
            />
          </Field>
        )}
        {failure && (
          <p id={ids.error} role="alert" className="text-sm font-medium text-red-500">
            {failure.message}
            {hold > 0 && ` You can try again in ${hold} s.`}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={disabled}>
          {busy ? (recovery ? 'Sending…' : 'Signing in…') : recovery ? 'Send recovery message' : 'Sign in'}
        </Button>
      </form>
      {recovery && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => switchMode('sign_in')} disabled={busy}>
          Back to sign-in
        </Button>
      )}
    </AuthFrame>
  )
}
