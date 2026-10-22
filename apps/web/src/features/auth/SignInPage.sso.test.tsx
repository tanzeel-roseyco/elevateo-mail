// SSO entry on the sign-in page: the server's status decides what is offered (Google button,
// password form, both, nothing), a status failure fails closed with a retry, the Google button
// is a full-page navigation that locks the page, and a callback failure is shown generically
// once and removed from the URL.
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFixtureGateway, type FixtureScript } from '@/data/fixtures/fixtureGateway'
import { GatewayError } from '@/data/errors'
import type { MailroomGateway } from '@/data/gateway'
import { SessionProvider, useSession } from '@/app/session'
import { browserNavigation, SignInPage, type SignInNavigation } from './SignInPage'

function Gate({ navigation }: { navigation: SignInNavigation }) {
  const { state } = useSession()
  if (state.status === 'unauthenticated') return <SignInPage navigation={navigation} />
  return <p>status:{state.status}</p>
}

type Recorder = SignInNavigation & { assigned: string[]; replaced: string[]; restore(): void }

function recorder(search = ''): Recorder {
  const restoreCallbacks = new Set<() => void>()
  const nav: Recorder = {
    assigned: [],
    replaced: [],
    assign: (url) => {
      nav.assigned.push(url)
    },
    readSearch: () => search,
    replaceSearch: (next) => {
      nav.replaced.push(next)
    },
    onRestore: (callback) => {
      restoreCallbacks.add(callback)
      return () => restoreCallbacks.delete(callback)
    },
    restore: () => restoreCallbacks.forEach((callback) => callback()),
  }
  return nav
}

function renderSignedOut(script: FixtureScript = {}, extra: Partial<MailroomGateway> = {}, search = '', strict = false) {
  const gateway: MailroomGateway = { ...createFixtureGateway({ getSession: 'unauthenticated', ...script }), ...extra }
  const navigation = recorder(search)
  const tree = (
    <SessionProvider gateway={gateway}>
      <Gate navigation={navigation} />
    </SessionProvider>
  )
  render(strict ? <StrictMode>{tree}</StrictMode> : tree)
  return { gateway, navigation }
}

afterEach(() => vi.restoreAllMocks())

describe('sign-in entries by server status', () => {
  it('shows a Google primary button above the outline password form when both are enabled', async () => {
    renderSignedOut()
    const google = await screen.findByRole('button', { name: 'Continue with Google' })
    const submit = screen.getByRole('button', { name: 'Sign in' })
    expect(google.className).toContain('bg-(--color-accent)')
    expect(submit.className).toContain('bg-white')
    // DOCUMENT_POSITION_FOLLOWING: the submit comes after the Google button in document order.
    expect(google.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('separator', { name: 'or' })).toBeTruthy()
    expect(screen.getByLabelText('Email address')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
  })

  it('makes the password submit primary when it is the only entry', async () => {
    renderSignedOut({ getSsoStatus: 'sso_password_only' })
    expect((await screen.findByRole('button', { name: 'Sign in' })).className).toContain('bg-(--color-accent)')
  })

  it('keeps the typed email when returning from the recovery confirmation', async () => {
    renderSignedOut()
    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'kept@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery message' }))
    await screen.findByRole('heading', { name: 'Check your email' })
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign-in' }))
    expect(((await screen.findByLabelText('Email address')) as HTMLInputElement).value).toBe('kept@example.test')
  })

  it('shows only the Google entry when the server disables password login', async () => {
    renderSignedOut({ getSsoStatus: 'sso_google_only' })
    await screen.findByRole('button', { name: 'Continue with Google' })
    expect(screen.getByText('Use your workspace Google account to continue.')).toBeTruthy()
    expect(screen.queryByLabelText('Email address')).toBeNull()
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Forgot your password?' })).toBeNull()
    expect(screen.queryByRole('separator')).toBeNull()
  })

  it('shows only the password form when SSO is disabled', async () => {
    renderSignedOut({ getSsoStatus: 'sso_password_only' })
    await screen.findByLabelText('Password')
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull()
    expect(screen.queryByRole('separator')).toBeNull()
  })

  it('offers nothing but a re-check when no entry is enabled, and recovers on the next status', async () => {
    const statuses = [createFixtureGateway({ getSsoStatus: 'sso_none' }), createFixtureGateway({ getSsoStatus: 'sso_google_only' })]
    const getSsoStatus = vi.fn<MailroomGateway['getSsoStatus']>((signal) => statuses.shift()!.getSsoStatus(signal))
    renderSignedOut({}, { getSsoStatus })
    await screen.findByRole('heading', { name: 'Sign-in is not available' })
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await screen.findByRole('button', { name: 'Continue with Google' })
    expect(getSsoStatus).toHaveBeenCalledTimes(2)
  })

  it('announces a loading state while the status is unknown and offers no entry', async () => {
    renderSignedOut({}, { getSsoStatus: () => new Promise(() => undefined) })
    expect(await screen.findByRole('status', { name: 'Checking sign-in options' })).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull()
  })

  it('fails closed on a status failure: an error card with retry, no password form', async () => {
    let failures = 1
    const getSsoStatus = vi.fn<MailroomGateway['getSsoStatus']>(async (signal) => {
      if (failures-- > 0) throw new GatewayError('api', 'temporarily_unavailable', 'synthetic', { status: 503 })
      return createFixtureGateway().getSsoStatus(signal)
    })
    renderSignedOut({}, { getSsoStatus })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Sign-in options could not be loaded')
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('button', { name: 'Continue with Google' })
    expect(getSsoStatus).toHaveBeenCalledTimes(2)
  })
})

describe('Google entry', () => {
  it('navigates the document to the server start path, shows the redirecting state and locks the form', async () => {
    const { navigation } = renderSignedOut()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }))
    expect(navigation.assigned).toEqual(['/v1/auth/sso/start'])
    const busy = screen.getByRole('button', { name: 'Redirecting to Google…' })
    expect(busy.getAttribute('aria-busy')).toBe('true')
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Password') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(true)
    // A second activation cannot start a second navigation.
    fireEvent.click(busy)
    expect(navigation.assigned).toHaveLength(1)
  })

  it('starts SSO with a document navigation only: no fetch and no login exchange', async () => {
    const { gateway, navigation } = renderSignedOut()
    const google = await screen.findByRole('button', { name: 'Continue with Google' })
    // The session bootstrap already spent its one challenge+refresh before this page rendered;
    // the Google entry itself must add no gateway call and no fetch of the start path.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('fetch must not run')))
    const challenge = vi.spyOn(gateway, 'getLoginChallenge')
    const login = vi.spyOn(gateway, 'login')
    fireEvent.click(google)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(challenge).not.toHaveBeenCalled()
    expect(login).not.toHaveBeenCalled()
    expect(navigation.assigned).toEqual(['/v1/auth/sso/start'])
  })

  it('unlocks the page when the document is restored after a Back from the identity provider', async () => {
    const { navigation } = renderSignedOut()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }))
    expect(screen.getByRole('button', { name: 'Redirecting to Google…' })).toBeTruthy()
    act(() => navigation.restore())
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
    expect((screen.getByLabelText('Password') as HTMLInputElement).disabled).toBe(false)
  })

  it('unlocks the page when the navigation is refused', async () => {
    const { navigation } = renderSignedOut()
    navigation.assign = () => {
      throw new Error('blocked')
    }
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }))
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
  })
})

describe('callback failure landing', () => {
  it('shows the generic message once and strips the parameter from the URL', async () => {
    const { navigation } = renderSignedOut({}, {}, '?sso_error=access_denied')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Google sign-in was not completed')
    await waitFor(() => expect(navigation.replaced).toEqual(['']))
    // Starting again clears the stale message.
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('maps unavailable to its copy', async () => {
    renderSignedOut({}, {}, '?sso_error=unavailable')
    expect((await screen.findByRole('alert')).textContent).toContain('temporarily unavailable')
  })

  it('maps invalid_response to its copy', async () => {
    renderSignedOut({}, {}, '?sso_error=invalid_response')
    expect((await screen.findByRole('alert')).textContent).toContain('could not be verified')
  })

  it('strips the parameter exactly once under StrictMode', async () => {
    const { navigation } = renderSignedOut({}, {}, '?sso_error=access_denied', true)
    await screen.findByRole('alert')
    await waitFor(() => expect(navigation.replaced).toEqual(['']))
  })

  it('still shows the callback failure when no entry is enabled', async () => {
    renderSignedOut({ getSsoStatus: 'sso_none' }, {}, '?sso_error=access_denied')
    await screen.findByRole('heading', { name: 'Sign-in is not available' })
    expect(screen.getByRole('alert').textContent).toContain('Google sign-in was not completed')
  })

  it('collapses an unknown value to generic copy and never echoes it', async () => {
    const { navigation } = renderSignedOut({}, {}, '?keep=1&sso_error=' + encodeURIComponent('<img src=x onerror=alert(1)>'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Sign-in was not completed. Try again.')
    await waitFor(() => expect(navigation.replaced).toEqual(['?keep=1']))
  })
})

describe('browser navigation adapter', () => {
  it('replaceSearch keeps pathname, hash and history state', () => {
    window.history.replaceState({ marker: 1 }, '', '/dev-fixtures.html?sso_error=access_denied&keep=1#/fixtures?getSession=unauthenticated')
    browserNavigation.replaceSearch('?keep=1')
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/dev-fixtures.html?keep=1#/fixtures?getSession=unauthenticated')
    expect(window.history.state).toEqual({ marker: 1 })
    window.history.replaceState(null, '', '/')
  })

  it('onRestore fires only for a persisted pageshow and unsubscribes', () => {
    const seen = vi.fn()
    const off = browserNavigation.onRestore(seen)
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }))
    expect(seen).not.toHaveBeenCalled()
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(seen).toHaveBeenCalledTimes(1)
    off()
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(seen).toHaveBeenCalledTimes(1)
  })
})
