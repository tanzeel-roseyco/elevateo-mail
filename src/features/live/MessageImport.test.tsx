import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MessageImport } from './MessageImport'
import { ApiFailure } from '@/data/http/httpClient'

const api = vi.hoisted(() => ({ import: vi.fn() }))
const session = vi.hoisted(() => ({ accountId: 'alice', reload: vi.fn(), recheck: vi.fn() }))
vi.mock('@/data/http/importGateway', async importOriginal => ({
  ...await importOriginal<typeof import('@/data/http/importGateway')>(), createImportGateway: () => api,
}))
vi.mock('@/data/http/instance', () => ({ http: {},
  useLive: (selector: (state: { accountId: string }) => unknown) => selector({ accountId: session.accountId }),
  live: { store: { getState: () => ({ accountId: session.accountId }) }, reloadPage: session.reload, recheckSession: session.recheck },
}))
const payload = { messages: [{ id: 'old', threadId: 'thread', sender: 'a@example.com', subject: 'Old', body: 'Text', at: 1000 }] }
function choose(text = JSON.stringify(payload), read?: Promise<string>) {
  const file = new File([text], 'history.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: () => read ?? Promise.resolve(text) })
  fireEvent.change(screen.getByLabelText('Historical JSON file'), { target: { files: [file] } })
}
beforeEach(() => {
  vi.clearAllMocks(); session.accountId = 'alice'
  api.import.mockResolvedValue({ processed: 1, imported: 1, unchanged: 0 })
  session.reload.mockResolvedValue(undefined); session.recheck.mockResolvedValue(undefined)
})
// AIDEV-NOTE: File reads and HTTP responses must not publish results after the authenticated account changes.
describe('historical message import', () => {
  it('previews without uploading and imports only after confirmation', async () => {
    render(<MessageImport mailboxId="mail" />); choose()
    await screen.findByText('Ready to import 1 messages into this mailbox.')
    expect(api.import).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    expect(await screen.findByRole('status')).toHaveTextContent('1 messages imported')
    expect(api.import).toHaveBeenCalledWith('mail', payload)
    expect(session.reload).toHaveBeenCalledOnce()
  })
  it('rejects invalid files and supports retry after a transient response failure', async () => {
    render(<MessageImport mailboxId="mail" />); choose('{}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Expected 1–25 messages')
    expect(api.import).not.toHaveBeenCalled()
    choose(); await screen.findByText(/Ready to import/u)
    api.import.mockRejectedValueOnce(new Error('Network unavailable'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    await screen.findByText(/1 messages imported/u)
    expect(api.import.mock.calls[1]).toEqual(api.import.mock.calls[0])
  })
  it('ignores a pending file read after switching account', async () => {
    let resolve!: (text: string) => void
    const read = new Promise<string>(done => { resolve = done })
    const view = render(<MessageImport mailboxId="mail" />); choose('', read)
    session.accountId = 'bob'; view.rerender(<MessageImport mailboxId="mail" />)
    await act(async () => { resolve(JSON.stringify(payload)); await read })
    expect(screen.queryByText(/Ready to import/u)).not.toBeInTheDocument()
    expect(api.import).not.toHaveBeenCalled()
  })
  it('ignores a pending response after switching account', async () => {
    let resolve!: (result: { processed: number; imported: number; unchanged: number }) => void
    api.import.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const view = render(<MessageImport mailboxId="mail" />); choose(); await screen.findByText(/Ready to import/u)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    session.accountId = 'bob'; view.rerender(<MessageImport mailboxId="mail" />)
    await act(async () => { resolve({ processed: 1, imported: 1, unchanged: 0 }) })
    expect(screen.queryByText(/1 messages imported/u)).not.toBeInTheDocument()
    expect(session.reload).not.toHaveBeenCalled()
  })
  it('clears a prepared import and rechecks an expired session', async () => {
    api.import.mockRejectedValueOnce(new ApiFailure('unauthorized', 'Session expired'))
    render(<MessageImport mailboxId="mail" />); choose(); await screen.findByText(/Ready to import/u)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    await waitFor(() => expect(session.recheck).toHaveBeenCalledOnce())
    expect(screen.queryByText(/Ready to import/u)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled()
  })
})
