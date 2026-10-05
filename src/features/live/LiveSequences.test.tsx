import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ApiFailure } from '@/data/http/httpClient'
import { LiveSequences } from './LiveSequences'

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), cancel: vi.fn(), recheckSession: vi.fn() }))
const state = vi.hoisted(() => ({ accountId: 'alice', mailboxes: [{ id: 'mail', address: 'me@example.com' }] }))
vi.mock('@/data/http/sequencesGateway', async importOriginal => ({ ...await importOriginal<typeof import('@/data/http/sequencesGateway')>(), createSequencesGateway: () => api }))
vi.mock('@/data/http/instance', () => ({ http: {}, useLive: (select: (value: typeof state) => unknown) => select(state), live: { recheckSession: api.recheckSession, store: { getState: () => state } } }))
const sequence = { id: 'seq', mailboxId: 'mail', recipient: 'client@example.com', steps: [{ id: 'send', revision: 'a'.repeat(64), status: 'draft', scheduledAt: 1 }] }
beforeEach(() => { vi.resetAllMocks(); state.accountId = 'alice'; api.list.mockResolvedValue({ items: [], next: null, liveActivationAvailable: false }); api.create.mockResolvedValue({ sequence, liveActivationAvailable: false }) })
async function open() { const view = render(<MemoryRouter><LiveSequences campaignId="campaign" /></MemoryRouter>); await screen.findByText('No sequences on this page.'); return view }
function fill() {
  fireEvent.change(screen.getByLabelText('Sequence mailbox'), { target: { value: 'mail' } })
  fireEvent.change(screen.getByLabelText('Sequence recipient'), { target: { value: 'client@example.com' } })
  fireEvent.change(screen.getByLabelText('Step 1 subject'), { target: { value: 'Hello' } })
  fireEvent.change(screen.getByLabelText('Step 1 message'), { target: { value: 'Welcome' } })
  fireEvent.change(screen.getByLabelText('Step 1 earliest send time'), { target: { value: new Date(Date.now() + 86400000).toISOString().slice(0, 16) } })
}
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save sequence for review' }))
it('saves for individual review, then cancels remaining steps', async () => {
  await open(); fill(); save()
  expect(await screen.findByRole('link', { name: 'Review step 1' })).toHaveAttribute('href', '/sends/send')
  expect(screen.getByText(/Nothing was approved or sent/)).toBeInTheDocument()
  api.cancel.mockResolvedValue({ sequence: { ...sequence, steps: [{ ...sequence.steps[0], status: 'cancelled' }] }, liveActivationAvailable: false })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel remaining steps' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel remaining steps' })).toBeDisabled())
  expect(api.cancel).toHaveBeenCalledWith('campaign', 'seq')
})
it('reuses the exact key after an uncertain response and changes it for changed content', async () => {
  api.create.mockRejectedValueOnce(new ApiFailure('network', 'Offline'))
  await open(); fill(); save(); await screen.findByRole('alert'); save()
  await screen.findByText(/Nothing was approved or sent/)
  expect(api.create.mock.calls[1]).toEqual(api.create.mock.calls[0])
  fireEvent.change(screen.getByLabelText('Step 1 message'), { target: { value: 'Changed' } }); save()
  await waitFor(() => expect(api.create).toHaveBeenCalledTimes(3))
  expect(api.create.mock.calls[2]?.[2]).not.toBe(api.create.mock.calls[0]?.[2])
})
it('bounds steps at three and rejects past times before creating', async () => {
  await open(); fill()
  fireEvent.change(screen.getByLabelText('Step 1 earliest send time'), { target: { value: '2000-01-01T12:00' } }); save()
  await screen.findByRole('alert'); expect(api.create).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Add step' })); fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
  expect(screen.getByRole('button', { name: 'Add step' })).toBeDisabled()
  expect(screen.getAllByRole('group')).toHaveLength(3)
})
it('recovers unchanged uncertain content after its scheduled time passes', async () => {
  api.create.mockRejectedValueOnce(new ApiFailure('timeout', 'Timed out'))
  await open(); fill(); save(); await screen.findByRole('alert')
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 86400000)
  try { save(); await screen.findByText(/Nothing was approved or sent/); expect(api.create.mock.calls[1]).toEqual(api.create.mock.calls[0]) }
  finally { clock.mockRestore() }
})
it('drops a saved response after an account switch', async () => {
  let resolve!: (value: unknown) => void
  api.create.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const view = await open(); fill(); save(); state.accountId = 'bob'
  view.rerender(<MemoryRouter><LiveSequences campaignId="campaign" /></MemoryRouter>)
  await act(async () => resolve({ sequence, liveActivationAvailable: false }))
  expect(screen.queryByRole('link', { name: 'Review step 1' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Sequence recipient')).toHaveValue('')
})
it('clears private data immediately on401 while session recheck waits', async () => {
  await open(); fill(); save(); await screen.findByRole('link', { name: 'Review step 1' })
  api.recheckSession.mockReturnValue(new Promise(() => {})); api.cancel.mockRejectedValue(new ApiFailure('unauthorized', 'Expired'))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel remaining steps' }))
  await screen.findByText('Your session expired. Sign in again to manage sequences.')
  expect(screen.queryByLabelText('Sequence recipient')).not.toBeInTheDocument()
  expect(screen.queryByText('client@example.com')).not.toBeInTheDocument()
  expect(api.recheckSession).toHaveBeenCalledOnce()
})
it('loads further pages only on explicit request and offers list retry', async () => {
  api.list.mockResolvedValueOnce({ items: [], next: 'next', liveActivationAvailable: false })
  await open(); expect(api.list).toHaveBeenCalledTimes(1)
  api.list.mockRejectedValueOnce(new Error('Offline'))
  fireEvent.click(screen.getByRole('button', { name: 'Next sequence page' })); await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Reload sequences' })); await screen.findByText('No sequences on this page.')
  expect(api.list).toHaveBeenLastCalledWith('campaign', 'next')
})
it('explains configured Resend support without implying approval and defaults closed', async () => {
  const view = await open()
  expect(screen.getByText(/Live sequence activation is unavailable for this deployment/)).toBeInTheDocument()
  api.list.mockResolvedValueOnce({ items: [], next: null, liveActivationAvailable: true })
  fireEvent.click(screen.getByRole('button', { name: 'Reload sequences' }))
  expect(await screen.findByText(/Configured Resend mailboxes can request activation/)).toHaveTextContent('Every step needs separate review and approval')
  expect(screen.getByText(/Gmail sequences remain unavailable/)).toBeInTheDocument()
  expect(api.create).not.toHaveBeenCalled()
  view.unmount()
})
