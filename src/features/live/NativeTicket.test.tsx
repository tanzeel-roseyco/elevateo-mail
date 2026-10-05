import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApiFailure } from '@/data/http/httpClient'
import { NativeTicket } from './NativeTicket'

const mocks = vi.hoisted(() => ({ request: vi.fn(), recheckSession: vi.fn(), expired: vi.fn(), accountId: 'alice' }))
vi.mock('@/data/http/instance', () => ({ http: { request: mocks.request }, live: { recheckSession: mocks.recheckSession, store: { getState: () => ({ accountId: mocks.accountId }) } } }))
const props = { accountId: 'alice', mailboxId: 'mail', messageIds: ['message'], onExpired: mocks.expired }
beforeEach(() => {
  vi.resetAllMocks(); mocks.accountId = 'alice'
  mocks.request.mockImplementation(async (_method, _path, schema, input) => schema.parse({ ticket: 'a'.repeat(64), requestId: input.requestId, expiresAt: Date.now() + 59_000 }))
})
afterEach(() => vi.useRealTimers())
function issue() { fireEvent.change(screen.getByLabelText('Draft instructions'), { target: { value: 'Prepare a polite reply.' } }); fireEvent.click(screen.getByRole('button', { name: 'Create companion ticket' })) }
it('issues selected context ticket and copies only on explicit click', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  render(<NativeTicket {...props} />); issue()
  const output = await screen.findByLabelText('Companion ticket JSON')
  expect(mocks.request.mock.calls[0]?.[3]).toMatchObject({ mailboxId: 'mail', messageIds: ['message'], instruction: 'Prepare a polite reply.' })
  expect(writeText).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Copy companion ticket' }))
  await screen.findByText('Ticket copied.'); expect(writeText).toHaveBeenCalledWith((output as HTMLTextAreaElement).value)
  fireEvent.change(screen.getByLabelText('Draft instructions'), { target: { value: 'Changed' } })
  expect(screen.queryByLabelText('Companion ticket JSON')).not.toBeInTheDocument()
})
it('discards ticket and instructions after selection changes, including late responses', async () => {
  let resolve!: (value: unknown) => void
  mocks.request.mockImplementation(() => new Promise(done => { resolve = done }))
  const view = render(<NativeTicket {...props} />); issue()
  const requestId = mocks.request.mock.calls[0]?.[3].requestId
  view.rerender(<NativeTicket {...props} messageIds={['other']} />)
  await act(async () => resolve({ ticket: 'a'.repeat(64), requestId, expiresAt: Date.now() + 59000 }))
  expect(screen.getByLabelText('Draft instructions')).toHaveValue('')
  expect(screen.queryByLabelText('Companion ticket JSON')).not.toBeInTheDocument()
})
it('clears private inputs and notifies the parent on expired authentication', async () => {
  mocks.request.mockRejectedValue(new ApiFailure('unauthorized', 'Expired'))
  render(<NativeTicket {...props} />); issue(); await screen.findByRole('alert')
  expect(screen.getByLabelText('Draft instructions')).toHaveValue(''); expect(mocks.expired).toHaveBeenCalledOnce()
  expect(mocks.recheckSession).toHaveBeenCalledOnce()
})
it('refuses missing context, oversized instructions and mismatched replies', async () => {
  const view = render(<NativeTicket {...props} messageIds={[]} />)
  issue(); expect(mocks.request).not.toHaveBeenCalled()
  view.rerender(<NativeTicket {...props} />)
  fireEvent.change(screen.getByLabelText('Draft instructions'), { target: { value: 'a'.repeat(4001) } })
  fireEvent.click(screen.getByRole('button', { name: 'Create companion ticket' })); await screen.findByRole('alert')
  expect(mocks.request).not.toHaveBeenCalled()
  mocks.request.mockResolvedValue({ ticket: 'a'.repeat(64), requestId: 'wrong', expiresAt: Date.now() + 59000 })
  issue(); await waitFor(() => expect(mocks.request).toHaveBeenCalledOnce())
  expect(screen.queryByLabelText('Companion ticket JSON')).not.toBeInTheDocument()
})
it('expires the displayed capability without polling', async () => {
  vi.useFakeTimers(); render(<NativeTicket {...props} />); issue()
  await act(async () => { await Promise.resolve() })
  expect(screen.getByLabelText('Companion ticket JSON')).toBeInTheDocument()
  await act(async () => vi.advanceTimersByTime(60000))
  expect(screen.queryByLabelText('Companion ticket JSON')).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Ticket expired')
})
