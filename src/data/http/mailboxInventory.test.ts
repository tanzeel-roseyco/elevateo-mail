import { expect, it, vi } from 'vitest'
import { createHttpClient } from './httpClient'
import { createHttpGateway } from './httpGateway'

// AIDEV-NOTE: History is loaded one page per user action, never by an unbounded startup loop.
const row = (id: string, connected = 0) => ({ id, address: `${id}@example.com`, provider: 'fake', connected, send_enabled: 0, ai_read: 0, ai_draft: 0, ai_send: 0 })
function fixture(body: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }))
  return { fetch, gateway: createHttpGateway(createHttpClient({ baseUrl: '', fetch })) }
}
it('fetches a bounded history page with an explicit cursor', async () => {
  const { fetch, gateway } = fixture({ items: [row('old')], next: { after: 'old' } })
  expect(await gateway.listMailboxHistory('previous')).toMatchObject({ items: [{ id: 'old', connected: false }], next: { after: 'old' } })
  expect(fetch.mock.calls.map(c => c[0])).toEqual(['/v1/mailboxes?connected=false&limit=25&after=previous'])
})
it('rejects an incomplete active inventory or incorrectly filtered history', async () => {
  await expect(fixture({ items: [row('active', 1)], next: { after: 'active' } }).gateway.listMailboxes()).rejects.toMatchObject({ kind: 'unavailable' })
  await expect(fixture({ items: [row('active', 1)], next: null }).gateway.listMailboxHistory(null)).rejects.toMatchObject({ kind: 'unavailable' })
})
it('looks up exact historical references and rejects unrelated answers', async () => {
  expect(await fixture({ items: [row('old')], next: null }).gateway.getMailbox('old')).toMatchObject({ id: 'old' })
  expect(await fixture({ items: [], next: null }).gateway.getMailbox('absent')).toBeNull()
  await expect(fixture({ items: [row('other')], next: null }).gateway.getMailbox('old')).rejects.toMatchObject({ kind: 'unavailable' })
})
