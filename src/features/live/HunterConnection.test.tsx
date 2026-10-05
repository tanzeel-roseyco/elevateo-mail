import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { ApiFailure } from '@/data/http/httpClient'
import { HunterConnection } from './HunterConnection'

const mocks = vi.hoisted(() => ({ accountId: 'alice', status: vi.fn(), connection: vi.fn(), save: vi.fn(), revoke: vi.fn(), enrich: vi.fn(), recheckSession: vi.fn() }))
vi.mock('@/data/http/hunterGateway', () => ({ createHunterGateway: () => mocks }))
vi.mock('@/data/http/instance', () => ({ http: {}, useLive: (select: (state: { accountId: string }) => unknown) => select(mocks), live: { store: { getState: () => mocks }, recheckSession: mocks.recheckSession } }))
beforeEach(() => {
  vi.resetAllMocks(); mocks.accountId = 'alice'
  mocks.status.mockResolvedValue({ enabled: true }); mocks.connection.mockResolvedValue({ connection: { revision: 1, revoked: 0 } })
  mocks.save.mockResolvedValue({ connection: { revision: 2, revoked: 0 } }); mocks.revoke.mockResolvedValue({ connection: { revision: 3, revoked: 1 } })
  mocks.enrich.mockResolvedValue({ profile: { fullName: 'Alex', title: null, company: null, companyDomain: null, location: null }, source: 'hunter' })
})
async function lookup() {
  fireEvent.change(await screen.findByLabelText('Saved contact email'), { target: { value: 'alex@example.com' } })
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Look up contact' }))
}
it('requires explicit credits approval, displays a profile without changing contacts and clears acknowledgement', async () => {
  render(<HunterConnection />)
  await screen.findByLabelText('Saved contact email'); expect(mocks.enrich).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Look up contact' })).toBeDisabled()
  await lookup(); await screen.findByText('Alex')
  expect(mocks.enrich).toHaveBeenCalledExactlyOnceWith('alex@example.com')
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(screen.getByText('Profile found. Your contact was not changed.')).toBeInTheDocument()
})
it('saves a key with revision, immediately clears its input, and removes access while disabled', async () => {
  render(<HunterConnection />)
  const input = await screen.findByLabelText('Hunter API key')
  fireEvent.change(input, { target: { value: 'secret-key' } }); fireEvent.submit(input.closest('form')!)
  await screen.findByText('Hunter access saved. No lookup was made.'); expect(input).toHaveValue('')
  expect(mocks.save).toHaveBeenCalledWith('secret-key', 1)
  mocks.status.mockResolvedValue({ enabled: false }); fireEvent.click(screen.getByText('Reload Hunter access'))
  await screen.findByText(/Hunter lookups are disabled/u)
  expect(screen.queryByLabelText('Hunter API key')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Remove Hunter access')); await screen.findByText('Hunter access removed.')
})
it('does not retry uncertain billed lookups and requires reload', async () => {
  mocks.enrich.mockRejectedValue(new ApiFailure('network', 'lost'))
  render(<HunterConnection />); await lookup(); await screen.findByRole('alert')
  expect(mocks.enrich).toHaveBeenCalledTimes(1); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Reload Hunter access')); await screen.findByRole('checkbox')
  expect(screen.getByRole('checkbox')).not.toBeChecked(); expect(mocks.enrich).toHaveBeenCalledTimes(1)
})
it('clears private state immediately on 401 while session recheck remains pending', async () => {
  mocks.enrich.mockRejectedValue(new ApiFailure('unauthorized', 'expired'))
  render(<HunterConnection />); await lookup(); await waitFor(() => expect(mocks.recheckSession).toHaveBeenCalled())
  expect(screen.queryByLabelText('Saved contact email')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Hunter API key')).not.toBeInTheDocument()
})
it('discards old-account lookup results', async () => {
  let resolve!: (value: unknown) => void
  mocks.enrich.mockImplementation(() => new Promise(done => { resolve = done }))
  const view = render(<HunterConnection />); await lookup()
  mocks.accountId = 'bob'; view.rerender(<HunterConnection />)
  await act(async () => resolve({ profile: { fullName: 'Private Alice' }, source: 'hunter' }))
  expect(screen.queryByText('Private Alice')).not.toBeInTheDocument()
  expect(await screen.findByLabelText('Saved contact email')).toHaveValue('')
})
it('keeps revocation available when configuration status fails', async () => {
  mocks.status.mockRejectedValue(new ApiFailure('network', 'configuration unavailable'))
  render(<HunterConnection />)
  await screen.findByText('Hunter configuration is unavailable. Stored access can still be removed.')
  expect(screen.queryByLabelText('Hunter API key')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Remove Hunter access'))
  await screen.findByText('Hunter access removed.')
  expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith(1)
})
