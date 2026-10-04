import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SendContent, ServerSendStatus } from '@/domain/sendLifecycle'
import type { Capabilities, MailboxQuota, ServerMailbox } from './contract'
import { ApiFailure } from './httpClient'
import { createLive, type Live } from './live'
import type { ServerGateway } from './ports'

// A stand-in for the server boundary only. It keeps intents by idempotency key the way the real ledger does, and
// each test can make the next call fail to exercise lost answers, refusals and expiry.

const TOKEN_A = 'a'.repeat(48)
const TOKEN_B = 'b'.repeat(48)
const capabilities: Capabilities = { version: 1, simulated: true, liveSending: false, dnsWrites: false, features: { mailboxInventory: true, messages: true, manualSend: true, campaignWizard: false, inboxSync: false, historyImport: false, aiBridge: false }, policy: { provisional: true, windowHours: 24, mailboxLimit: 30, userLimit: 300, users: 10, connectedMailboxes: 10 }, dispatchPaused: false }
const mailbox: ServerMailbox = { id: 'mbx-1', address: 'me@example.com', provider: 'fake', connected: true, sendEnabled: true, aiRead: false, aiDraft: false, aiSend: false }
const counters = { limit: 30, acceptedUsage: 0, heldReservations: 0, remaining: 30, nextAcceptedReleaseAt: null, reservationReleaseUnknown: false }
const quota: MailboxQuota = { mailboxId: 'mbx-1', policy: 'provisional_rolling_24h_recipients', windowHours: 24, mailbox: counters, user: { ...counters, limit: 300, remaining: 300 } }
const content: SendContent = { mailboxId: 'mbx-1', to: ['a@example.com'], cc: [], bcc: [], subject: 'Hello', body: 'Text' }
const refused = (code: string, status = 409) => new ApiFailure('refused', code, code, status, 'req')
const lost = () => new ApiFailure('timeout', 'The server did not answer in time.')
const expired = () => new ApiFailure('unauthorized', 'expired', 'unauthorized', 401, 'req')

function fakeServer() {
  const intents = new Map<string, { id: string; key: string; status: ServerSendStatus; content: string }>()
  const fail: Partial<Record<keyof ServerGateway, Array<{ error: Error; applied: boolean }>>> = {}
  const calls: string[] = []
  /** `applied: true` models an answer lost after the server acted. */
  const failNext = (method: keyof ServerGateway, error: Error, applied = false) => (fail[method] ??= []).push({ error, applied })
  const step = (method: keyof ServerGateway, act: () => void): void => {
    calls.push(method)
    const planned = fail[method]?.shift()
    if (!planned || planned.applied) act()
    if (planned) throw planned.error
  }
  const byId = (id: string) => {
    const found = [...intents.values()].find((i) => i.id === id)
    if (!found) throw refused('intent_not_found', 404)
    return found
  }
  const gateway: ServerGateway = {
    capabilities: async () => (step('capabilities', () => undefined), capabilities),
    listMailboxes: async () => (step('listMailboxes', () => undefined), [mailbox]),
    updateMailboxPermissions: async () => step('updateMailboxPermissions', () => undefined),
    mailboxQuota: async () => (step('mailboxQuota', () => undefined), quota),
    listMessages: async ({ cursor }) => (step('listMessages', () => undefined), { items: [{ id: cursor ? 'old' : 'new', threadId: 't', mailboxId: 'mbx-1', sender: 's@example.com', subject: 'S', at: '2026-10-05T00:00:00.000Z' }], next: cursor ? null : { before: 1, beforeId: 'new' } }),
    getMessage: async (_m, id) => (step('getMessage', () => undefined), { id, threadId: 't', mailboxId: 'mbx-1', sender: 's@example.com', subject: 'S', at: '2026-10-05T00:00:00.000Z', body: `body of ${id}` }),
    async createSendRequest(key, body) {
      step('createSendRequest', () => {
        const existing = intents.get(key)
        if (existing && existing.content !== JSON.stringify(body)) throw refused('idempotency_conflict')
        if (!existing) intents.set(key, { id: `intent-${intents.size + 1}`, key, status: 'draft', content: JSON.stringify(body) })
      })
      const saved = intents.get(key)!
      return { id: saved.id, revision: 'c'.repeat(64), status: saved.status }
    },
    async approveSendRequest(id) {
      step('approveSendRequest', () => {
        const intent = byId(id)
        if (intent.status !== 'draft') throw refused('approval_conflict')
        intent.status = 'pending'
      })
    },
    async cancelSendRequest(id) {
      step('cancelSendRequest', () => {
        const intent = byId(id)
        if (intent.status !== 'draft' && intent.status !== 'pending') throw refused('already_in_flight_or_missing')
        intent.status = 'cancelled'
      })
    },
    async getSendRequest(id) {
      let intent!: ReturnType<typeof byId>
      step('getSendRequest', () => (intent = byId(id)))
      return { id, revision: 'c'.repeat(64), status: intent.status, errorCode: intent.status === 'unknown' ? 'dispatch_interrupted' : null, correlationId: intent.status === 'unknown' ? 'corr-1' : null, approvalExpiresAt: null }
    },
  }
  return { gateway, intents, calls, failNext, set: (key: string, status: ServerSendStatus) => (intents.get(key)!.status = status) }
}

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k), key: (i) => [...map.keys()][i] ?? null, clear: () => map.clear(), get length() { return map.size } }
}

function setup(server = fakeServer(), local = memoryStorage(), session = memoryStorage()) {
  let n = 0
  const live = createLive({ gateway: server.gateway, session, local, namespace: async (token) => `ns-${token[0]}`, now: () => Date.parse('2026-10-05T10:00:00Z'), newKey: () => `key-${++n}` })
  return { live, server, local, session }
}
const record = (live: Live, key: string) => live.store.getState().sends.find((r) => r.key === key)!
async function signedIn(parts = setup()) {
  expect(await parts.live.signIn(TOKEN_A)).toEqual({ ok: true })
  return parts
}

describe('session', () => {
  it('loads capabilities and mailboxes on sign-in and keeps the token for the tab only', async () => {
    const { live, session, local } = await signedIn()
    expect(live.store.getState()).toMatchObject({ session: { status: 'ready' }, mailboxes: [mailbox], capabilities })
    expect(session.getItem('elevateo:session')).toBe(TOKEN_A)
    expect(JSON.stringify([...Array(local.length)].map((_, i) => local.getItem(local.key(i)!)))).not.toContain(TOKEN_A)
  })

  it('rejects a malformed token without contacting the server', async () => {
    const { live, server } = setup()
    expect(await live.signIn('short')).toMatchObject({ ok: false })
    expect(server.calls).toEqual([])
  })

  it('shows nothing and falls back to nothing when the server is unreachable', async () => {
    const parts = setup()
    parts.server.failNext('capabilities', new ApiFailure('network', 'The server could not be reached.'))
    expect(await parts.live.signIn(TOKEN_A)).toEqual({ ok: false, reason: 'The server could not be reached.' })
    expect(parts.live.store.getState()).toMatchObject({ session: { status: 'unavailable' }, mailboxes: [], sends: [] })
    await parts.live.retry()
    expect(parts.live.store.getState().session.status).toBe('ready')
  })

  it('reports a token the server does not accept and keeps nothing', async () => {
    const parts = setup()
    parts.server.failNext('capabilities', expired())
    expect(await parts.live.signIn(TOKEN_A)).toMatchObject({ ok: false, reason: expect.stringContaining('did not accept') })
    expect(parts.session.getItem('elevateo:session')).toBeNull()
    expect(parts.live.store.getState().session).toEqual({ status: 'signed_out', reason: 'The server did not accept that session. It may have expired or been revoked.' })
  })

  it('clears account data from memory when any request finds the session expired', async () => {
    const { live, server, session } = await signedIn()
    await live.openList('mbx-1')
    live.saveDraft(null, content)
    server.failNext('mailboxQuota', expired())
    await live.loadQuota('mbx-1')
    expect(live.store.getState()).toMatchObject({ session: { status: 'expired' }, mailboxes: [], list: null, sends: [], quotas: {} })
    expect(session.getItem('elevateo:session')).toBeNull()
    expect(live.getToken()).toBeNull()
  })

  it('clears stored drafts and requests on sign-out, and tells other tabs', async () => {
    const { live, local } = await signedIn()
    live.saveDraft(null, content)
    expect(local.getItem('elevateo:sends:ns-a')).toContain('Hello')
    live.signOut()
    expect(local.getItem('elevateo:sends:ns-a')).toBeNull()
    expect(local.getItem('elevateo:signed-out')).toMatch(/^ns-a:/)
    expect(live.store.getState()).toMatchObject({ session: { status: 'signed_out' }, sends: [], mailboxes: [] })
  })

  it('removes another account\'s stored records once a different account signs in', async () => {
    const shared = memoryStorage()
    const first = await signedIn(setup(fakeServer(), shared))
    first.live.saveDraft(null, content)
    const second = setup(fakeServer(), shared)
    expect(await second.live.signIn(TOKEN_B)).toEqual({ ok: true })
    expect(shared.getItem('elevateo:sends:ns-a')).toBeNull()
    expect(second.live.store.getState().sends).toEqual([])
  })

  it('drops a response that arrives after the account changed', async () => {
    const parts = await signedIn()
    let release!: () => void
    const original = parts.server.gateway.listMessages
    parts.server.gateway.listMessages = async (query) => {
      await new Promise<void>((resolve) => (release = resolve))
      return original(query)
    }
    const pending = parts.live.openList('mbx-1')
    parts.live.signOut()
    release()
    await pending
    expect(parts.live.store.getState().list).toBeNull()
  })

  it('lets only the later of two overlapping sign-ins proceed', async () => {
    const { live, session } = setup()
    const [first, second] = await Promise.all([live.signIn(TOKEN_A), live.signIn(TOKEN_B)])
    expect(first).toEqual({ ok: false, reason: 'Another sign-in replaced this one.' })
    expect(second).toEqual({ ok: true })
    expect(live.getToken()).toBe(TOKEN_B)
    expect(session.getItem('elevateo:session')).toBe(TOKEN_B)
  })

  it('signs out when another tab of the same account signs out, and ignores other accounts', async () => {
    const { live } = await signedIn()
    live.onStorageEvent('elevateo:signed-out', 'ns-b:1')
    expect(live.store.getState().session.status).toBe('ready')
    live.onStorageEvent('elevateo:signed-out', 'ns-a:1')
    expect(live.store.getState().session.status).toBe('signed_out')
  })
})

describe('messages', () => {
  it('holds one page at a time, opened by the cursor the caller passes', async () => {
    const { live } = await signedIn()
    await live.openList('mbx-1')
    expect(live.store.getState().list).toMatchObject({ cursor: null, page: { status: 'ready', data: { items: [{ id: 'new' }], next: { before: 1, beforeId: 'new' } } } })
    await live.openList('mbx-1', { before: 1, beforeId: 'new' })
    expect(live.store.getState().list).toMatchObject({ cursor: { before: 1, beforeId: 'new' }, page: { status: 'ready', data: { items: [{ id: 'old' }], next: null } } })
  })

  it('keeps the newest of two overlapping reads of the same page', async () => {
    const { live, server } = await signedIn()
    const answers: Array<(id: string) => void> = []
    server.gateway.listMessages = () => new Promise((resolve) => answers.push((id) => resolve({ items: [{ id, threadId: 't', mailboxId: 'mbx-1', sender: 's@example.com', subject: 'S', at: '2026-10-05T00:00:00.000Z' }], next: null })))
    const first = live.openList('mbx-1')
    const second = live.reloadPage()
    answers[1]!('fresh')
    await second
    answers[0]!('stale')
    await first
    expect(live.store.getState().list?.page).toMatchObject({ status: 'ready', data: { items: [{ id: 'fresh' }] } })
  })

  it('keeps a body that was just read again when room is needed', async () => {
    const { live, server } = await signedIn()
    for (let i = 0; i < 20; i++) await live.openBody('mbx-1', `m${i}`)
    await live.openBody('mbx-1', 'm0')
    await live.openBody('mbx-1', 'm20')
    const keys = live.store.getState().bodies.map((b) => b.key)
    expect(keys).toHaveLength(20)
    expect(keys).toContain('mbx-1/m0')
    expect(keys).not.toContain('mbx-1/m1')
    expect(server.calls.filter((c) => c === 'getMessage')).toHaveLength(21)
  })

  it('shows an error for a failed page and never sample data', async () => {
    const { live, server } = await signedIn()
    server.failNext('listMessages', new ApiFailure('unavailable', 'The server is unavailable or sent an answer that could not be read.', null, 502))
    await live.openList('mbx-1')
    expect(live.store.getState().list?.page).toEqual({ status: 'error', message: 'The server is unavailable or sent an answer that could not be read.' })
  })

  it('fetches a body only when opened, once, and keeps at most twenty', async () => {
    const { live, server } = await signedIn()
    await live.openList('mbx-1')
    expect(server.calls).not.toContain('getMessage')
    await live.openBody('mbx-1', 'm0')
    await live.openBody('mbx-1', 'm0')
    expect(server.calls.filter((c) => c === 'getMessage')).toHaveLength(1)
    for (let i = 1; i <= 25; i++) await live.openBody('mbx-1', `m${i}`)
    const bodies = live.store.getState().bodies
    expect(bodies).toHaveLength(20)
    expect(bodies.at(-1)).toMatchObject({ key: 'mbx-1/m25', body: { status: 'ready', data: { body: 'body of m25' } } })
    expect(bodies.some((b) => b.key === 'mbx-1/m0')).toBe(false)
  })

  it('retries a body that failed to load', async () => {
    const { live, server } = await signedIn()
    server.failNext('getMessage', lost())
    await live.openBody('mbx-1', 'm1')
    expect(live.store.getState().bodies[0]?.body.status).toBe('error')
    await live.openBody('mbx-1', 'm1')
    expect(live.store.getState().bodies[0]?.body.status).toBe('ready')
  })
})

describe('send lifecycle', () => {
  it('goes draft → awaiting approval → queued → accepted through separate steps', async () => {
    const { live, server } = await signedIn()
    const key = live.saveDraft(null, content)
    expect(record(live, key).status).toBe('local_draft')
    expect(server.calls).not.toContain('createSendRequest')
    await live.submit(key)
    expect(record(live, key)).toMatchObject({ status: 'draft', intentId: 'intent-1', revision: 'c'.repeat(64) })
    await live.approve(key)
    // Approval queues the request; it is not reported as sent.
    expect(record(live, key).status).toBe('pending')
    server.set(key, 'accepted')
    await live.refresh(key)
    expect(record(live, key)).toMatchObject({ status: 'accepted', checkedAt: '2026-10-05T10:00:00.000Z' })
  })

  it('contacts the server for nothing when the request cannot be stored for recovery', async () => {
    const { live, server, local } = await signedIn()
    const key = live.saveDraft(null, content)
    local.setItem = () => {
      throw new Error('storage full')
    }
    await live.submit(key)
    expect(server.calls).not.toContain('createSendRequest')
    expect(record(live, key)).toMatchObject({ status: 'local_draft', intentId: null })
    expect(record(live, key).notice).toContain('Nothing was sent')
  })

  it('edits only an unsubmitted draft', async () => {
    const { live } = await signedIn()
    const key = live.saveDraft(null, content)
    live.saveDraft(key, { ...content, subject: 'Changed' })
    expect(record(live, key).content.subject).toBe('Changed')
    await live.submit(key)
    live.saveDraft(key, { ...content, subject: 'Changed again' })
    expect(record(live, key).content.subject).toBe('Changed')
  })

  it('returns an invalid draft to editing without contacting the server', async () => {
    const { live, server } = await signedIn()
    const key = live.saveDraft(null, { ...content, to: [] })
    await live.submit(key)
    expect(record(live, key)).toMatchObject({ status: 'local_draft', notice: 'Add at least one recipient in To.' })
    expect(server.calls).not.toContain('createSendRequest')
  })

  it('recovers the same request after a lost create answer instead of making a new one', async () => {
    const { live, server } = await signedIn()
    const key = live.saveDraft(null, content)
    server.failNext('createSendRequest', lost(), true)
    await live.submit(key)
    expect(record(live, key)).toMatchObject({ status: 'unconfirmed', intentId: null })
    expect(record(live, key).notice).toContain('not known whether the server saved')
    await live.refresh(key)
    expect(record(live, key)).toMatchObject({ status: 'draft', intentId: 'intent-1', notice: null })
    expect(server.intents.size).toBe(1)
  })

  it('recovers after a reload: the stored request is re-inspected, not re-created', async () => {
    const first = await signedIn()
    const key = first.live.saveDraft(null, content)
    first.server.failNext('createSendRequest', lost(), true)
    await first.live.submit(key)
    const queued = first.live.saveDraft(null, { ...content, subject: 'Second' })
    await first.live.submit(queued)
    await first.live.approve(queued)
    first.server.set(queued, 'accepted')

    // A new page load: same browser storage, same server, fresh memory.
    const reloaded = setup(first.server, first.local, first.session)
    await reloaded.live.start()
    await vi.waitFor(() => expect(record(reloaded.live, queued).status).toBe('accepted'))
    await vi.waitFor(() => expect(record(reloaded.live, key)).toMatchObject({ status: 'draft', intentId: 'intent-1' }))
    expect(first.server.intents.size).toBe(2)
  })

  it('keeps a request awaiting approval when the server refuses it for quota', async () => {
    const { live, server } = await signedIn()
    const key = live.saveDraft(null, content)
    await live.submit(key)
    server.failNext('approveSendRequest', refused('quota_exceeded'))
    await live.approve(key)
    expect(record(live, key)).toMatchObject({ status: 'draft', notice: 'quota_exceeded' })
  })

  it('inspects rather than re-approving after a lost approval answer', async () => {
    const { live, server } = await signedIn()
    const key = live.saveDraft(null, content)
    await live.submit(key)
    server.failNext('approveSendRequest', lost(), true)
    await live.approve(key)
    expect(record(live, key)).toMatchObject({ status: 'pending', notice: null })
    expect(server.calls.filter((c) => c === 'approveSendRequest')).toHaveLength(1)
  })

  it('says the approval is unconfirmed when neither the answer nor the status can be read', async () => {
    const { live, server } = await signedIn()
    const key = live.saveDraft(null, content)
    await live.submit(key)
    server.failNext('approveSendRequest', lost(), true)
    server.failNext('getSendRequest', lost())
    await live.approve(key)
    expect(record(live, key).status).toBe('draft')
    expect(record(live, key).notice).toContain('not known whether the approval was recorded')
    await live.refresh(key)
    expect(record(live, key)).toMatchObject({ status: 'pending', notice: null })
  })

  it('reflects an approval made in another tab instead of reporting a conflict', async () => {
    const { live, server } = await signedIn()
    const key = live.saveDraft(null, content)
    await live.submit(key)
    server.set(key, 'pending')
    await live.approve(key)
    expect(record(live, key)).toMatchObject({ status: 'pending', notice: null })
  })

  it('cancels before dispatch and reports when it is too late', async () => {
    const { live, server } = await signedIn()
    const key = live.saveDraft(null, content)
    await live.submit(key)
    await live.approve(key)
    await live.cancel(key)
    expect(record(live, key).status).toBe('cancelled')

    const late = live.saveDraft(null, { ...content, subject: 'Late' })
    await live.submit(late)
    await live.approve(late)
    server.set(late, 'dispatching')
    await live.cancel(late)
    expect(record(live, late)).toMatchObject({ status: 'dispatching', notice: 'already_in_flight_or_missing' })
  })

  it('makes an editable copy only after the original is cancelled, so a new approval is required', async () => {
    const { live, server } = await signedIn()
    const key = live.saveDraft(null, content)
    await live.submit(key)
    await live.approve(key)
    const copy = await live.editAsNew(key)
    expect(copy).not.toBe(key)
    expect(record(live, key).status).toBe('cancelled')
    expect(record(live, copy)).toMatchObject({ status: 'local_draft', intentId: null, revision: null, content })
    expect(server.intents.size).toBe(1)
  })

  it('refuses to copy for editing when the original can no longer be cancelled', async () => {
    const { live, server } = await signedIn()
    const key = live.saveDraft(null, content)
    await live.submit(key)
    await live.approve(key)
    server.set(key, 'dispatching')
    await expect(live.editAsNew(key)).rejects.toThrow('already_in_flight_or_missing')
    expect(live.store.getState().sends).toHaveLength(1)
  })

  it('records an unknown outcome with its diagnostic reference and offers no re-send path', async () => {
    const { live, server } = await signedIn()
    const key = live.saveDraft(null, content)
    await live.submit(key)
    await live.approve(key)
    server.set(key, 'unknown')
    await live.refresh(key)
    expect(record(live, key)).toMatchObject({ status: 'unknown', errorCode: 'dispatch_interrupted', correlationId: 'corr-1' })
    await live.approve(key)
    await live.submit(key)
    await expect(live.editAsNew(key)).rejects.toThrow('can no longer be changed')
    expect(server.calls.filter((c) => c === 'createSendRequest' || c === 'approveSendRequest')).toHaveLength(2)
  })

  it('re-reads capacity from the server when a request changes state', async () => {
    const { live, server } = await signedIn()
    const key = live.saveDraft(null, content)
    await live.submit(key)
    await live.loadQuota('mbx-1')
    const before = server.calls.filter((c) => c === 'mailboxQuota').length
    await live.approve(key)
    await vi.waitFor(() => expect(server.calls.filter((c) => c === 'mailboxQuota').length).toBeGreaterThan(before))
  })

  it('reports capacity as unreadable rather than showing an old figure', async () => {
    const { live, server } = await signedIn()
    await live.loadQuota('mbx-1')
    expect(live.store.getState().quotas['mbx-1']).toEqual({ status: 'ready', data: quota })
    server.failNext('mailboxQuota', lost())
    await live.loadQuota('mbx-1')
    expect(live.store.getState().quotas['mbx-1']).toEqual({ status: 'error', message: 'The server did not answer in time.' })
  })

  it('picks up a change another tab stored', async () => {
    const shared = memoryStorage()
    const session = memoryStorage()
    const server = fakeServer()
    const a = await signedIn(setup(server, shared, session))
    const b = await signedIn(setup(server, shared, session))
    const key = a.live.saveDraft(null, content)
    await a.live.submit(key)
    b.live.onStorageEvent('elevateo:sends:ns-a', shared.getItem('elevateo:sends:ns-a'))
    expect(record(b.live, key).status).toBe('draft')
    await b.live.approve(key)
    a.live.onStorageEvent('elevateo:sends:ns-a', shared.getItem('elevateo:sends:ns-a'))
    expect(record(a.live, key).status).toBe('pending')
    // The first tab does not approve again.
    await a.live.approve(key)
    expect(server.calls.filter((c) => c === 'approveSendRequest')).toHaveLength(1)
  })

  it('always re-reads the mailbox list after a permission change, even a failed one', async () => {
    const { live, server } = await signedIn()
    server.failNext('updateMailboxPermissions', refused('mailbox_limit'))
    await expect(live.setPermissions('mbx-1', { connected: true, sendEnabled: true, aiRead: false, aiDraft: false, aiSend: false })).rejects.toThrow('mailbox_limit')
    expect(server.calls.filter((c) => c === 'listMailboxes')).toHaveLength(2)
  })
})

describe('bounded status checks', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  async function queued() {
    const parts = await signedIn()
    const key = parts.live.saveDraft(null, content)
    await parts.live.submit(key)
    await parts.live.approve(key)
    const checks = () => parts.server.calls.filter((c) => c === 'getSendRequest').length
    return { ...parts, key, checks }
  }

  it('checks only while watched, and stops when the view closes', async () => {
    const { live, key, checks } = await queued()
    const base = checks()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(checks()).toBe(base)
    const stop = live.watch(key)
    await vi.advanceTimersByTimeAsync(1_500)
    expect(checks()).toBe(base + 1)
    stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(checks()).toBe(base + 1)
  })

  it('stops as soon as the outcome is settled', async () => {
    const { live, server, key, checks } = await queued()
    live.watch(key)
    server.set(key, 'accepted')
    await vi.advanceTimersByTimeAsync(1_500)
    const after = checks()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(checks()).toBe(after)
    expect(record(live, key).status).toBe('accepted')
  })

  it('does not keep checking an unknown outcome automatically', async () => {
    const { live, server, key, checks } = await queued()
    live.watch(key)
    server.set(key, 'unknown')
    await vi.advanceTimersByTimeAsync(1_500)
    const after = checks()
    await vi.advanceTimersByTimeAsync(600_000)
    expect(checks()).toBe(after)
  })

  it('cancels a check already scheduled when a manual check finds the outcome unknown', async () => {
    const { live, server, key, checks } = await queued()
    live.watch(key)
    server.set(key, 'unknown')
    await live.refresh(key)
    const after = checks()
    await vi.advanceTimersByTimeAsync(600_000)
    expect(checks()).toBe(after)
  })

  it('does not grant a fresh allowance when a second view starts watching', async () => {
    const { live, key, checks } = await queued()
    const base = checks()
    live.watch(key)
    await vi.advanceTimersByTimeAsync(3_600_000)
    live.watch(key)
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(checks() - base).toBe(30)
  })

  it('gives up after the allowed number of checks and says so', async () => {
    const { live, key, checks } = await queued()
    const base = checks()
    live.watch(key)
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(checks() - base).toBe(30)
    expect(live.store.getState().stalled).toEqual([key])
  })

  it('starts checking a watched request once it becomes queued', async () => {
    const { live, server } = await signedIn()
    const key = live.saveDraft(null, content)
    await live.submit(key)
    live.watch(key)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(server.calls).not.toContain('getSendRequest')
    await live.approve(key)
    const base = server.calls.filter((c) => c === 'getSendRequest').length
    await vi.advanceTimersByTimeAsync(1_500)
    expect(server.calls.filter((c) => c === 'getSendRequest').length).toBe(base + 1)
  })
})
