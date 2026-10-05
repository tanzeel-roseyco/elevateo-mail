import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ApiFailure } from '@/data/http/httpClient'
import { MemoryRouter } from 'react-router'
import { LiveSearch } from './LiveSearch'

const api = vi.hoisted(() => ({ search: vi.fn(), recheckSession: vi.fn() }))
const state = vi.hoisted(() => ({ accountId: 'alice', mailboxes: [{ id: 'mail', address: 'me@example.com' }] }))
vi.mock('@/data/http/searchGateway', () => ({ createSearchGateway: () => api }))
vi.mock('@/data/http/instance', () => ({ http: {}, useLive: (select: (value: typeof state) => unknown) => select(state),
  live: { recheckSession: api.recheckSession, store: { getState: () => state } },
}))
const empty = { items: [], next: { before: 10, beforeId: 'last' }, search: { scanned: 1000 } }
beforeEach(() => { vi.resetAllMocks(); state.accountId = 'alice'; state.mailboxes = [{ id: 'mail', address: 'me@example.com' }]; api.search.mockResolvedValue(empty) })
function open() { return render(<MemoryRouter><LiveSearch /></MemoryRouter>) }
function search() {
  fireEvent.change(screen.getByLabelText('Subject or sender'), { target: { value: 'hello' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search newest messages' }))
}
it('does not scan automatically, and permits explicit continuation through empty windows', async () => {
  open(); expect(api.search).not.toHaveBeenCalled(); search()
  const older = await screen.findByRole('button', { name: 'Continue search in older messages' })
  expect(screen.getByText(/Older mail remains/)).toBeInTheDocument()
  expect(api.search).toHaveBeenCalledExactlyOnceWith('mail', 'hello', null)
  fireEvent.click(older)
  await screen.findByRole('button', { name: 'Search newest messages' })
  expect(api.search).toHaveBeenLastCalledWith('mail', 'hello', empty.next)
  expect(api.search).toHaveBeenCalledTimes(2)
})
it('ignores results and query text from a prior account', async () => {
  let resolve!: (value: unknown) => void
  api.search.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const view = open(); search(); state.accountId = 'bob'
  view.rerender(<MemoryRouter><LiveSearch /></MemoryRouter>)
  await act(async () => resolve({ ...empty, items: [{ id: 'secret', mailboxId: 'mail', subject: 'Private', sender: 'a' }] }))
  expect(screen.queryByText('Private')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Subject or sender')).toHaveValue('')
})
it('reports failure and lets a user explicitly retry from the newest window', async () => {
  api.search.mockRejectedValueOnce(new Error('Offline'))
  open(); search(); await screen.findByRole('alert')
  expect(api.search).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Search newest messages' }))
  await screen.findByText(/Older mail remains/)
  expect(api.search).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('clears old results when the query changes', async () => {
  open(); search(); await screen.findByText(/Older mail remains/)
  fireEvent.change(screen.getByLabelText('Subject or sender'), { target: { value: 'changed' } })
  expect(screen.queryByRole('region', { name: 'Search results' })).not.toBeInTheDocument()
  expect(api.search).toHaveBeenCalledOnce()
})
it('selects the first mailbox after the inventory arrives without starting a search', () => {
  state.mailboxes = []
  const view = open()
  state.mailboxes = [{ id: 'mail', address: 'me@example.com' }]
  view.rerender(<MemoryRouter><LiveSearch /></MemoryRouter>)
  expect(screen.getByLabelText('Mailbox')).toHaveValue('mail')
  expect(api.search).not.toHaveBeenCalled()
  search(); expect(api.search).toHaveBeenCalledWith('mail', 'hello', null)
})
it('removes results and controls immediately after401 while recheck is pending', async () => {
  api.recheckSession.mockReturnValue(new Promise(() => {}))
  open(); search(); await screen.findByText(/Older mail remains/)
  api.search.mockRejectedValueOnce(new ApiFailure('unauthorized', 'Expired'))
  fireEvent.click(screen.getByRole('button', { name: 'Continue search in older messages' }))
  await screen.findByText('Your session expired. Sign in again to search mail.')
  expect(screen.queryByLabelText('Mailbox')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Subject or sender')).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Search results' })).not.toBeInTheDocument()
  expect(api.recheckSession).toHaveBeenCalledOnce()
})
