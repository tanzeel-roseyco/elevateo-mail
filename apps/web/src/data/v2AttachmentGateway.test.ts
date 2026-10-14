import { describe, expect, it, vi } from 'vitest'
import { createV2AttachmentGateway } from './v2AttachmentGateway'

const id = '00000000-0000-4000-8000-000000000001'
const context = { contextId: 'c'.repeat(16), authorizationVersion: 'v'.repeat(43) }
const signal = () => new AbortController().signal
const binary = (body: string, length = body.length) => new Response(body, { headers: {
  'Content-Type': 'application/octet-stream', 'Content-Length': String(length),
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Content-Disposition': 'attachment; filename="attachment"',
} })

describe('inert private attachment gateway port', () => {
  it('validates rejected metadata and reads bounded same-origin bytes', async () => {
    const fetchImpl = vi.fn(async (path: string, init: RequestInit) => {
      if (path.endsWith('/content')) return binary('abc')
      expect(init.credentials).toBe('same-origin')
      return new Response(JSON.stringify({ items: [{ id, filename: 'blocked.txt', content_type: 'text/plain',
        byte_size: 0, scan_status: 'rejected' }], next_cursor: null }),
      { headers: { 'Content-Type': 'application/json' } })
    })
    const gateway = createV2AttachmentGateway(fetchImpl)
    const page = await gateway.listInboxAttachments(context, id, id, id, { limit: 50 }, signal())
    expect(page.items[0]?.scan_status).toBe('rejected')
    const blob = await gateway.downloadCleanInboxAttachment(context, id, id, id, id, signal())
    expect(await blob.text()).toBe('abc')
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store', redirect: 'manual' })
  })

  it('maps denied bytes to unavailable without retry', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }))
    await expect(createV2AttachmentGateway(fetchImpl).downloadCleanInboxAttachment(context, id, id, id, id, signal()))
      .rejects.toMatchObject({ kind: 'api', code: 'not_available', status: 404 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects wrong binary length and invalid scope before returning a blob', async () => {
    const fetchImpl = vi.fn(async () => binary('abc', 4))
    await expect(createV2AttachmentGateway(fetchImpl).downloadCleanInboxAttachment(context, id, id, id, id, signal()))
      .rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
    expect(() => createV2AttachmentGateway(fetchImpl).listInboxAttachments(context, id, id, id,
      { limit: 51 }, signal())).toThrow()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects unsafe metadata filenames before display', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ items: [{ id, filename: '../secret',
      content_type: 'text/plain', byte_size: 1, scan_status: 'clean' }], next_cursor: null }),
    { headers: { 'Content-Type': 'application/json' } }))
    await expect(createV2AttachmentGateway(fetchImpl).listInboxAttachments(context, id, id, id,
      { limit: 1 }, signal())).rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
  })
})
