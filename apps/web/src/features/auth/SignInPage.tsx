// Sign-in entry for the session gate (BE-02A password flow + launch-sprint app-level SSO).
// The page first asks the server which entries it offers (ssoContract.ts): a single sign-on button,
// the password form, both, or neither. Nothing is assumed client-side: a failed status read fails
// closed (no form), and the password form appears only when the server reports it enabled.
// Credentials live only in component state for the duration of the form; nothing is stored,
// logged or echoed. The controller owns the challenge/login exchange; this page only renders its
// generic outcomes (contract: no account existence leakage, bounded 429/503 retry, 503 keeps the
// entries). SSO itself is a full-page navigation to the server; the UI never sees an IdP token.
// Presentation: a centred Flux card on the zinc-50 canvas (DESIGN-SPEC §5.3/§5.5).
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { classifyFailure, type ActionFailure } from '@/app/actionFailure'
import { useGateway, useSession, type SignedOutNotice } from '@/app/session'
import type { MailroomGateway } from '@/data/gateway'
import {
  isSsoProviderUnsupported,
  isSsoUsable,
  readSsoLandingError,
  SSO_START_PATH,
  ssoLandingErrorText,
  stripSsoLandingError,
  type AuthSsoStatus,
  type SsoLandingError,
} from '@/data/ssoContract'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { BrandLockup } from '@/ui/BrandLockup'
import { Button } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { Field, TextInput } from '@/ui/Field'
import { ArrowRightStartOnRectangleIcon, KeyIcon } from '@/ui/icons'
import { useDesktopReady } from '@/app/desktopHost'

// AIDEV-NOTE: Transport mode is only known after authentication; this form must not claim mail is simulated.
const FOOTNOTE = 'Sign in securely to this Elevateo Mail installation.'

type Mode = 'sign_in' | 'recovery' | 'recovery_sent'

/**
 * The browser surfaces the SSO entry needs. Production uses the real location; tests inject a
 * recorder so no jsdom navigation is attempted.
 * AIDEV-NOTE: SSO start is a top-level navigation (server redirects to the IdP), never fetch: the
 * IdP round trip must leave the document, and the callback's cookie lands on the next bootstrap.
 */
export interface SignInNavigation {
  assign(url: string): void
  readSearch(): string
  replaceSearch(search: string): void
  /**
   * Called when the document is restored after leaving (browser Back from the IdP page restores
   * it from the back/forward cache with React state intact). Returns the unsubscribe.
   */
  onRestore(callback: () => void): () => void
}

export const browserNavigation: SignInNavigation = {
  assign: (url) => window.location.assign(url),
  readSearch: () => window.location.search,
  replaceSearch: (search) => window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}${window.location.hash}`),
  onRestore: (callback) => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) callback()
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  },
}

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

type SsoStatusState = { status: 'loading' } | { status: 'ready'; options: AuthSsoStatus } | { status: 'error'; message: string }

/** Status-read failures are not form failures: no "entries kept" wording, just why nothing is offered. */
function statusFailureText(error: unknown): string {
  const code = classifyFailure(error).code
  if (code === 'unavailable' || code === 'rate_limited') return 'The sign-in service is temporarily unavailable. Try again in a moment.'
  return 'The sign-in options could not be read from the server. Try again.'
}

/** One status read per mount or explicit retry; an unmount or newer attempt aborts the older read. */
function useSsoStatus(gateway: MailroomGateway): { state: SsoStatusState; retry(): void } {
  const [state, setState] = useState<SsoStatusState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    gateway.getSsoStatus(controller.signal).then(
      (options) => {
        if (!controller.signal.aborted) setState({ status: 'ready', options })
      },
      (error: unknown) => {
        // Fail closed: an unreadable status offers no entry at all until a retry succeeds.
        if (!controller.signal.aborted) setState({ status: 'error', message: statusFailureText(error) })
      },
    )
    return () => controller.abort()
  }, [gateway, attempt])
  return { state, retry: () => setAttempt((n) => n + 1) }
}

/** Centred card frame shared by sign-in, recovery and the completion form. */
export function AuthFrame({ children, labelledBy }: { children: ReactNode; labelledBy?: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-900" aria-labelledby={labelledBy}>
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-700 dark:bg-zinc-800">
        <BrandLockup linked={false} />
        {children}
        <p className="text-xs leading-snug text-zinc-500">{FOOTNOTE}</p>
      </div>
    </main>
  )
}

export function SignInPage({ navigation = browserNavigation }: { navigation?: SignInNavigation }) {
  const gateway = useGateway()
  const { state: sessionState } = useSession()
  const notice = sessionState.status === 'unauthenticated' ? noticeText(sessionState.notice) : null
  const sso = useSsoStatus(gateway)
  const [mode, setMode] = useState<Mode>('sign_in')
  // Lifted so "Back to sign-in" after a recovery request keeps the typed address (as before SSO).
  const [email, setEmail] = useState('')
  const [redirecting, setRedirecting] = useState(false)
  // The callback failure is read once from the URL, shown generically, and removed from the
  // address bar so a reload or bookmark cannot repeat a stale message.
  const [landing, setLanding] = useState<SsoLandingError | null>(() => readSsoLandingError(navigation.readSearch()))
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const ids = { notice: useId(), landing: useId() }
  // Reaching sign-in after an update is a healthy launch (desktop shell only; no-op in browsers).
  useDesktopReady(true)

  // Consumed exactly once per mount (StrictMode runs effects twice; the ref keeps replaceSearch single).
  const landingConsumedRef = useRef(false)
  useEffect(() => {
    if (landingConsumedRef.current) return
    landingConsumedRef.current = true
    const search = navigation.readSearch()
    if (readSsoLandingError(search) !== null) navigation.replaceSearch(stripSsoLandingError(search))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arrival-only read; later navigation identity is irrelevant
  }, [])

  // AIDEV-NOTE: Back from the IdP restores this document from bfcache with `redirecting` still true;
  // without this reset the button and the password form would stay locked until a hard reload.
  useEffect(() => navigation.onRestore(() => setRedirecting(false)), [navigation])

  useEffect(() => {
    if (sso.state.status === 'ready') headingRef.current?.focus()
  }, [mode, sso.state.status])

  const beginSso = () => {
    if (redirecting) return
    setRedirecting(true)
    setLanding(null)
    try {
      navigation.assign(SSO_START_PATH)
    } catch {
      // A refused navigation must not leave the page locked; the user can simply try again.
      setRedirecting(false)
    }
  }

  if (sso.state.status === 'loading') {
    return (
      <AuthFrame>
        <div role="status" aria-label="Checking sign-in options">
          <Skeleton rows={3} />
        </div>
      </AuthFrame>
    )
  }

  if (sso.state.status === 'error') {
    return (
      <AuthFrame>
        <ErrorState
          title="Sign-in options could not be loaded"
          body={sso.state.message}
          action={<Button variant="primary" onClick={sso.retry}>Try again</Button>}
        />
      </AuthFrame>
    )
  }

  const { options } = sso.state
  // AIDEV-NOTE: ssoEnabled requires a provider this client actually drives (Authentik). A reported
  // `google` provider is "unsupported" and fails closed to the unavailable state below — never a button.
  const ssoEnabled = isSsoUsable(options)
  const ssoUnsupported = isSsoProviderUnsupported(options)
  const passwordEnabled = options.password_login_enabled
  // Recovery screens exist only while the password entry does; a status that turns password login
  // off while recovering falls back to the plain sign-in view instead of an orphaned heading.
  const recovery = passwordEnabled && mode === 'recovery'
  const landingCallout = landing && (
    <div id={ids.landing}>
      <Callout variant="danger" role="alert">{ssoLandingErrorText(landing)}</Callout>
    </div>
  )
  const noticeCallout = notice && (
    <div id={ids.notice}>
      <Callout variant="neutral" role="status">{notice}</Callout>
    </div>
  )

  if (!ssoEnabled && !passwordEnabled) {
    // A server that reports SSO with a provider this client refuses to drive (e.g. google) is a
    // distinct, honest "unavailable" state with what to do, not the plain "nothing enabled" card.
    const unavailable = ssoUnsupported
      ? {
          title: 'Single sign-on is unavailable',
          body: 'This installation uses a single sign-on provider that is not supported here. Ask your administrator, then check again.',
        }
      : {
          title: 'Sign-in is not available',
          body: 'No sign-in method is enabled for this installation. Ask your administrator, then check again.',
        }
    return (
      <AuthFrame>
        {noticeCallout}
        {landingCallout}
        <EmptyState
          icon={<KeyIcon className="size-5" />}
          title={unavailable.title}
          body={unavailable.body}
          action={<Button variant="primary" onClick={sso.retry}>Check again</Button>}
        />
      </AuthFrame>
    )
  }

  if (passwordEnabled && mode === 'recovery_sent') {
    return (
      <AuthFrame labelledBy="recovery-sent-heading">
        <div className="space-y-2">
          <h1 id="recovery-sent-heading" ref={headingRef} tabIndex={-1} className="text-lg font-medium text-zinc-800 dark:text-white">Check your email</h1>
          <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
            If an account exists for that address, a recovery message has been sent. Open the link in it to set a new password. The link works once and expires.
          </p>
        </div>
        <Button variant="outline" onClick={() => setMode('sign_in')}>Back to sign-in</Button>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame labelledBy="sign-in-heading">
      <div className="space-y-2">
        <h1 id="sign-in-heading" ref={headingRef} tabIndex={-1} className="text-lg font-medium text-zinc-800 dark:text-white">
          {recovery ? 'Recover access' : 'Sign in'}
        </h1>
        {recovery ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Enter your email address. If an account exists, a message with a one-time link will be sent to it.</p>
        ) : (
          ssoEnabled && !passwordEnabled && <p className="text-sm text-zinc-500 dark:text-zinc-400">Use your organization's single sign-on account to continue.</p>
        )}
      </div>
      {!recovery && noticeCallout}
      {!recovery && landingCallout}
      {ssoEnabled && !recovery && (
        <Button variant="primary" className="w-full" icon={<ArrowRightStartOnRectangleIcon className="size-4" />} loading={redirecting} onClick={beginSso}>
          {redirecting ? 'Redirecting to sign-in…' : 'Continue with single sign-on'}
        </Button>
      )}
      {ssoEnabled && passwordEnabled && !recovery && (
        <div role="separator" aria-label="or" className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-zinc-400">
          <span aria-hidden className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          or
          <span aria-hidden className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
        </div>
      )}
      {passwordEnabled && (
        <PasswordEntry
          mode={recovery ? 'recovery' : 'sign_in'}
          onMode={setMode}
          email={email}
          onEmail={setEmail}
          // The callouts are not rendered while recovering, so the form must not reference their ids.
          describedBy={recovery ? [] : [notice ? ids.notice : null, landing ? ids.landing : null]}
          locked={redirecting}
          secondary={ssoEnabled}
        />
      )}
    </AuthFrame>
  )
}

interface PasswordEntryProps {
  mode: Mode
  onMode(next: Mode): void
  email: string
  onEmail(next: string): void
  /** Ids of the notice/landing callouts the form should reference. */
  describedBy: Array<string | null>
  /** Holds the form still while an SSO navigation is leaving the page. */
  locked: boolean
  /** True when the single sign-on button is the primary entry; the password submit then reads as outline. */
  secondary: boolean
}

/** Password sign-in and recovery request. Only rendered when the server reports password login enabled. */
function PasswordEntry({ mode, onMode, email, onEmail, describedBy, locked, secondary }: PasswordEntryProps) {
  const { signIn, requestRecovery } = useSession()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ActionFailure | null>(null)
  const hold = useRetryHold(failure)
  const ids = { email: useId(), password: useId(), error: useId() }
  // Each submission gets a token so a superseded or post-unmount result cannot touch the form.
  const attemptRef = useRef(0)

  useEffect(() => {
    return () => {
      attemptRef.current += 1
    }
  }, [mode])

  const recovery = mode === 'recovery'

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || hold > 0 || locked) return
    const attempt = ++attemptRef.current
    setBusy(true)
    setFailure(null)
    const result = recovery ? await requestRecovery({ email }) : await signIn({ email, password })
    if (attemptRef.current !== attempt) return
    setBusy(false)
    if (result.kind === 'superseded') return
    if (result.kind === 'failed') {
      setFailure(result.failure)
      if (result.failure.code === 'rejected') setPassword('') // never keep a rejected password around
      return
    }
    if (recovery) {
      onMode('recovery_sent')
      setPassword('')
    }
    // A successful sign-in replaces this page through the session gate; nothing to reset here.
  }

  const switchMode = (next: Mode) => {
    attemptRef.current += 1
    setBusy(false)
    setFailure(null)
    onMode(next)
  }

  const disabled = busy || hold > 0 || locked
  const described = [failure ? ids.error : null, ...describedBy].filter(Boolean).join(' ') || undefined
  const invalid = failure?.code === 'invalid' || failure?.code === 'rejected' ? true : undefined

  return (
    <>
      <form onSubmit={submit} aria-busy={busy} aria-describedby={described} className="flex flex-col gap-4" noValidate>
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
            onChange={(e) => onEmail(e.target.value)}
            disabled={disabled}
            aria-invalid={invalid}
          />
        </Field>
        {!recovery && (
          <Field
            id={ids.password}
            label="Password"
            labelAside={
              <button type="button" className="text-sm font-medium text-(--color-accent-content) hover:underline" onClick={() => switchMode('recovery')} disabled={busy || locked}>
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
        <Button type="submit" variant={secondary && !recovery ? 'outline' : 'primary'} className="w-full" disabled={disabled}>
          {busy ? (recovery ? 'Sending…' : 'Signing in…') : recovery ? 'Send recovery message' : 'Sign in'}
        </Button>
      </form>
      {recovery && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => switchMode('sign_in')} disabled={busy}>
          Back to sign-in
        </Button>
      )}
    </>
  )
}
