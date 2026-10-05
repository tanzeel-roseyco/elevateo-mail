import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GmailSending } from './GmailSending'
import { ApiFailure } from '@/data/http/httpClient'

const api = vi.hoisted(() => ({ sendingStatus: vi.fn(), setSending: vi.fn(), beginSending: vi.fn() }))
const state = vi.hoisted(() => ({ accountId: 'alice', refresh: vi.fn(), recheck: vi.fn() }))
vi.mock('@/data/http/gmailGateway', () => ({ createGmailGateway: () => api }))
vi.mock('@/data/http/instance', () => ({ http: {},
  useLive: (select: (value: { accountId: string }) => unknown) => select({ accountId: state.accountId }),
  live: { store: { getState: () => ({ accountId: state.accountId }) }, refreshMailboxes: state.refresh, recheckSession: state.recheck },
}))
const ready = { enabled: false, authorized: true, connectionId: 'grant', available: true }
beforeEach(() => {
  vi.resetAllMocks(); state.accountId = 'alice'; api.sendingStatus.mockResolvedValue(ready)
  api.setSending.mockResolvedValue({ enabled: true })
})
it('does not enable sending automatically and saves only a separate explicit choice', async () => {
  render(<GmailSending mailboxId="mail" />)
  const toggle = await screen.findByRole('switch')
  expect(api.setSending).not.toHaveBeenCalled()
  fireEvent.click(toggle)
  await waitFor(() => expect(state.refresh).toHaveBeenCalledOnce())
  expect(api.setSending).toHaveBeenCalledExactlyOnceWith('mail', true)
  expect(api.beginSending).not.toHaveBeenCalled()
})
it('requires Google authorization before mailbox enabling', async () => {
  api.sendingStatus.mockResolvedValue({ ...ready, authorized: false })
  render(<GmailSending mailboxId="mail" />)
  expect(await screen.findByRole('button', { name: 'Authorize Google sending' })).toBeEnabled()
  expect(screen.getByRole('switch')).toBeDisabled()
  expect(api.setSending).not.toHaveBeenCalled()
})
it('allows disabling a saved grant when live delivery is disabled', async () => {
  api.sendingStatus.mockResolvedValue({ ...ready, available: false, enabled: true })
  render(<GmailSending mailboxId="mail" />)
  fireEvent.click(await screen.findByRole('switch'))
  await waitFor(() => expect(api.setSending).toHaveBeenCalledWith('mail', false))
})
it('clears uncertain permission after failed mutation and recovers with a fresh read', async () => {
  api.setSending.mockRejectedValueOnce(new Error('Offline'))
  render(<GmailSending mailboxId="mail" />)
  fireEvent.click(await screen.findByRole('switch'))
  await screen.findByRole('alert')
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reload sending permission' }))
  await screen.findByRole('switch')
  expect(api.setSending).toHaveBeenCalledOnce()
})
it('rejects late account responses without refreshing the new account', async () => {
  let resolve!: (value: { enabled: boolean }) => void
  api.setSending.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const view = render(<GmailSending mailboxId="mail" />)
  fireEvent.click(await screen.findByRole('switch'))
  state.accountId = 'bob'; view.rerender(<GmailSending mailboxId="mail" />)
  await act(async () => resolve({ enabled: true }))
  expect(state.refresh).not.toHaveBeenCalled()
})
it('rechecks an expired session and never leaves an enabled action', async () => {
  api.sendingStatus.mockRejectedValue(new ApiFailure('unauthorized', 'Expired'))
  render(<GmailSending mailboxId="mail" />)
  await waitFor(() => expect(state.recheck).toHaveBeenCalledOnce())
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
})
