import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider, useSession } from '@/app/session'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { GatewayError } from '@/data/errors'
import { MessageAttachments, type AttachmentReadPort, type AttachmentSummary } from './MessageAttachments'

const MB = '00000000-0000-4000-8000-000000000021'
const THREAD = '00000000-0000-4000-8000-000000000031'
const MESSAGE = '00000000-0000-4000-8000-000000000041'
const FILE = '00000000-0000-4000-8000-000000000051'
const clean: AttachmentSummary = { id: FILE, filename: 'notes.txt', content_type: 'text/plain', byte_size: 5, scan_status: 'clean' }

function renderAttachments(port: AttachmentReadPort) {
  function Ready() {
    const { state } = useSession()
    const [visible, setVisible] = useState(true)
    return <>{state.status === 'ready' && visible && <MessageAttachments mailboxId={MB} threadId={THREAD} messageId={MESSAGE} count={1} port={port} />}
      <button onClick={() => setVisible(false)}>Leave message</button></>
  }
  return render(<SessionProvider gateway={createFixtureGateway()}><Ready /></SessionProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('private inbox attachments (ATT830)', () => {
  it('lists clean metadata and downloads through the authorized byte port only after explicit action', async () => {
    const list = vi.fn<AttachmentReadPort['listInboxAttachments']>(async () => ({ items: [clean], next_cursor: null }))
    const download = vi.fn<AttachmentReadPort['downloadCleanInboxAttachment']>(async () => new Blob(['hello'], { type: 'text/plain' }))
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:private-test') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderAttachments({ listInboxAttachments: list, downloadCleanInboxAttachment: download })
    fireEvent.click(await screen.findByRole('button', { name: 'Show 1 attachment' }))
    await screen.findByText(/notes\.txt \(5 bytes\)/)
    expect(download).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Download notes.txt' }))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(download).toHaveBeenCalledWith(expect.anything(), MB, THREAD, MESSAGE, FILE, expect.any(AbortSignal))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Leave message' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-test')
  })

  it('keeps each overlapping download busy until its own response settles', async () => {
    const second: AttachmentSummary = { ...clean, id: '00000000-0000-4000-8000-000000000052', filename: 'second.txt' }
    let finishFirst!: (value: Blob) => void
    let finishSecond!: (value: Blob) => void
    const download = vi.fn<AttachmentReadPort['downloadCleanInboxAttachment']>(async (_ctx, _mb, _thread, _message, id) => new Promise<Blob>((resolve) => {
      if (id === FILE) finishFirst = resolve
      else finishSecond = resolve
    }))
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:private-test') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderAttachments({ listInboxAttachments: async () => ({ items: [clean, second], next_cursor: null }), downloadCleanInboxAttachment: download })
    fireEvent.click(await screen.findByRole('button', { name: 'Show 1 attachment' }))
    const firstButton = await screen.findByRole('button', { name: 'Download notes.txt' })
    const secondButton = screen.getByRole('button', { name: 'Download second.txt' })
    fireEvent.click(firstButton)
    fireEvent.click(secondButton)
    expect(firstButton).toHaveProperty('disabled', true)
    expect(secondButton).toHaveProperty('disabled', true)
    await act(async () => finishFirst(new Blob(['hello'])))
    expect(firstButton).toHaveProperty('disabled', false)
    expect(secondButton).toHaveProperty('disabled', true)
    fireEvent.click(secondButton)
    expect(download).toHaveBeenCalledTimes(2)
    await act(async () => finishSecond(new Blob(['hello'])))
    expect(secondButton).toHaveProperty('disabled', false)
  })

  it('holds pending and blocked files without requesting bytes', async () => {
    const download = vi.fn<AttachmentReadPort['downloadCleanInboxAttachment']>()
    renderAttachments({
      listInboxAttachments: async () => ({ items: [{ ...clean, scan_status: 'pending_scan' }, { ...clean, id: '00000000-0000-4000-8000-000000000052', scan_status: 'malware' }], next_cursor: null }),
      downloadCleanInboxAttachment: download,
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Show 1 attachment' }))
    await screen.findByText(/Pending security scan/)
    expect(screen.getByText(/Blocked by security scan/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull()
    expect(download).not.toHaveBeenCalled()
  })

  it('keeps a clean listing but denies bytes when the proxy reports a held verdict', async () => {
    const download = vi.fn<AttachmentReadPort['downloadCleanInboxAttachment']>(async () => { throw new GatewayError('api', 'not_available', 'held', { status: 423 }) })
    renderAttachments({ listInboxAttachments: async () => ({ items: [clean], next_cursor: null }), downloadCleanInboxAttachment: download })
    fireEvent.click(await screen.findByRole('button', { name: 'Show 1 attachment' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Download notes.txt' }))
    await screen.findByText('This attachment is no longer available to download.')
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('rejects an oversized or mismatched proxy body before creating a download URL', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() })
    renderAttachments({
      listInboxAttachments: async () => ({ items: [clean], next_cursor: null }),
      downloadCleanInboxAttachment: async () => new Blob(['too long']),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Show 1 attachment' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Download notes.txt' }))
    await screen.findByText('Download failed. Retry explicitly.')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('clears listed metadata after the download proxy revokes the session', async () => {
    const download = vi.fn<AttachmentReadPort['downloadCleanInboxAttachment']>(async () => { throw new GatewayError('api', 'unauthenticated', 'revoked', { status: 401 }) })
    renderAttachments({ listInboxAttachments: async () => ({ items: [clean], next_cursor: null }), downloadCleanInboxAttachment: download })
    fireEvent.click(await screen.findByRole('button', { name: 'Show 1 attachment' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Download notes.txt' }))
    await waitFor(() => expect(screen.queryByText(/notes\.txt \(5 bytes\)/)).toBeNull())
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('shows a generic denied answer without exposing attachment metadata', async () => {
    const list = vi.fn<AttachmentReadPort['listInboxAttachments']>()
      .mockRejectedValueOnce(new GatewayError('api', 'not_available', 'foreign mailbox', { status: 404 }))
    renderAttachments({ listInboxAttachments: list, downloadCleanInboxAttachment: async () => { throw new Error('unexpected') } })
    fireEvent.click(await screen.findByRole('button', { name: 'Show 1 attachment' }))
    await screen.findByText('Attachments are unavailable for this message.')
    // The denied answer is intentionally generic and offers no resource identity.
    expect(screen.queryByText('notes.txt')).toBeNull()
  })

  it('drops a late metadata response when the message owner unmounts', async () => {
    let resolveLate!: (value: { items: AttachmentSummary[]; next_cursor: null }) => void
    const list = vi.fn<AttachmentReadPort['listInboxAttachments']>(async () => new Promise((resolve) => { resolveLate = resolve }))
    renderAttachments({ listInboxAttachments: list, downloadCleanInboxAttachment: async () => { throw new Error('unexpected') } })
    fireEvent.click(await screen.findByRole('button', { name: 'Show 1 attachment' }))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    const signal = list.mock.calls[0]?.[5]
    fireEvent.click(screen.getByRole('button', { name: 'Leave message' }))
    expect(signal?.aborted).toBe(true)
    await act(async () => resolveLate({ items: [clean], next_cursor: null }))
    expect(screen.queryByText(/notes\.txt/)).toBeNull()
  })
})
