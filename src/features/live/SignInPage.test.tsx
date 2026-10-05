import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SignInPage } from './SignInPage'
const api = vi.hoisted(() => ({ status: vi.fn(), begin: vi.fn(), open: vi.fn(), fixture: vi.fn() }))
vi.mock('@/data/http/authGateway', () => ({ createAuthGateway: () => api, openGoogleSignIn: api.open }))
vi.mock('@/data/http/instance', () => ({ http: {}, live: { canFixtureSignIn: true, fixtureSignIn: api.fixture },
  useLive: () => null }))
beforeEach(() => {
  vi.clearAllMocks()
  api.status.mockResolvedValue({ enabled: true })
  api.begin.mockResolvedValue({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=x', expiresAt: Date.now() + 600000 })
  api.fixture.mockResolvedValue(undefined)
})
it('starts configured Google login while preserving synthetic sign-in', async () => {
  render(<SignInPage expired={false} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }))
  await waitFor(() => expect(api.open).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?state=x'))
  fireEvent.click(screen.getByRole('button', { name: 'Continue as synthetic user alice' }))
  await waitFor(() => expect(api.fixture).toHaveBeenCalledWith('alice'))
})
it('keeps login disabled honestly and retries unavailable status', async () => {
  api.status.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ enabled: false })
  render(<SignInPage expired={false} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not check')
  fireEvent.click(screen.getByRole('button', { name: 'Check sign-in again' }))
  await screen.findByText(/Google sign-in is not enabled/u)
  expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
  expect(api.begin).not.toHaveBeenCalled()
})
it('shows a recoverable begin failure without navigating', async () => {
  api.begin.mockRejectedValueOnce(new Error('Server unavailable'))
  render(<SignInPage expired={false} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('could not start')
  expect(api.open).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
  await waitFor(() => expect(api.open).toHaveBeenCalledOnce())
})
it('does not navigate after unmount during login preparation', async () => {
  let resolve!: (value: unknown) => void
  api.begin.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const view = render(<SignInPage expired={false} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }))
  view.unmount()
  await act(async () => resolve({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', expiresAt: Date.now() + 1000 }))
  expect(api.open).not.toHaveBeenCalled()
})
