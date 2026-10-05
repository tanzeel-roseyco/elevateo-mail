import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { LiveCampaigns } from './LiveCampaigns'
import { ApiFailure } from '@/data/http/httpClient'

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), status: vi.fn(), prepare: vi.fn() }))
const session = vi.hoisted(() => ({ accountId: 'alice', recheck: vi.fn(), capabilities: { simulated: true, liveSending: false } }))
vi.mock('@/data/http/campaignsGateway', () => ({ createCampaignsGateway: () => api }))
// AIDEV-NOTE: The independent sequence panel has its own gateway tests; parent tests supply its empty inventory.
vi.mock('@/data/http/sequencesGateway', async importOriginal => ({ ...await importOriginal<typeof import('@/data/http/sequencesGateway')>(),
  createSequencesGateway: () => ({ list: async () => ({ items: [], next: null, liveActivationAvailable: false }) }),
}))
vi.mock('@/data/http/instance', () => ({ http: {},
  useLive: (selector: (state: { accountId: string; capabilities: typeof session.capabilities; mailboxes: { id: string; address: string }[] }) => unknown) =>
    selector({ accountId: session.accountId, capabilities: session.capabilities, mailboxes: [{ id: 'mail', address: 'alice@example.com' }] }),
  live: { store: { getState: () => ({ accountId: session.accountId }) }, recheckSession: session.recheck },
}))
const mount = () => render(<MemoryRouter><LiveCampaigns /></MemoryRouter>)
beforeEach(() => {
  vi.clearAllMocks()
  session.accountId = 'alice'
  session.capabilities = { simulated: true, liveSending: false }
  session.recheck.mockResolvedValue(undefined)
  api.list.mockResolvedValue({ items: [{ id: 'welcome', status: 'draft' }], next: null, simulated: true })
  api.prepare.mockResolvedValue({ id: 'saved', status: 'draft' })
})
function fillDraft() {
  fireEvent.click(screen.getByRole('button', { name: 'welcome' }))
  fireEvent.change(screen.getByLabelText('Sending mailbox'), { target: { value: 'mail' } })
  fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: 'client@example.com' } })
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Hello' } })
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Welcome' } })
}
describe('live campaigns', () => {
  it('limits live capability messaging to Resend campaigns and retains separate review', async () => {
    session.capabilities = { simulated: false, liveSending: true }
    mount()
    await screen.findByRole('button', { name: 'welcome' })
    expect(screen.getByText(/Live Resend campaigns are enabled/u)).toHaveTextContent('Gmail campaign sending is unavailable')
    expect(screen.queryByText(/No real email is sent/u)).not.toBeInTheDocument()
    expect(api.prepare).not.toHaveBeenCalled()
    expect(api.status).not.toHaveBeenCalled()
  })
  it('prepares a draft and links review without enabling or sending', async () => {
    mount()
    await screen.findByRole('button', { name: 'welcome' })
    fillDraft()
    fireEvent.click(screen.getByRole('button', { name: 'Prepare for review' }))
    expect(await screen.findByRole('link', { name: 'Review this send request' })).toHaveAttribute('href', '/sends/saved')
    expect(api.prepare).toHaveBeenCalledWith('welcome', { mailboxId: 'mail', recipient: 'client@example.com', subject: 'Hello', body: 'Welcome' })
    expect(api.status).not.toHaveBeenCalled()
  })
  it('prepares an explicit UTC schedule and explains that approval stays separate', async () => {
    mount()
    await screen.findByRole('button', { name: 'welcome' })
    fillDraft()
    const date = new Date(Date.now() + 86_400_000)
    const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T12:00`
    fireEvent.change(screen.getByLabelText('Earliest send time (optional)'), { target: { value: local } })
    expect(screen.getByText(/Review time:/u)).toHaveTextContent('approval and simulated dispatch remain separate')
    fireEvent.click(screen.getByRole('button', { name: 'Prepare for review' }))
    await screen.findByRole('link', { name: 'Review this send request' })
    expect(api.prepare).toHaveBeenCalledWith('welcome', expect.objectContaining({ scheduledAt: new Date(local).toISOString() }))
    expect(api.status).not.toHaveBeenCalled()
  })
  it('rejects a schedule more than 30 days ahead before HTTP', async () => {
    mount()
    await screen.findByRole('button', { name: 'welcome' })
    fillDraft()
    fireEvent.change(screen.getByLabelText('Earliest send time (optional)'), { target: { value: '2100-01-01T12:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Prepare for review' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a valid time no more than 30 days ahead')
    expect(api.prepare).not.toHaveBeenCalled()
  })
  it('retries unchanged content after its scheduled time passes when the saved response was lost', async () => {
    const due = new Date('2030-01-02T12:00').getTime()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(due - 60_000)
    api.prepare.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce({ id: 'original', status: 'draft' })
    try {
      mount(); await screen.findByRole('button', { name: 'welcome' }); fillDraft()
      fireEvent.change(screen.getByLabelText('Earliest send time (optional)'), { target: { value: '2030-01-02T12:00' } })
      fireEvent.click(screen.getByRole('button', { name: 'Prepare for review' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Response lost')
      clock.mockReturnValue(due + 60_000)
      fireEvent.click(screen.getByRole('button', { name: 'Prepare for review' }))
      expect(await screen.findByRole('link', { name: 'Review this send request' })).toHaveAttribute('href', '/sends/original')
      expect(api.prepare).toHaveBeenCalledTimes(2)
      expect(api.prepare.mock.calls[1]).toEqual(api.prepare.mock.calls[0])
    } finally { clock.mockRestore() }
  })
  it('shows the server rejection for a new past-dated draft without changing its content', async () => {
    api.prepare.mockRejectedValueOnce(new Error('schedule_must_be_future'))
    mount(); await screen.findByRole('button', { name: 'welcome' }); fillDraft()
    fireEvent.change(screen.getByLabelText('Earliest send time (optional)'), { target: { value: '2000-01-01T12:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Prepare for review' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('schedule_must_be_future')
    expect(api.prepare).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Message')).toHaveValue('Welcome')
    expect(screen.queryByRole('link', { name: 'Review this send request' })).not.toBeInTheDocument()
  })
  it('retains draft content when preparation fails', async () => {
    api.prepare.mockRejectedValue(new Error('recipient_not_eligible'))
    mount()
    await screen.findByRole('button', { name: 'welcome' })
    fillDraft()
    fireEvent.click(screen.getByRole('button', { name: 'Prepare for review' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('recipient_not_eligible')
    expect(screen.getByLabelText('Message')).toHaveValue('Welcome')
    expect(screen.queryByRole('link', { name: 'Review this send request' })).not.toBeInTheDocument()
  })
  it('provides loading, retry and empty states', async () => {
    api.list.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ items: [], next: null, simulated: true })
    mount()
    expect(screen.getByRole('status')).toHaveTextContent('Loading campaigns')
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
    fireEvent.click(screen.getByRole('button', { name: 'Reload campaigns' }))
    expect(await screen.findByText(/No campaigns on this page/u)).toBeInTheDocument()
  })
  it.each(['Sending mailbox', 'Recipient', 'Subject', 'Message'])('removes the old saved result after editing %s', async label => {
    mount()
    await screen.findByRole('button', { name: 'welcome' })
    fillDraft()
    fireEvent.click(screen.getByRole('button', { name: 'Prepare for review' }))
    await screen.findByRole('link', { name: 'Review this send request' })
    fireEvent.change(screen.getByLabelText(label), { target: { value: label === 'Sending mailbox' ? '' : 'Changed' } })
    expect(screen.queryByRole('link', { name: 'Review this send request' })).not.toBeInTheDocument()
  })
  it('clears private forms and inventory on an unauthorized mutation before session refresh finishes', async () => {
    api.prepare.mockRejectedValue(new ApiFailure('unauthorized', 'Session expired', null, 401))
    session.recheck.mockReturnValue(new Promise(() => {}))
    mount()
    await screen.findByRole('button', { name: 'welcome' })
    fillDraft()
    fireEvent.click(screen.getByRole('button', { name: 'Prepare for review' }))
    await waitFor(() => expect(session.recheck).toHaveBeenCalledOnce())
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /welcome/u })).not.toBeInTheDocument()
  })
  it('rechecks the session when listing is unauthorized', async () => {
    api.list.mockRejectedValue(new ApiFailure('unauthorized', 'Session expired', null, 401))
    mount()
    await waitFor(() => expect(session.recheck).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: 'welcome' })).not.toBeInTheDocument()
  })
  it('discards a pending result after switching accounts', async () => {
    let resolve!: (value: { id: string; status: string }) => void
    api.prepare.mockReturnValue(new Promise(done => { resolve = done }))
    const view = mount()
    await screen.findByRole('button', { name: 'welcome' })
    fillDraft()
    fireEvent.click(screen.getByRole('button', { name: 'Prepare for review' }))
    session.accountId = 'bob'
    view.rerender(<MemoryRouter><LiveCampaigns /></MemoryRouter>)
    await act(async () => { resolve({ id: 'alice-private', status: 'draft' }) })
    expect(screen.queryByRole('link', { name: 'Review this send request' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
  })
})
