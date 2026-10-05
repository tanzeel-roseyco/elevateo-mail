import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { GmailCallbackPage, GmailConnection, GmailSyncButton } from './GmailConnection'
import { ApiFailure } from '@/data/http/httpClient'

const api = vi.hoisted(() => ({ status: vi.fn(), begin: vi.fn(), complete: vi.fn(), admit: vi.fn(), sync: vi.fn() }))
const state = vi.hoisted(() => ({ accountId: 'alice', refresh: vi.fn(), reload: vi.fn(), recheck: vi.fn(), take: vi.fn() }))
vi.mock('@/data/http/gmailGateway', () => ({ createGmailGateway: () => api }))
vi.mock('./gmailCallback', () => ({ takeGmailCallback: state.take }))
vi.mock('@/data/http/instance', () => ({ http: {},
  useLive: (select: (value: { accountId: string }) => unknown) => select({ accountId: state.accountId }),
  live: { store: { getState: () => ({ accountId: state.accountId }) }, refreshMailboxes: state.refresh,
    reloadPage: state.reload, recheckSession: state.recheck },
}))
beforeEach(() => {
  vi.resetAllMocks(); state.accountId = 'alice'; api.status.mockResolvedValue({ enabled: false })
  api.complete.mockResolvedValue({ connectionId: 'grant' }); api.admit.mockResolvedValue({ id: 'mail', address: 'person@example.com' })
  state.take.mockReturnValue('https://app.example/connections/gmail/callback?code=secret&state=state')
  api.sync.mockResolvedValue({ status: 'progress', imported: 2, deleted: 0 })
})
it('shows disabled integration and retries failed availability without inventing disabled state', async () => {
  api.status.mockRejectedValueOnce(new Error('Offline'))
  render(<GmailConnection />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry availability' }))
  await screen.findByText(/disabled until server credentials/u)
  expect(screen.getByRole('button', { name: 'Connect Google mailbox' })).toBeDisabled()
})
it('completes once and retries admission without reusing an OAuth code', async () => {
  api.admit.mockRejectedValueOnce(new Error('Offline'))
  render(<MemoryRouter><GmailCallbackPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Finish connection' }))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Retry mailbox setup' }))
  await screen.findByText(/Connected person@example.com/u)
  expect(api.complete).toHaveBeenCalledOnce(); expect(state.take).toHaveBeenCalledOnce()
  expect(api.admit).toHaveBeenCalledTimes(2); expect(state.refresh).toHaveBeenCalledOnce()
})
it('does not admit a grant returned after the app account changes', async () => {
  let resolve!: (value: { connectionId: string }) => void
  api.complete.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  render(<MemoryRouter><GmailCallbackPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Finish connection' }))
  state.accountId = 'bob'
  await act(async () => resolve({ connectionId: 'old' }))
  expect(api.admit).not.toHaveBeenCalled()
})
it('does not refresh or publish admission results after switching accounts', async () => {
  let resolve!: (value: { id: string; address: string }) => void
  const admission = new Promise<{ id: string; address: string }>(done => { resolve = done })
  api.admit.mockReturnValueOnce(admission)
  const view = render(<MemoryRouter><GmailCallbackPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Finish connection' }))
  await waitFor(() => expect(api.admit).toHaveBeenCalledWith('grant'))
  state.accountId = 'bob'
  view.rerender(<MemoryRouter><GmailCallbackPage /></MemoryRouter>)
  await act(async () => { resolve({ id: 'mail', address: 'alice@example.com' }); await admission })
  expect(state.refresh).not.toHaveBeenCalled()
  expect(state.reload).not.toHaveBeenCalled()
  expect(screen.queryByText(/Connected alice@example.com/u)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Finish connection' })).toBeEnabled()
})
it('retains the admission retry after refresh fails without replaying OAuth', async () => {
  let reject!: (cause: Error) => void
  const refresh = new Promise<void>((_resolve, fail) => { reject = fail })
  state.refresh.mockReturnValueOnce(refresh).mockResolvedValueOnce(undefined)
  render(<MemoryRouter><GmailCallbackPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Finish connection' }))
  await waitFor(() => expect(state.refresh).toHaveBeenCalledOnce())
  await act(async () => { reject(new Error('Mailbox refresh unavailable')); await refresh.catch(() => undefined) })
  expect(await screen.findByRole('alert')).toHaveTextContent('Mailbox refresh unavailable')
  expect(screen.queryByText(/Connected person@example.com/u)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry mailbox setup' }))
  await screen.findByText(/Connected person@example.com/u)
  expect(api.complete).toHaveBeenCalledOnce()
  expect(state.take).toHaveBeenCalledOnce()
  expect(api.admit.mock.calls).toEqual([['grant'], ['grant']])
  expect(state.refresh).toHaveBeenCalledTimes(2)
})
it('syncs one bounded page then refreshes cached inbox data; unauthorized sync rechecks the session', async () => {
  render(<GmailSyncButton mailboxId="mail" />)
  fireEvent.click(screen.getByRole('button', { name: 'Sync one page' }))
  await waitFor(() => expect(state.reload).toHaveBeenCalledOnce())
  expect(api.sync).toHaveBeenCalledWith('mail')
  api.sync.mockRejectedValueOnce(new ApiFailure('unauthorized', 'Session ended'))
  fireEvent.click(screen.getByRole('button', { name: 'Sync one page' }))
  await waitFor(() => expect(state.recheck).toHaveBeenCalledOnce())
  expect(state.reload).toHaveBeenCalledOnce()
})
