// /auth/complete: local password checks happen before any request, success and the generic
// rejection replace the form, a 503 keeps the typed values, and the page never reads the URL or
// stores anything. The pending credential is a server-side cookie this page cannot see.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { GatewayError } from '@/data/errors'
import type { MailroomGateway } from '@/data/gateway'
import { AuthCompletePage } from './AuthCompletePage'

function gatewayWith(accept: MailroomGateway['acceptAuthEntry']) {
  const spy = vi.fn<MailroomGateway['acceptAuthEntry']>(accept)
  const gateway: MailroomGateway = { ...createFixtureGateway(), acceptAuthEntry: spy }
  return { gateway, accept: spy }
}

async function fill(password: string, confirmation = password) {
  fireEvent.change(await screen.findByLabelText('New password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirmation } })
  fireEvent.click(screen.getByRole('button', { name: 'Set password and sign in' }))
}

afterEach(() => vi.restoreAllMocks())

describe('completion form', () => {
  it('rejects a mismatch and a short password locally without any request', async () => {
    const { gateway, accept } = gatewayWith(async () => { throw new Error('must not be called') })
    render(<AuthCompletePage gateway={gateway} />)
    await fill('long-enough-password', 'long-enough-passwor')
    expect((await screen.findByRole('alert')).textContent).toContain('do not match')
    await fill('short')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('at least 12 characters'))
    expect(accept).not.toHaveBeenCalled()
  })

  it('sends the password once under a fresh challenge and offers the way into the application', async () => {
    const { gateway, accept } = gatewayWith((proof, input, signal) => createFixtureGateway().acceptAuthEntry(proof, input, signal))
    render(<AuthCompletePage gateway={gateway} />)
    await fill('a-sufficiently-long-password')
    await screen.findByRole('heading', { name: 'Access is set up' })
    expect(accept).toHaveBeenCalledTimes(1)
    expect(accept.mock.calls[0]![0]).toEqual({ csrfToken: 'synthetic_challenge_token_00000001' })
    expect(accept.mock.calls[0]![1]).toEqual({ password: 'a-sufficiently-long-password' })
    const link = screen.getByRole('link', { name: 'Open Elevateo Mail' }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/')
    expect(screen.queryByLabelText('New password')).toBeNull()
  })

  it('a generic 401 replaces the form with the invalid-link outcome and drops the typed values', async () => {
    const { gateway } = gatewayWith(async () => { throw new GatewayError('api', 'unauthenticated', 'synthetic', { status: 401 }) })
    render(<AuthCompletePage gateway={gateway} />)
    await fill('a-sufficiently-long-password')
    await screen.findByRole('heading', { name: 'This link cannot be used' })
    expect(screen.getByRole('status').textContent).toContain('Request a new invitation or recovery message')
    expect(screen.queryByLabelText('New password')).toBeNull()
  })

  it('a 404 says the password is set but no organization exists yet', async () => {
    const { gateway } = gatewayWith(async () => { throw new GatewayError('api', 'not_available', 'synthetic', { status: 404 }) })
    render(<AuthCompletePage gateway={gateway} />)
    await fill('a-sufficiently-long-password')
    await screen.findByRole('heading', { name: 'Password set, no organization yet' })
    expect(screen.getByRole('link', { name: 'Go to sign-in' })).toBeTruthy()
  })

  it('a 503 keeps both entries and claims no save', async () => {
    const { gateway } = gatewayWith(async () => { throw new GatewayError('api', 'temporarily_unavailable', 'synthetic', { status: 503 }) })
    render(<AuthCompletePage gateway={gateway} />)
    await fill('a-sufficiently-long-password')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('temporarily unavailable')
    expect(alert.textContent).toContain('nothing was saved')
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('a-sufficiently-long-password')
    expect((screen.getByLabelText('Confirm password') as HTMLInputElement).value).toBe('a-sufficiently-long-password')
    expect((screen.getByRole('button', { name: 'Set password and sign in' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('reads nothing from the URL and stores nothing in the browser', async () => {
    const { gateway } = gatewayWith((proof, input, signal) => createFixtureGateway().acceptAuthEntry(proof, input, signal))
    window.history.replaceState(null, '', '/auth/complete')
    render(<AuthCompletePage gateway={gateway} />)
    await fill('a-sufficiently-long-password')
    await screen.findByRole('heading', { name: 'Access is set up' })
    expect(window.location.pathname).toBe('/auth/complete')
    expect(window.location.search).toBe('')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    // The only resource is the constant brand mark: no script, stylesheet or image derived from the URL or the typed values.
    const resources = Array.from(document.querySelectorAll('script[src], link[href], img[src]'), (el) => el.getAttribute('src') ?? el.getAttribute('href'))
    expect(resources).toEqual(['/brand/elevateo-logo.png'])
  })
})
