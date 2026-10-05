import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { LiveContacts } from './LiveContacts'
import { ApiFailure } from '@/data/http/httpClient'

const api = vi.hoisted(() => ({ list: vi.fn(), import: vi.fn() }))
const session = vi.hoisted(() => ({ recheck: vi.fn(), accountId: 'alice' }))
vi.mock('@/data/http/contactsGateway', () => ({ createContactsGateway: () => api }))
vi.mock('@/data/http/instance', () => ({
  http: {},
  useLive: (selector: (state: { accountId: string }) => unknown) => selector({ accountId: session.accountId }),
  live: { recheckSession: session.recheck, store: { getState: () => ({ accountId: session.accountId }) } },
}))
const mount = () => render(<MemoryRouter><LiveContacts /></MemoryRouter>)
beforeEach(() => {
  vi.clearAllMocks()
  session.accountId = 'alice'
  api.list.mockResolvedValue({ items: [], next: null })
  api.import.mockResolvedValue({ processed: 1 })
})
describe('live contacts', () => {
  it('shows empty state, records explicit consent and clears the saved form', async () => {
    mount()
    expect(await screen.findByText(/No contacts on this page/u)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Email addresses'), { target: { value: 'client@example.com' } })
    fireEvent.change(screen.getByLabelText('Consent or withdrawal evidence'), { target: { value: 'Signup 2026-10-06' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Save contacts' }))
    expect(await screen.findByText('1 contact saved. No email was sent.')).toBeInTheDocument()
    expect(api.import).toHaveBeenCalledWith([{ email: 'client@example.com', consentSource: 'Signup 2026-10-06', optedIn: true }])
    expect(screen.getByLabelText('Email addresses')).toHaveValue('')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
  it('keeps failed imports visible for correction and does not claim success', async () => {
    api.import.mockRejectedValue(new Error('Consent evidence is required.'))
    mount()
    await screen.findByText(/No contacts on this page/u)
    fireEvent.change(screen.getByLabelText('Email addresses'), { target: { value: 'client@example.com' } })
    fireEvent.change(screen.getByLabelText('Consent or withdrawal evidence'), { target: { value: 'Withdrawal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save contacts' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Consent evidence is required.')
    expect(screen.getByLabelText('Email addresses')).toHaveValue('client@example.com')
    expect(screen.queryByText(/contact saved/u)).not.toBeInTheDocument()
  })
  it('exposes reload after a failed list request', async () => {
    api.list.mockRejectedValueOnce(new Error('Offline'))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
    fireEvent.click(screen.getByRole('button', { name: 'Reload contacts' }))
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/No contacts on this page/u)).toBeInTheDocument()
  })
  it('rechecks an unauthorized list response instead of retaining stale account data', async () => {
    api.list.mockRejectedValueOnce(new ApiFailure('unauthorized', 'Session ended'))
    mount()
    await waitFor(() => expect(session.recheck).toHaveBeenCalledOnce())
    expect(screen.queryByText('Loading contacts…')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
  it('clears private contacts and entered evidence when an import loses authorization', async () => {
    api.list.mockResolvedValue({ items: [{ email: 'private@example.com', consent_source: 'Private receipt', opted_in: 1, suppression: null }], next: null })
    api.import.mockRejectedValue(new ApiFailure('unauthorized', 'Session ended'))
    mount()
    await screen.findByText('private@example.com')
    fireEvent.change(screen.getByLabelText('Email addresses'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('Consent or withdrawal evidence'), { target: { value: 'Secret evidence' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Save contacts' }))
    await waitFor(() => expect(session.recheck).toHaveBeenCalledOnce())
    expect(screen.queryByText('private@example.com')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email addresses')).toHaveValue('')
    expect(screen.getByLabelText('Consent or withdrawal evidence')).toHaveValue('')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
  it('discards a list response after the selected account changes', async () => {
    let resolve!: (value: unknown) => void
    api.list.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const view = mount()
    session.accountId = 'bob'
    view.rerender(<MemoryRouter><LiveContacts /></MemoryRouter>)
    resolve({ items: [{ email: 'alice-private@example.com', consent_source: 'Private', opted_in: 1, suppression: null }], next: null })
    await screen.findByText(/No contacts on this page/u)
    expect(screen.queryByText('alice-private@example.com')).not.toBeInTheDocument()
  })
})
