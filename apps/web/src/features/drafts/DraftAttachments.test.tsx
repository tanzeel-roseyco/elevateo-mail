import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/app/session'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { GatewayError } from '@/data/errors'
import type { DraftAttachmentGateway, DraftUpload } from '@/data/draftAttachmentGateway'
import { DraftAttachments } from './DraftAttachments'

const attachment = { id: CD.draftId, filename: 'hello.txt', content_type: 'text/plain' as const, byte_size: 3, status: 'pending_scan' as const }
const file = () => {
  const value = new File(['abc'], 'hello.txt', { type: 'text/plain' })
  Object.defineProperty(value, 'arrayBuffer', { value: async () => new Uint8Array([97, 98, 99]).buffer })
  return value
}
function setup(extra: Partial<DraftAttachmentGateway> = {}, disabled = false) {
  const port = { list: vi.fn(async () => ({ items: [] })), upload: vi.fn(async () => attachment), remove: vi.fn(async () => ({ removed: true as const })), ...extra }
  const view = render(<SessionProvider gateway={{ ...createFixtureGateway(), draftAttachments: port }}>
    <DraftAttachments draftId={CD.draftId} mailboxId={CD.mailboxId} disabled={disabled} />
  </SessionProvider>)
  return { port, ...view }
}
async function choose() {
  const input = await screen.findByLabelText('Choose attachment')
  fireEvent.change(input, { target: { files: [file()] } })
}

describe('saved draft attachment panel', () => {
  beforeEach(() => { window.sessionStorage.clear(); vi.restoreAllMocks() })
  it('a failed first list shows the error without a lingering loading status', async () => {
    setup({ list: vi.fn(async () => { throw new GatewayError('transport', 'network', 'down') }) })
    expect(await screen.findByText('Attachments could not be loaded. Refresh to try again.')).toBeTruthy()
    expect(screen.queryByText('Loading attachments...')).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry loading attachments' })).toBeTruthy()
  })

  it('uploads, displays scan state, refreshes, and removes', async () => {
    const { port } = setup()
    await choose()
    await screen.findByText('Waiting for security scan')
    expect(port.upload).toHaveBeenCalledOnce()
    expect(screen.queryByLabelText('Choose attachment')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment' }))
    await screen.findByLabelText('Choose attachment')
    expect(port.remove).toHaveBeenCalledWith(expect.anything(), expect.anything(), CD.draftId, CD.mailboxId, attachment.id, expect.any(AbortSignal))
  })
  it('retries identical operation and bytes after an uncertain upload', async () => {
    const calls: DraftUpload[] = []
    setup({ upload: vi.fn(async (_ctx, _proof, _draft, input) => {
      calls.push(input)
      if (calls.length === 1) throw new GatewayError('transport', 'timeout', 'synthetic')
      return attachment
    }) })
    await choose()
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Retry same attachment' }))
    await screen.findByText('Waiting for security scan')
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
  })
  it('rejects a disallowed file type before calling the upload port', async () => {
    const { port } = setup()
    const input = await screen.findByLabelText('Choose attachment')
    const bad = new File(['x'], 'archive.zip', { type: 'application/zip' })
    Object.defineProperty(bad, 'arrayBuffer', { value: async () => new Uint8Array([120]).buffer })
    fireEvent.change(input, { target: { files: [bad] } })
    await screen.findByRole('alert')
    expect(port.upload).not.toHaveBeenCalled()
  })
  it('blocks uploads while draft edits are unsaved', async () => {
    const { port } = setup({}, true)
    const input = await screen.findByLabelText('Choose attachment') as HTMLInputElement
    expect(input.disabled).toBe(true)
    fireEvent.change(input, { target: { files: [file()] } })
    expect(port.upload).not.toHaveBeenCalled()
  })
  it('aborts removal and drops completions after unmount', async () => {
    let finish: (() => void) | undefined
    const { unmount, port } = setup({
      list: async () => ({ items: [attachment] }),
      remove: vi.fn(async () => { await new Promise<void>((resolve) => { finish = resolve }); return { removed: true as const } }),
    })
    await screen.findByText('Waiting for security scan')
    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment' }))
    await waitFor(() => expect(port.remove).toHaveBeenCalledOnce())
    const requestSignal = vi.mocked(port.remove).mock.calls[0]?.[5]
    unmount()
    expect(requestSignal?.aborted).toBe(true)
    await act(async () => { finish?.() })
  })
})
