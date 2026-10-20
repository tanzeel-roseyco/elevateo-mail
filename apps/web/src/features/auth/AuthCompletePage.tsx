// Fixed, query-free invite/recovery completion form served at pathname /auth/complete (BE-02A).
// The pending credential was staged server-side by GET /auth/accept and travels only as the
// opaque elevateo_pending cookie; this page never reads the URL, never sees a token and loads no
// external resource. The new password lives in component state until the one POST completes.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { classifyFailure, type ActionFailure } from '@/app/actionFailure'
import { AcceptInputSchema } from '@/data/contract'
import type { MailroomGateway } from '@/data/gateway'
import { Button, buttonClass } from '@/ui/Button'
import { Field, TextInput } from '@/ui/Field'
import { AuthFrame } from './SignInPage'

const ENTRY_REJECTION = 'This link is no longer valid or was already used. Request a new invitation or recovery message.'

type Outcome = { kind: 'form' } | { kind: 'done' } | { kind: 'no_organization' } | { kind: 'rejected' }

export function AuthCompletePage({ gateway }: { gateway: MailroomGateway }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ActionFailure | null>(null)
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'form' })
  const ids = { password: useId(), confirmation: useId(), error: useId(), hint: useId() }
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  // One request at a time; unmount or a newer submission aborts and discards the older result.
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    headingRef.current?.focus()
    return () => controllerRef.current?.abort()
  }, [outcome.kind])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const local = validateLocally(password, confirmation)
    if (local) {
      setFailure(local)
      return
    }
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    setFailure(null)
    try {
      const challenge = await gateway.getLoginChallenge(controller.signal)
      await gateway.acceptAuthEntry({ csrfToken: challenge.csrf_token }, { password }, controller.signal)
      if (controllerRef.current !== controller) return
      setPassword('')
      setConfirmation('')
      setOutcome({ kind: 'done' })
    } catch (error) {
      if (controllerRef.current !== controller) return
      const classified = classifyFailure(error, ENTRY_REJECTION)
      if (classified.code === 'no_organization') {
        setPassword('')
        setConfirmation('')
        setOutcome({ kind: 'no_organization' })
      } else if (classified.code === 'rejected') {
        setPassword('')
        setConfirmation('')
        setOutcome({ kind: 'rejected' })
      } else {
        // 503/429/transport: keep the typed values; nothing was saved and nothing claims otherwise.
        setFailure(classified)
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setBusy(false)
      }
    }
  }

  if (outcome.kind !== 'form') {
    const copy =
      outcome.kind === 'done'
        ? { title: 'Access is set up', body: 'Your password is set and you are signed in. Continue to your mail.' }
        : outcome.kind === 'no_organization'
          ? { title: 'Password set, no organization yet', body: 'Your password is set, but no organization is available for this account yet. Ask an administrator to add you, then sign in.' }
          : { title: 'This link cannot be used', body: ENTRY_REJECTION }
    return (
      <AuthFrame>
        <div className="space-y-2">
          <h1 ref={headingRef} tabIndex={-1} className="text-lg font-medium text-zinc-800 dark:text-white">{copy.title}</h1>
          <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">{copy.body}</p>
        </div>
        {/* Plain navigation to the application root: this page lives outside the hash router. */}
        <a href="/" className={buttonClass('primary', 'md')}>
          {outcome.kind === 'done' ? 'Open Elevateo Mail' : 'Go to sign-in'}
        </a>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame>
      <div className="space-y-2">
        <h1 ref={headingRef} tabIndex={-1} className="text-lg font-medium text-zinc-800 dark:text-white">Set your password</h1>
        <p id={ids.hint} className="text-sm text-zinc-500 dark:text-zinc-400">Choose a password of at least 12 characters. Setting it completes your invitation or recovery and signs you in.</p>
      </div>
      <form onSubmit={submit} aria-busy={busy} aria-describedby={failure ? `${ids.hint} ${ids.error}` : ids.hint} className="flex flex-col gap-4" noValidate>
        <Field id={ids.password} label="New password">
          <TextInput
            id={ids.password}
            name="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            aria-invalid={failure?.code === 'invalid' ? true : undefined}
          />
        </Field>
        <Field id={ids.confirmation} label="Confirm password">
          <TextInput
            id={ids.confirmation}
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={busy}
            aria-invalid={failure?.code === 'invalid' ? true : undefined}
          />
        </Field>
        {failure && (
          <p id={ids.error} role="alert" className="text-sm font-medium text-red-500">{failure.message}</p>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? 'Setting password…' : 'Set password and sign in'}</Button>
      </form>
    </AuthFrame>
  )
}

/** Browser-side checks mirroring AcceptInput; the values never leave the device when they fail. */
function validateLocally(password: string, confirmation: string): ActionFailure | null {
  if (password !== confirmation) return { code: 'invalid', message: 'The two passwords do not match.' }
  const result = AcceptInputSchema.safeParse({ password })
  if (!result.success) return { code: 'invalid', message: 'Use at least 12 characters and at most 1024 bytes.' }
  return null
}
