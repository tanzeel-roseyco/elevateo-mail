import { describe, expect, it, vi } from 'vitest'
import { createDraftAttachmentGateway, prepareDraftUpload } from './draftAttachmentGateway'

const id = '00000000-0000-4000-8000-000000000001'
const context = { contextId: 'c'.repeat(16), authorizationVersion: 'v'.repeat(43) }
const proof = { csrfToken: 'p'.repeat(43) }
const signal = () => new AbortController().signal
const metadata = { id, filename: 'hello.txt', content_type: 'text/plain', byte_size: 3, status: 'pending_scan' }
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
const file = (name = 'hello.txt', type = 'text/plain', size = 3) => {
  const result = new File(['abc'], name, { type })
  Object.defineProperties(result, { size: { value: size }, arrayBuffer: { value: async () => new Uint8Array([97, 98, 99]).buffer } })
  return result
}

describe('draft attachment boundary', () => {
  it('encodes exact bytes and sends same-origin immutable operations with CSRF', async () => {
    const input = await prepareDraftUpload(file(), id, id)
    expect(input.content_base64).toBe('YWJj')
    const fetchImpl = vi.fn(async () => json(metadata))
    const gateway = createDraftAttachmentGateway(fetchImpl)
    expect(await gateway.upload(context, proof, id, input, signal())).toEqual(metadata)
    expect(fetchImpl).toHaveBeenCalledWith(`/v1/drafts/${id}/attachments`, expect.objectContaining({
      method: 'POST', credentials: 'same-origin', body: JSON.stringify(input),
      headers: expect.objectContaining({ 'X-CSRF-Token': proof.csrfToken, 'X-Session-Context': context.contextId }),
    }))
  })
  it.each([
    ['empty.txt', 'text/plain', 0], ['large.txt', 'text/plain', 1_048_577],
    ['script.html', 'text/html', 3], ['../secret', 'text/plain', 3], ['', 'text/plain', 3],
    [' bad.txt', 'text/plain', 3], ['a'.repeat(256), 'text/plain', 3],
  ])('rejects unsafe file %s before upload', async (name, type, size) => {
    await expect(prepareDraftUpload(file(name, type, size), id, id)).rejects.toMatchObject({ code: 'malformed' })
  })
  it('rejects changed bytes and malformed scope', async () => {
    await expect(prepareDraftUpload(file('hello.txt', 'text/plain', 4), id, id)).rejects.toMatchObject({ code: 'malformed' })
    const fetchImpl = vi.fn(async () => json({ items: [] }))
    expect(() => createDraftAttachmentGateway(fetchImpl).list(context, '../escape', id, signal())).toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('validates bounded metadata and removes with authenticated DELETE', async () => {
    const fetchImpl = vi.fn(async (_path: string, init: RequestInit) => json(init.method === 'DELETE' ? { removed: true } : { items: [metadata] }))
    const gateway = createDraftAttachmentGateway(fetchImpl)
    expect(await gateway.list(context, id, id, signal())).toEqual({ items: [metadata] })
    expect(await gateway.remove(context, proof, id, id, id, signal())).toEqual({ removed: true })
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ method: 'DELETE', headers: expect.objectContaining({ 'X-CSRF-Token': proof.csrfToken }) })
    const malformed = createDraftAttachmentGateway(async () => json({ items: [metadata, metadata] }))
    await expect(malformed.list(context, id, id, signal())).rejects.toMatchObject({ code: 'malformed' })
  })
})
