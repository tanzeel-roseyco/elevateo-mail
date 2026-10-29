import { describe, expect, it, vi } from 'vitest'
import { createV2EmailFinderGateway } from './v2EmailFinderGateway'
import { FinderRequestSchema, type FinderKind } from '@/features/email-finder/contract'

const ctx = { contextId: 'context_0123456789', authorizationVersion: 'version_0123456789' }
const proof = { csrfToken: 'proof_012345678901234567890123456789' }
const signal = new AbortController().signal
const id = '00000000-0000-4000-8000-000000000001'
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const rows: Record<FinderKind, Record<string, string>[]> = {
  person: [{ name: 'Alex Morgan', domain: 'example.com' }], verify: [{ email: 'alex@example.com' }],
  company: [{ domain: 'example.com' }], decision_maker: [{ company: 'Example', role: 'CTO' }],
}

describe.each<FinderKind>(['person', 'verify', 'company', 'decision_maker'])('%s email finder boundary', (kind) => {
  it('queues through the existing session and CSRF transport', async () => {
    const job = { id, kind, status: 'queued', total: 1, completed: 0, created_at: '2026-10-29T00:00:00Z', items: [] }
    const fetchImpl = vi.fn(async () => response(job))
    expect(await createV2EmailFinderGateway(fetchImpl).create({ kind, rows: rows[kind], csv: null }, ctx, proof, signal)).toEqual(job)
    expect(fetchImpl).toHaveBeenCalledWith('/v2/email-finder/jobs', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', headers: expect.objectContaining({ 'X-CSRF-Token': proof.csrfToken, 'X-Session-Context': ctx.contextId }),
    }))
  })
  it('rejects missing fields before dispatch', () => {
    const fetchImpl = vi.fn(async () => response({}))
    expect(() => createV2EmailFinderGateway(fetchImpl).create({ kind, rows: [{}], csv: null }, ctx, proof, signal)).toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('rejects malformed server progress', async () => {
    const gateway = createV2EmailFinderGateway(async () => response({ id, kind, status: 'valid' }))
    await expect(gateway.create({ kind, rows: rows[kind], csv: null }, ctx, proof, signal)).rejects.toMatchObject({ code: 'malformed' })
  })
})

describe('finder limits and protected reads', () => {
  it('accepts CSV with quoted multiline values for server-side parsing', () => {
    expect(FinderRequestSchema.parse({ kind: 'person', rows: null, csv: 'name,domain\n"Alex Morgan",example.com\n' }).csv).toContain('Alex Morgan')
  })
  it('rejects CSV above two megabytes and rows above 5000', () => {
    expect(FinderRequestSchema.safeParse({ kind: 'verify', rows: null, csv: 'é'.repeat(1_048_577) }).success).toBe(false)
    expect(FinderRequestSchema.safeParse({ kind: 'verify', rows: Array.from({ length: 5_001 }, () => ({ email: 'a@example.com' })), csv: null }).success).toBe(false)
  })
  it('rejects ambiguous sources, company bulk and injected fields', () => {
    expect(FinderRequestSchema.safeParse({ kind: 'verify', rows: rows.verify, csv: 'email\na@example.com' }).success).toBe(false)
    expect(FinderRequestSchema.safeParse({ kind: 'company', rows: null, csv: 'domain\nexample.com' }).success).toBe(false)
    expect(FinderRequestSchema.safeParse({ kind: 'person', rows: [{ name: 'Alex', domain: 'example.com', organization_id: id }], csv: null }).success).toBe(false)
  })
  it('rejects path traversal before fetching a job', () => {
    const fetchImpl = vi.fn(async () => response({}))
    expect(() => createV2EmailFinderGateway(fetchImpl).job('../health', ctx, signal)).toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('matches server domain, UTF-8 input and company row boundaries', () => {
    expect(FinderRequestSchema.safeParse({ kind: 'company', rows: [{ domain: 'https://example.com/path' }], csv: null }).success).toBe(false)
    expect(FinderRequestSchema.safeParse({ kind: 'company', rows: [{ domain: 'example.com..' }], csv: null }).success).toBe(false)
    expect(FinderRequestSchema.safeParse({ kind: 'company', rows: [{ domain: 'example.com' }, { domain: 'example.org' }], csv: null }).success).toBe(false)
    expect(FinderRequestSchema.safeParse({ kind: 'person', rows: [{ name: '\u00e9'.repeat(101), domain: 'example.com' }], csv: null }).success).toBe(false)
    expect(FinderRequestSchema.parse({ kind: 'company', rows: [{ domain: 'EXAMPLE.COM.' }], csv: null }).rows?.[0]?.domain).toBe('example.com')
  })
  it('rejects impossible or duplicate progress rows', async () => {
    const item = { row: 1, input: { domain: 'example.com' } }
    for (const invalid of [{ completed: 2, items: [] }, { completed: 0, items: [item, item] }, { completed: 0, items: [{ ...item, row: 2 }] }]) {
      const gateway = createV2EmailFinderGateway(async () => response({ id, kind: 'company', status: 'running', total: 1, created_at: '2026-10-29T00:00:00Z', ...invalid }))
      await expect(gateway.job(id, ctx, signal)).rejects.toMatchObject({ code: 'malformed' })
    }
  })
  it('preserves authentication errors for central session recovery', async () => {
    const gateway = createV2EmailFinderGateway(async () => response({ code: 'unauthenticated', message: 'Sign in again', request_id: 'req-1' }, 401))
    await expect(gateway.health(ctx, signal)).rejects.toMatchObject({ status: 401 })
  })
  it('validates health and suppression reads and mutations', async () => {
    const entry = { id, kind: 'domain', value: 'example.com', created_at: '2026-10-29T00:00:00Z' }
    const fetchImpl = vi.fn(async (path: string, init: RequestInit) => {
      if (init.method === 'DELETE') return response({ deleted: true })
      if (init.method === 'POST') return response(entry)
      if (path.endsWith('/suppressions')) return response({ items: [entry] })
      return response({ smtp_available: false, smtp_reason: 'Port 25 timed out', ehlo_hostname: null,
        remaining_daily_probes: 50, halted_until: null, worker_seen_at: null })
    })
    const gateway = createV2EmailFinderGateway(fetchImpl)
    expect((await gateway.health(ctx, signal)).smtp_available).toBe(false)
    expect((await gateway.suppressions(ctx, signal)).items).toHaveLength(1)
    expect((await gateway.suppress({ kind: 'domain', value: 'example.com' }, ctx, proof, signal)).id).toBe(id)
    expect(await gateway.unsuppress(id, ctx, proof, signal)).toEqual({ deleted: true })
  })
})
