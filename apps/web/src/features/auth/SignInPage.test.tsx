// Sign-in and recovery forms: accessible labels and alerts, generic rejection that clears the
// password, 503 keeps the typed entries, a bounded 429 hold with no automatic resubmission, and
// the recovery outcome that reads the same for any address.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { GatewayError } from '@/data/errors'
import type { MailroomGateway } from '@/data/gateway'
import { SessionProvider, useSession } from '@/app/session'
import { SignInPage } from './SignInPage'

function Gate() {
  const { state } = useSession()
  if (state.status === 'unauthenticated') return <SignInPage />
  return <p>status:{state.status}</p>
}

/** Signed-out fixture session whose login behaviour is injected per test. */
function signedOut(login: MailroomGateway['login'], extra: Partial<MailroomGateway> = {}): MailroomGateway {
  const base = createFixtureGateway({ getSession: 'unauthenticated' })
  return { ...base, login, ...extra }
}

function renderSignIn(gateway: MailroomGateway) {
  return render(
    <SessionProvider gateway={gateway}>
      <Gate />
    </SessionProvider>,
  )
}

async function fillAndSubmit(email = 'a@example.test', password = 'secret-password') {
  const form = await screen.findByRole('heading', { name: 'Sign in' })
  expect(form).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

const apiError = (code: 'unauthenticated' | 'temporarily_unavailable' | 'rate_limited', status: number, retryAfterSeconds?: number) =>
  new GatewayError('api', code, 'synthetic', retryAfterSeconds === undefined ? { status } : { status, retryAfterSeconds })

beforeEach(() => vi.useRealTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('sign-in form', () => {
  it('submits the typed credentials under a challenge and hands over to the ready session', async () => {
    const login = vi.fn<MailroomGateway['login']>((proof, input, signal) => createFixtureGateway().login(proof, input, signal))
    renderSignIn(signedOut(login))
    await fillAndSubmit()
    await screen.findByText('status:ready')
    expect(login).toHaveBeenCalledTimes(1)
    expect(login.mock.calls[0]![0]).toEqual({ csrfToken: 'synthetic_challenge_token_00000001' })
    expect(login.mock.calls[0]![1]).toEqual({ email: 'a@example.test', password: 'secret-password' })
  })

  it('has labelled fields, autocomplete hints and no HTML5 validation popups', async () => {
    renderSignIn(signedOut(async () => { throw apiError('unauthenticated', 401) }))
    const email = (await screen.findByLabelText('Email address')) as HTMLInputElement
    const password = screen.getByLabelText('Password') as HTMLInputElement
    expect(email.type).toBe('email')
    expect(email.autocomplete).toBe('username')
    expect(password.type).toBe('password')
    expect(password.autocomplete).toBe('current-password')
    expect((email.form as HTMLFormElement).noValidate).toBe(true)
  })

  it('a rejection shows one generic alert, clears the password and keeps the email', async () => {
    renderSignIn(signedOut(async () => { throw apiError('unauthenticated', 401) }))
    await fillAndSubmit('who@example.test', 'wrong-password')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Sign-in was not accepted')
    expect(alert.textContent).not.toContain('who@example.test')
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe('who@example.test')
    expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('true')
  })

  it('a 503 keeps both entries, says nothing was saved and re-enables the form', async () => {
    renderSignIn(signedOut(async () => { throw apiError('temporarily_unavailable', 503) }))
    await fillAndSubmit('a@example.test', 'kept-password')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('temporarily unavailable')
    expect(alert.textContent).toContain('nothing was saved')
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('kept-password')
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('a 429 with Retry-After holds the submit for exactly that long and never resubmits by itself', async () => {
    vi.useFakeTimers()
    const login = vi.fn<MailroomGateway['login']>(async () => { throw apiError('rate_limited', 429, 3) })
    renderSignIn(signedOut(login))
    await act(async () => {})
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await act(async () => {})
    expect(login).toHaveBeenCalledTimes(1)
    const button = screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('try again in 3 s')
    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })
    expect(button.disabled).toBe(true)
    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })
    expect(button.disabled).toBe(false)
    expect(login).toHaveBeenCalledTimes(1) // the hold expiring is not a resubmission
  })

  it('shows the signed-out notice from the controller, including a pending upstream sign-out', async () => {
    const gateway: MailroomGateway = { ...createFixtureGateway() }
    let latest: ReturnType<typeof useSession> | undefined
    function Grab() {
      latest = useSession()
      return null
    }
    render(
      <SessionProvider gateway={gateway}>
        <Grab />
        <Gate />
      </SessionProvider>,
    )
    await screen.findByText('status:ready')
    await act(async () => {
      await latest!.signOut('local')
    })
    await screen.findByRole('heading', { name: 'Sign in' })
    const notice = await screen.findByRole('status')
    expect(notice.textContent).toContain('signed out')
    expect(notice.textContent).toContain('still pending')
  })
})

describe('recovery form', () => {
  it('sends only the email and shows the same acceptance copy for any address', async () => {
    const requestRecovery = vi.fn<MailroomGateway['requestRecovery']>((proof, input, signal) => createFixtureGateway().requestRecovery(proof, input, signal))
    renderSignIn(signedOut(async () => { throw apiError('unauthenticated', 401) }, { requestRecovery }))
    fireEvent.click(await screen.findByRole('button', { name: 'Forgot your password?' }))
    await screen.findByRole('heading', { name: 'Recover access' })
    expect(screen.queryByLabelText('Password')).toBeNull()
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'unknown@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery message' }))
    await screen.findByRole('heading', { name: 'Check your email' })
    expect(screen.getByRole('status').textContent).toContain('If an account exists')
    expect(requestRecovery.mock.calls[0]![1]).toEqual({ email: 'unknown@example.test' })
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign-in' }))
    await screen.findByRole('heading', { name: 'Sign in' })
  })

  it('a recovery outage keeps the address and reports it without claiming anything was sent', async () => {
    renderSignIn(signedOut(async () => { throw apiError('unauthenticated', 401) }, { requestRecovery: async () => { throw apiError('temporarily_unavailable', 503) } }))
    fireEvent.click(await screen.findByRole('button', { name: 'Forgot your password?' }))
    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'a@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery message' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('temporarily unavailable'))
    expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe('a@example.test')
    expect(screen.queryByRole('heading', { name: 'Check your email' })).toBeNull()
  })
})
