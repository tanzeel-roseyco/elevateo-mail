import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConnectionGrants } from './ConnectionGrants'
import { ApiFailure } from '@/data/http/httpClient'

const api = vi.hoisted(() => ({ list: vi.fn(), revoke: vi.fn(), admit: vi.fn() }))
const state = vi.hoisted(() => ({ accountId: 'alice', recheck: vi.fn(), refresh: vi.fn(), confirm: vi.fn() }))
vi.mock('@/data/http/connectionsGateway', () => ({ createConnectionsGateway: () => api }))
vi.mock('@/data/http/gmailGateway', () => ({ createGmailGateway: () => api }))
vi.mock('@/ui/confirm', () => ({ confirm: state.confirm }))
vi.mock('@/data/http/instance', () => ({ http: {},
  useLive: (selector: (value: { accountId: string }) => unknown) => selector({ accountId: state.accountId }),
  live: { store: { getState: () => ({ accountId: state.accountId }) }, recheckSession: state.recheck, refreshMailboxes: state.refresh },
}))
const row = { id: 'connection', provider: 'gmail', subject: 'private-subject', revision: 1, revoked: false }
beforeEach(() => {
  vi.clearAllMocks(); state.accountId = 'alice'; state.confirm.mockResolvedValue(true)
  api.list.mockResolvedValue({ items: [row], next: null }); api.revoke.mockResolvedValue({ revoked: true })
  api.admit.mockResolvedValue({ id: 'mailbox', address: 'alice@example.com' })
})
it('recovers mailbox setup from an existing grant and refreshes inventory', async () => {
  render(<ConnectionGrants />)
  fireEvent.click(await screen.findByRole('button', { name: 'Set up mailbox' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Mailbox ready: alice@example.com')
  expect(api.admit).toHaveBeenCalledWith('connection')
  expect(state.refresh).toHaveBeenCalledOnce()
})
it('does not refresh another account after a pending admission completes', async () => {
  let resolve!: (value: unknown) => void
  api.admit.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const view = render(<ConnectionGrants />)
  fireEvent.click(await screen.findByRole('button', { name: 'Set up mailbox' }))
  state.accountId = 'bob'; api.list.mockResolvedValue({ items: [], next: null })
  view.rerender(<ConnectionGrants />)
  await act(async () => resolve({ id: 'mailbox', address: 'alice@example.com' }))
  expect(state.refresh).not.toHaveBeenCalled()
  expect(screen.queryByText(/Mailbox ready/u)).not.toBeInTheDocument()
})
it('clears metadata when admission loses authorization', async () => {
  api.admit.mockRejectedValueOnce(new ApiFailure('unauthorized', 'Session ended'))
  render(<ConnectionGrants />)
  fireEvent.click(await screen.findByRole('button', { name: 'Set up mailbox' }))
  await waitFor(() => expect(state.recheck).toHaveBeenCalledOnce())
  expect(screen.queryByText(/private-subject/u)).not.toBeInTheDocument()
})
it('confirms revocation and refreshes the visible metadata and mailbox inventory', async () => {
  render(<ConnectionGrants />)
  fireEvent.click(await screen.findByRole('button', { name: 'Remove access' }))
  await waitFor(() => expect(state.refresh).toHaveBeenCalledOnce())
  expect(api.revoke).toHaveBeenCalledWith('connection')
  expect(state.confirm).toHaveBeenCalledOnce()
  expect(api.list).toHaveBeenCalledTimes(2)
})
it('clears private metadata when revocation loses authorization', async () => {
  api.revoke.mockRejectedValueOnce(new ApiFailure('unauthorized', 'Session ended'))
  render(<ConnectionGrants />)
  fireEvent.click(await screen.findByRole('button', { name: 'Remove access' }))
  await waitFor(() => expect(state.recheck).toHaveBeenCalledOnce())
  expect(screen.queryByText(/private-subject/u)).not.toBeInTheDocument()
})
it('pages without accumulating rows and offers retry after failure', async () => {
  api.list.mockResolvedValueOnce({ items: [row], next: { after: 'connection' } }).mockRejectedValueOnce(new Error('Offline'))
  render(<ConnectionGrants />)
  fireEvent.click(await screen.findByRole('button', { name: 'Next connections page' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
  expect(screen.queryByText(/private-subject/u)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reload connections' }))
  await screen.findByText(/private-subject/u)
  expect(api.list).toHaveBeenLastCalledWith('connection')
})
it('ignores an old account response after an account-key remount', async () => {
  let resolve!: (value: unknown) => void
  api.list.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const view = render(<ConnectionGrants />)
  state.accountId = 'bob'; api.list.mockResolvedValue({ items: [], next: null })
  view.rerender(<ConnectionGrants />)
  await screen.findByText('No stored connections on this page.')
  await act(async () => resolve({ items: [row], next: null }))
  expect(screen.queryByText(/private-subject/u)).not.toBeInTheDocument()
})
