import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LiveOverview } from './LiveOverview'

const api = vi.hoisted(() => ({ read: vi.fn(), recheckSession: vi.fn() }))
vi.mock('@/data/http/healthGateway', () => ({ createHealthGateway: () => api }))
vi.mock('@/data/http/instance', () => ({ http: {},
  useLive: (selector: (state: { accountId: string }) => unknown) => selector({ accountId: 'alice' }),
  live: { store: { getState: () => ({ accountId: 'alice' }) }, recheckSession: api.recheckSession },
}))
const snapshot = { incompleteMessages: 0, sends: [], simulated: true, liveSending: false, dnsWrites: false, dispatchPaused: true, integrationReady: false }
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  api.read.mockResolvedValue(snapshot)
})
describe('account overview', () => {
  it('shows a failed background job without implying emails were delivered', async () => {
    api.read.mockResolvedValue({ ...snapshot, backgroundJobs: [{ name: 'dispatch', status: 'failed', lastSuccessAt: null }] })
    render(<LiveOverview />)
    expect(await screen.findByText('Send scheduling: Needs attention')).toBeInTheDocument()
  })
  it('describes live delivery as Resend campaigns rather than Gmail sending', async () => {
    api.read.mockResolvedValue({ ...snapshot, simulated: false, liveSending: true })
    render(<LiveOverview />)
    expect(await screen.findByText('Live sending enabled — mailbox permissions still apply')).toBeInTheDocument()
    expect(screen.queryByText('Simulation — no real email delivery')).not.toBeInTheDocument()
  })
  it('warns when imported content is incomplete without exposing diagnostics', async () => {
    api.read.mockResolvedValue({ ...snapshot, incompleteMessages: 2 })
    render(<LiveOverview />)
    expect(await screen.findByRole('alert')).toHaveTextContent('2 messages could not be fully imported')
    expect(screen.getByRole('alert')).toHaveTextContent('Some saved content may be out of date')
  })
  it('shows real empty counts and explicit simulation/dispatch status', async () => {
    render(<LiveOverview />)
    expect(await screen.findByText('No send requests have been saved yet.')).toBeInTheDocument()
    expect(screen.getByText('Simulation — no real email delivery')).toBeInTheDocument()
    expect(screen.getByText('Dispatch: Paused')).toBeInTheDocument()
    expect(screen.getByText('Live sending: Disabled')).toBeInTheDocument()
    expect(screen.getAllByText('0')).toHaveLength(7)
  })
  it('hides raw error details and retries without inventing successful counts', async () => {
    api.read.mockRejectedValueOnce(new Error('secret database details'))
    render(<LiveOverview />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Account health could not be loaded')
    expect(screen.queryByText(/secret database/u)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('No send requests have been saved yet.')).toBeInTheDocument()
    expect(api.read).toHaveBeenCalledTimes(2)
  })
  it('does not load while hidden and throttles repeated visibility changes', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    render(<LiveOverview />)
    expect(api.read).not.toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    fireEvent(document, new Event('visibilitychange'))
    await screen.findByText('No send requests have been saved yet.')
    fireEvent(document, new Event('visibilitychange'))
    await waitFor(() => expect(api.read).toHaveBeenCalledTimes(1))
  })
})
