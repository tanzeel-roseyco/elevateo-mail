import type { RequestDetail } from '@/data/http/live'
import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ComposePage } from './ComposePage'
const api = vi.hoisted(() => ({ openBody: vi.fn(), openRequest: vi.fn(), submit: vi.fn() }))
const state = vi.hoisted(() => ({ mailboxes: [{ id: 'mb', address: 'me@example.com', provider: 'gmail', connected: true, sendEnabled: true }], bodies: [{ key: 'mb/msg', body: { status: 'ready', data: { id: 'msg', mailboxId: 'mb', subject: 'Original subject', sender: 'sender@example.com', incomplete: false } } }], details: [] as RequestDetail[] }))
vi.mock('@/data/http/instance', () => ({ useLive: (select: (s: typeof state) => unknown) => select(state), live: api }))
vi.mock('./QuotaLine', () => ({ QuotaLine: () => null }))
beforeEach(() => { vi.clearAllMocks(); state.details = []; state.mailboxes[0]!.sendEnabled = true; state.mailboxes[0]!.provider = 'gmail'; state.bodies[0]!.body.data.mailboxId = 'mb'; state.bodies[0]!.body.data.incomplete = false; api.submit.mockResolvedValue({ outcome: 'refused', message: 'Test refusal' }) })
function open(reply = true) { return render(<MemoryRouter initialEntries={[{ pathname: '/compose', state: reply ? { mailboxId: 'mb', replyTo: 'msg' } : null }]}><ComposePage /></MemoryRouter>) }
it('locks Gmail reply identity and preserves its source through review and submission', async () => {
  open()
  for (const label of ['From', 'To', 'CC', 'BCC', 'Subject']) expect(screen.getByLabelText(label)).toBeDisabled()
  expect(screen.getByLabelText('Subject')).toHaveValue('Original subject')
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Reply body' } })
  fireEvent.click(screen.getByRole('button', { name: 'Review' }))
  expect(screen.getByText('Reply in the original Gmail conversation')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
  await waitFor(() => expect(api.submit).toHaveBeenCalledWith({ mailboxId: 'mb', replyToMessageId: 'msg', to: ['sender@example.com'], cc: [], bcc: [], subject: 'Original subject', body: 'Reply body' }, null))
  await screen.findByText('Test refusal')
})
it('requires an explicit unlink before editing conversation identity', () => {
  open(); fireEvent.click(screen.getByRole('button', { name: 'Start a new conversation' }))
  expect(screen.getByLabelText('Subject')).toBeEnabled()
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'New message' } })
  fireEvent.click(screen.getByRole('button', { name: 'Review' }))
  expect(screen.queryByText('Reply in the original Gmail conversation')).not.toBeInTheDocument()
})
it.each(['foreign', 'incomplete', 'provider'])('refuses an unavailable %s reply instead of sending a new conversation', (mode) => {
  if (mode === 'foreign') state.bodies[0]!.body.data.mailboxId = 'other'
  if (mode === 'incomplete') state.bodies[0]!.body.data.incomplete = true
  if (mode === 'provider') state.mailboxes[0]!.provider = 'resend'
  open(); expect(screen.getByText('This message cannot be replied to')).toBeInTheDocument()
  expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
})
it('keeps ordinary compose identity editable', () => { open(false); expect(screen.getByLabelText('From')).toBeEnabled(); expect(screen.getByLabelText('Subject')).toHaveValue('') })


function replacement() {
  const summary = { id: 'saved', mailboxId: 'mb', idempotencyKey: 'key', revision: 'a'.repeat(64), status: 'draft' as const, createdAt: '2026-10-06', successorId: null }
  state.details = [{ id: 'saved', saved: { status: 'ready', data: { summary, replyToMessageId: 'msg', from: 'me@example.com', to: ['sender@example.com'], cc: [], bcc: [], subject: 'Original subject', body: 'Saved body', kind: 'manual' } }, status: 'draft', revision: summary.revision, successorId: null, errorCode: null, correlationId: null, checkedAt: null, notice: null }]
  return render(<MemoryRouter initialEntries={['/compose?replace=saved']}><ComposePage /></MemoryRouter>)
}
it('preserves reply source and original mailbox while replacing a saved request', async () => {
  replacement(); expect(screen.getByLabelText('From')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Review' }))
  fireEvent.click(screen.getByRole('button', { name: 'Replace and submit for approval' }))
  await waitFor(() => expect(api.submit).toHaveBeenCalledWith(expect.objectContaining({ replyToMessageId: 'msg', mailboxId: 'mb' }), { id: 'saved', revision: 'a'.repeat(64) }))
  await screen.findByText('Test refusal')
})
