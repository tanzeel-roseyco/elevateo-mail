import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { LiveAssistant } from './LiveAssistant'
import { ApiFailure } from '@/data/http/httpClient'

const api = vi.hoisted(() => ({ context: vi.fn(), listMessages: vi.fn(), submitAi: vi.fn(), recheckSession: vi.fn() }))
const state = vi.hoisted(() => ({ accountId: 'alice', mailboxes: [{ id: 'mail', address: 'me@example.com', connected: true, aiRead: true, aiDraft: true }] }))
vi.mock('@/data/http/aiGateway', () => ({ createAiGateway: () => api }))
vi.mock('@/data/http/httpGateway', () => ({ createHttpGateway: () => api }))
vi.mock('@/data/http/instance', () => ({ http: {}, useLive: (select: (value: typeof state) => unknown) => select(state),
  live: { ...api, store: { getState: () => state } },
}))
beforeEach(() => {
  vi.resetAllMocks(); state.accountId = 'alice'; state.mailboxes[0]!.aiRead = true; state.mailboxes[0]!.aiDraft = true
  api.listMessages.mockResolvedValue({ items: [{ id: 'message', subject: 'Hello', sender: 'a@example.com' }], next: null })
  api.context.mockResolvedValue({ context: { content: '<script>untrusted email</script>' } })
  api.submitAi.mockResolvedValue({ outcome: 'refused', message: 'Draft saving refused' })
})
function open() {
  const view = render(<MemoryRouter><LiveAssistant /></MemoryRouter>)
  expect(document.title).toBe('AI Assistant · Elevateo Mail')
  fireEvent.change(screen.getByLabelText('Mailbox'), { target: { value: 'mail' } })
  return view
}
function draft() {
  fireEvent.change(screen.getByLabelText('To'), { target: { value: 'a@example.com' } })
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Draft' } })
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Prepared elsewhere' } })
}
it('requires explicit context selection and renders untrusted content as text', async () => {
  open(); expect(api.context).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Load newest messages'))
  fireEvent.click(await screen.findByRole('checkbox'))
  fireEvent.click(screen.getByText('Read selected context (1/20)'))
  expect(await screen.findByText('<script>untrusted email</script>')).toBeInTheDocument()
  expect(api.context).toHaveBeenCalledExactlyOnceWith('mail', ['message'])
})
it('validates before review and saves only after an explicit review action', async () => {
  open(); fireEvent.click(screen.getByText('Review draft'))
  expect(screen.getByRole('alert')).toHaveTextContent('recipient')
  draft(); fireEvent.click(screen.getByText('Review draft'))
  expect(api.submitAi).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Save draft without sending'))
  await screen.findByText('Draft saving refused')
  expect(api.submitAi).toHaveBeenCalledExactlyOnceWith({ mailboxId: 'mail', to: ['a@example.com'], cc: [], bcc: [], subject: 'Draft', body: 'Prepared elsewhere' })
})
it('blocks context and draft operations when separate permissions are absent', () => {
  state.mailboxes[0]!.aiRead = false; state.mailboxes[0]!.aiDraft = false; open()
  expect(screen.queryByText('Load newest messages')).not.toBeInTheDocument()
  expect(screen.queryByText('Review draft')).not.toBeInTheDocument()
})
it('discards a late context response after clearing or changing account', async () => {
  let resolve!: (value: unknown) => void
  api.listMessages.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const view = open(); fireEvent.click(screen.getByText('Load newest messages'))
  fireEvent.click(screen.getByText('Clear draft and context'))
  await act(async () => resolve({ items: [{ id: 'secret', subject: 'Private', sender: 'a' }] }))
  expect(screen.queryByText(/Private/)).not.toBeInTheDocument()
  draft(); state.accountId = 'bob'; view.rerender(<MemoryRouter><LiveAssistant /></MemoryRouter>)
  expect(screen.queryByDisplayValue('Prepared elsewhere')).not.toBeInTheDocument()
})
it('reports read failure and exposes an explicit retry', async () => {
  api.listMessages.mockRejectedValueOnce(new Error('Offline'))
  open(); fireEvent.click(screen.getByText('Load newest messages'))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByText('Load newest messages'))
  await screen.findByRole('checkbox')
})
it('immediately removes sensitive context and draft on 401 while session recheck is pending', async () => {
  api.recheckSession.mockReturnValue(new Promise(() => {}))
  open(); draft(); fireEvent.click(screen.getByText('Load newest messages'))
  fireEvent.click(await screen.findByRole('checkbox'))
  fireEvent.click(screen.getByText('Read selected context (1/20)'))
  await screen.findByText('<script>untrusted email</script>')
  api.listMessages.mockRejectedValueOnce(new ApiFailure('unauthorized', 'Expired'))
  fireEvent.click(screen.getByText('Reload newest messages'))
  await waitFor(() => expect(api.recheckSession).toHaveBeenCalledOnce())
  expect(screen.queryByText('<script>untrusted email</script>')).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue('Prepared elsewhere')).not.toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('session expired')
})
it('caps selection at twenty messages', async () => {
  api.listMessages.mockResolvedValue({ items: Array.from({ length: 21 }, (_, i) => ({ id: `m${i}`, subject: `Subject ${i}`, sender: 'a' })) })
  open(); fireEvent.click(screen.getByText('Load newest messages'))
  const boxes = await screen.findAllByRole('checkbox')
  boxes.slice(0, 20).forEach(box => fireEvent.click(box))
  expect(boxes[20]).toBeDisabled()
  expect(screen.getByText('Read selected context (20/20)')).toBeEnabled()
})
