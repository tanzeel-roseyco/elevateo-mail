import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeServerError, MAX_POLL_ATTEMPTS, type SendContent, type ServerSendStatus } from '@/domain/sendLifecycle'
import type { Capabilities, MailboxQuota, SendSummary, ServerMailbox } from './contract'
import { ApiFailure } from './httpClient'
import { createLive, type Live } from './live'
import type { FixtureUser, ServerGateway } from './ports'

// A stand-in for the server boundary only. It owns accounts, a cookie-like current session and send requests the way
// the real server does (idempotency keys, one successor per replaced request), and each test can make the next call
// fail to exercise lost answers, refusals and expiry.

const ACCOUNT: Record<FixtureUser, string> = { alice: 'a'.repeat(32), bob: 'b'.repeat(32) }
const capabilities: Capabilities = { version: 1, simulated: true, liveSending: false, dnsWrites: false, features: { mailboxInventory: true, messages: true, manualSend: true, campaignWizard: false, inboxSync: false, historyImport: false, aiBridge: false }, policy: { provisional: true, windowHours: 24, mailboxLimit: 30, userLimit: 300, users: 10, connectedMailboxes: 10 }, dispatchPaused: false }
const mailbox: ServerMailbox = { id: 'mbx-1', address: 'me@example.com', provider: 'fake', connected: true, sendEnabled: true, aiRead: false, aiDraft: false, aiSend: false }
const counters = { limit: 30, acceptedUsage: 0, heldReservations: 0, remaining: 30, nextAcceptedReleaseAt: null, reservationReleaseUnknown: false }
const quota: MailboxQuota = { mailboxId: 'mbx-1', policy: 'provisional_rolling_24h_recipients', windowHours: 24, mailbox: counters, user: { ...counters, limit: 300, remaining: 300 } }
const content: SendContent = { mailboxId: 'mbx-1', to: ['a@example.com'], cc: [], bcc: [], subject: 'Hello', body: 'Text' }
const refused = (code: string, status = 409) => new ApiFailure('refused', describeServerError(code), code, status, 'req')
const lost = () => new ApiFailure('timeout', 'The server did not answer in time.')
const expired = () => new ApiFailure('unauthorized', 'expired', 'unauthorized', 401, 'req')
const T0 = Date.parse('2026-10-05T00:00:00.000Z')

interface Intent {
  owner: FixtureUser
  id: string
  key: string
  status: ServerSendStatus
  content: SendContent
  createdAt: number
  successorId: string | null
}

function fakeServer() {
  const intents: Intent[] = []
  /** Who the browser's cookie belongs to. Shared by every tab, exactly like a cookie. */
  const cookie: { user: FixtureUser | null } = { user: null }
  const fail: Partial<Record<keyof ServerGateway, Array<{ error: Error; applied: boolean }>>> = {}
  const calls: string[] = []
  let clock = T0
  /** `applied: true` models an answer lost after the server acted. */
  const failNext = (method: keyof ServerGateway, error: Error, applied = false) => (fail[method] ??= []).push({ error, applied })
  const owner = (): FixtureUser => {
    if (!cookie.user) throw expired()
    return cookie.user
  }
  const step = <T>(method: keyof ServerGateway, act: () => T): T => {
    calls.push(method)
    const user = owner()
    void user
    const planned = fail[method]?.shift()
    const result = !planned || planned.applied ? act() : undefined
    if (planned) throw planned.error
    return result as T
  }
  const mine = () => intents.filter((i) => i.owner === owner())
  const byId = (id: string): Intent => {
    const found = mine().find((i) => i.id === id)
    if (!found) throw refused('intent_not_found', 404)
    return found
  }
  const summary = (i: Intent): SendSummary => ({ id: i.id, mailboxId: i.content.mailboxId, idempotencyKey: i.key, revision: revisionOf(i), status: i.status, createdAt: new Date(i.createdAt).toISOString(), successorId: i.successorId })
  const revisionOf = (i: Intent): string => i.id.replace(/\D/g, '').padStart(64, 'c')
  const insert = (key: string, body: SendContent, status: ServerSendStatus = 'draft'): Intent => {
    const intent: Intent = { owner: owner(), id: `intent-${intents.length + 1}`, key, status, content: body, createdAt: clock++, successorId: null }
    intents.push(intent)
    return intent
  }
  const gateway: ServerGateway = {
    me: async () => step('me', () => ({ accountId: ACCOUNT[owner()], sessionExpiresAt: '2026-10-05T01:00:00.000Z' })),
    logout: async () => step('logout', () => void (cookie.user = null)),
    capabilities: async () => step('capabilities', () => capabilities),
    listMailboxes: async () => step('listMailboxes', () => [mailbox]),
    listMailboxHistory: async () => step('listMailboxHistory', () => ({ items: [], next: null })),
    getMailbox: async (id) => step('getMailbox', () => id === mailbox.id ? mailbox : null),
    updateMailboxPermissions: async () => step('updateMailboxPermissions', () => undefined),
    mailboxQuota: async () => step('mailboxQuota', () => quota),
    listMessages: async ({ cursor }) => step('listMessages', () => ({ items: [{ id: cursor ? 'old' : 'new', threadId: 't', mailboxId: 'mbx-1', sender: 's@example.com', subject: `For ${owner()}`, at: '2026-10-05T00:00:00.000Z' }], next: cursor ? null : { before: 1, beforeId: 'new' } })),
    getMessage: async (_m, id) => step('getMessage', () => ({ id, threadId: 't', mailboxId: 'mbx-1', sender: 's@example.com', subject: 'S', at: '2026-10-05T00:00:00.000Z', body: `body of ${id}` })),
    lookupSendRequest: async (key) => step('lookupSendRequest', () => {
      const found = mine().find((intent) => intent.key === key)
      return found ? summary(found) : null
    }),
    listSendRequests: async (cursor, limit) =>
      step('listSendRequests', () => {
        const sorted = mine().sort((x, y) => y.createdAt - x.createdAt)
        // Both cursor parts are needed to find the place, as on the real server.
        const from = cursor ? sorted.findIndex((i) => i.createdAt === cursor.before && i.id === cursor.beforeId) + 1 : 0
        if (cursor && from === 0) throw refused('validation_failed', 400)
        const items = sorted.slice(from, from + limit)
        const last = items.at(-1)
        return { items: items.map(summary), next: from + limit < sorted.length && last ? { before: last.createdAt, beforeId: last.id } : null }
      }),
    getSendContent: async (id) =>
      step('getSendContent', () => {
        const i = byId(id)
        return { summary: summary(i), from: mailbox.address, to: i.content.to, cc: i.content.cc, bcc: i.content.bcc, subject: i.content.subject, body: i.content.body, replyToMessageId: i.content.replyToMessageId, kind: 'manual' as const }
      }),
    createSendRequest: async (key, body) =>
      step('createSendRequest', () => {
        const existing = mine().find((i) => i.key === key)
        if (existing && JSON.stringify(existing.content) !== JSON.stringify(body)) throw refused('idempotency_conflict')
        const saved = existing ?? insert(key, body)
        return { id: saved.id, revision: revisionOf(saved), status: saved.status }
      }),
    replaceSendRequest: async (id, revision, key, body) =>
      step('replaceSendRequest', () => {
        const old = byId(id)
        if (revision !== revisionOf(old)) throw refused('approval_conflict')
        if (old.successorId) {
          const successor = byId(old.successorId)
          if (JSON.stringify(successor.content) !== JSON.stringify(body) || successor.key !== key) throw refused('replacement_conflict')
          return { predecessorId: id, id: successor.id, revision: revisionOf(successor), status: successor.status }
        }
        if (!['draft', 'pending', 'rejected', 'cancelled'].includes(old.status)) throw refused('replacement_unavailable')
        const successor = insert(key, body)
        old.status = 'cancelled'
        old.successorId = successor.id
        return { predecessorId: id, id: successor.id, revision: revisionOf(successor), status: successor.status }
      }),
    approveSendRequest: async (id, revision) =>
      step('approveSendRequest', () => {
        const intent = byId(id)
        if (intent.status !== 'draft' || revision !== revisionOf(intent)) throw refused('approval_conflict')
        intent.status = 'pending'
      }),
    cancelSendRequest: async (id) =>
      step('cancelSendRequest', () => {
        const intent = byId(id)
        if (intent.status !== 'draft' && intent.status !== 'pending') throw refused('cancel_unavailable')
        intent.status = 'cancelled'
      }),
    getSendRequest: async (id) =>
      step('getSendRequest', () => {
        const i = byId(id)
        return { id, revision: revisionOf(i), status: i.status, scheduledAt: '2026-10-05T00:00:00.000Z', dispatchAt: null, providerId: null, errorCode: i.status === 'rejected' ? 'provider_rejected' : null, correlationId: i.status === 'unknown' ? 'corr-1' : null, approvalExpiresAt: null }
      }),
  }
  return { gateway, intents, cookie, calls, failNext, insert, count: (method: keyof ServerGateway) => calls.filter((c) => c === method).length }
}

function memoryStorage() {
  const data = new Map<string, string>()
  let full = false
  return {
    data,
    refuseWrites: (on: boolean) => (full = on),
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (full) throw new Error('QuotaExceededError')
      data.set(key, value)
    },
    removeItem: (key: string) => void data.delete(key),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size
    },
  }
}

type Server = ReturnType<typeof fakeServer>
type Store = ReturnType<typeof memoryStorage>
function tab(server: Server, local: Store, session = memoryStorage(), fixture = true): Live {
  let n = 0
  const id = Math.random().toString(36).slice(2, 8)
  return createLive({
    gateway: server.gateway,
    fixture: fixture ? { provision: async (user) => void (server.cookie.user = user) } : null,
    session,
    local,
    now: () => T0 + 5_000,
    newKey: () => `key-${id}-${++n}`,
  })
}
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}
const stored = (local: Store): string => JSON.stringify([...local.data.entries()])

let server: Server
let local: Store
let live: Live
const state = () => live.store.getState()
const detail = (id: string) => state().details.find((d) => d.id === id)
async function signedIn(user: FixtureUser = 'alice'): Promise<void> {
  await live.fixtureSignIn(user)
  await flush()
  expect(state().session.status).toBe('ready')
}
async function saved(body: SendContent = content): Promise<string> {
  const result = await live.submit(body)
  if (result.outcome !== 'saved') throw new Error(`expected saved, got ${result.outcome}`)
  await live.openRequest(result.id)
  return result.id
}

beforeEach(() => {
  server = fakeServer()
  local = memoryStorage()
  live = tab(server, local)
})
afterEach(() => vi.useRealTimers())

describe('AI draft submission shares durable recovery', () => {
  it('refuses an unavailable AI adapter without falling back to manual creation', async () => {
    await signedIn()
    expect((await live.submitAi(content)).outcome).toBe('refused')
    expect(server.count('createSendRequest')).toBe(0)
  })
  it('persists before AI creation and retries only the identical AI key after a lost answer', async () => {
    await signedIn()
    const ai = vi.fn(async (key: string, draft: SendContent) => {
      expect(stored(local)).toContain(key)
      return server.gateway.createSendRequest(key, draft)
    })
    server.gateway.createAiDraft = ai
    server.failNext('createSendRequest', lost(), true)
    const result = await live.submitAi(content)
    expect(result.outcome).toBe('unconfirmed')
    if (result.outcome !== 'unconfirmed') throw new Error('Expected recovery key')
    expect(await live.resolvePending(result.key)).toBeTruthy()
    expect(ai).toHaveBeenCalledTimes(2)
    expect(ai.mock.calls[0]).toEqual(ai.mock.calls[1])
    expect(server.intents).toHaveLength(1)
  })
  it('does not create an AI draft when key storage fails', async () => {
    await signedIn()
    server.gateway.createAiDraft = vi.fn()
    local.refuseWrites(true)
    expect((await live.submitAi(content)).outcome).toBe('refused')
    expect(server.gateway.createAiDraft).not.toHaveBeenCalled()
  })
})

describe('session', () => {
  it('starts signed out when the server knows no session, and holds nothing', async () => {
    await live.start()
    expect(state().session).toEqual({ status: 'signed_out' })
    expect(state().mailboxes).toEqual([])
  })

  it('removes the token an earlier version kept in tab storage and never writes one', async () => {
    const session = memoryStorage()
    session.data.set('elevateo:session', 't'.repeat(48))
    live = tab(server, local, session)
    await live.start()
    await signedIn()
    expect(session.data.size).toBe(0)
    expect(stored(local)).not.toMatch(/token|bearer/i)
  })

  it('loads the account behind the cookie without any token passing through the page', async () => {
    server.cookie.user = 'alice'
    await live.start()
    expect(state()).toMatchObject({ session: { status: 'ready' }, accountId: ACCOUNT.alice, mailboxes: [mailbox] })
  })

  it('offers no fixture sign-in in a build without the fixture', async () => {
    live = tab(server, local, memoryStorage(), false)
    expect(live.canFixtureSignIn).toBe(false)
    await live.fixtureSignIn('alice')
    expect(server.cookie.user).toBeNull()
  })

  it('reports a server that cannot be reached as unavailable, not as signed out', async () => {
    server.cookie.user = 'alice'
    server.failNext('me', new ApiFailure('network', 'The server could not be reached.'))
    await live.start()
    expect(state().session).toEqual({ status: 'unavailable', message: 'The server could not be reached.' })
    await live.retry()
    expect(state().session.status).toBe('ready')
  })

  it('signs out on the server and clears everything held for the account', async () => {
    await signedIn()
    await live.openList('mbx-1')
    const id = await saved()
    await live.signOut()
    expect(server.cookie.user).toBeNull()
    expect(state()).toMatchObject({ session: { status: 'signed_out' }, accountId: null, mailboxes: [], list: null, details: [], requests: null, pending: [] })
    expect(detail(id)).toBeUndefined()
  })

  it('stays signed in, and says so, when the server could not be told to sign out', async () => {
    await signedIn()
    server.failNext('logout', lost())
    await expect(live.signOut()).rejects.toThrow('did not answer')
    expect(state().session.status).toBe('ready')
    expect(server.cookie.user).toBe('alice')
  })

  it('drops everything when the session expires mid-use', async () => {
    await signedIn()
    await live.openList('mbx-1')
    const id = await saved()
    server.cookie.user = null
    await live.refresh(id).catch(() => undefined)
    expect(state()).toMatchObject({ session: { status: 'expired' }, accountId: null, mailboxes: [], list: null, details: [] })
  })

  it('ignores an answer that arrives after the account changed', async () => {
    await signedIn()
    let release: (() => void) | undefined
    const original = server.gateway.listMessages
    server.gateway.listMessages = async (query) => {
      const answer = await original(query)
      await new Promise<void>((resolve) => (release = resolve))
      return answer
    }
    const slow = live.openList('mbx-1')
    await flush()
    server.gateway.listMessages = original
    await live.fixtureSignIn('bob')
    release?.()
    await slow
    expect(state().accountId).toBe(ACCOUNT.bob)
    expect(state().list).toBeNull()
  })
})

describe('account change in another tab', () => {
  it('drops the first account from memory when another tab signs in as someone else', async () => {
    await signedIn('alice')
    await live.openList('mbx-1')
    const id = await saved()
    const other = tab(server, local)
    await other.fixtureSignIn('bob')
    live.onStorageEvent('elevateo:account')
    await flush()
    expect(state().accountId).toBe(ACCOUNT.bob)
    expect(state().list).toBeNull()
    expect(detail(id)).toBeUndefined()
  })

  it('shows the session as ended when another tab signs out', async () => {
    await signedIn()
    const other = tab(server, local)
    server.cookie.user = 'alice'
    await other.start()
    await other.signOut()
    live.onStorageEvent('elevateo:account')
    await flush()
    expect(state()).toMatchObject({ session: { status: 'expired' }, accountId: null, mailboxes: [] })
  })

  it('re-checks whose session it is when asked, and keeps state when nothing changed', async () => {
    await signedIn()
    await live.openList('mbx-1')
    await live.recheckSession()
    expect(state().list).not.toBeNull()
    server.cookie.user = 'bob'
    await live.recheckSession()
    await flush()
    expect(state().accountId).toBe(ACCOUNT.bob)
    expect(state().list).toBeNull()
  })

  it('keeps each account\'s unanswered submissions apart', async () => {
    await signedIn('alice')
    server.failNext('createSendRequest', lost())
    await live.submit(content)
    expect(state().pending).toHaveLength(1)
    await live.fixtureSignIn('bob')
    await flush()
    expect(state().pending).toEqual([])
    await live.fixtureSignIn('alice')
    await flush()
    // Nothing was saved, and after the sign-in the exact lookup says so.
    expect(state().pending).toMatchObject([{ state: 'missing' }])
  })
})

describe('submitting', () => {
  it('saves a request on the server and keeps no content in browser storage', async () => {
    await signedIn()
    const result = await live.submit({ ...content, to: ['secret.person@example.com'], subject: 'Secret subject', body: 'Secret body' })
    expect(result).toMatchObject({ outcome: 'saved', converged: false })
    expect(server.intents).toHaveLength(1)
    expect(state().pending).toEqual([])
    expect(stored(local)).not.toMatch(/secret|Secret|example\.com/)
  })

  it('stores the key before the request leaves, and nothing but the key', async () => {
    await signedIn()
    let during = ''
    const original = server.gateway.createSendRequest
    server.gateway.createSendRequest = async (key, body) => {
      during = stored(local)
      return original(key, body)
    }
    await live.submit({ ...content, subject: 'Secret subject' })
    expect(during).toContain(`elevateo:pending:${ACCOUNT.alice}:key-`)
    expect(during).not.toMatch(/Secret|example\.com/)
  })

  it('sends nothing when the browser cannot store the key', async () => {
    await signedIn()
    local.refuseWrites(true)
    const result = await live.submit(content)
    expect(result).toMatchObject({ outcome: 'refused' })
    expect(server.count('createSendRequest')).toBe(0)
  })

  it('refuses content that fails the checks without calling the server', async () => {
    await signedIn()
    expect(await live.submit({ ...content, to: [] })).toMatchObject({ outcome: 'refused' })
    expect(server.count('createSendRequest')).toBe(0)
  })

  it('reports a coded refusal as refused and keeps no pending key', async () => {
    await signedIn()
    server.failNext('createSendRequest', refused('mailbox_permission', 403))
    expect(await live.submit(content)).toMatchObject({ outcome: 'refused' })
    expect(state().pending).toEqual([])
    expect(server.intents).toHaveLength(0)
  })

  it('recovers a lost answer in the same tab by repeating the same key, creating one request', async () => {
    await signedIn()
    server.failNext('createSendRequest', lost(), true)
    const result = await live.submit(content)
    expect(result.outcome).toBe('unconfirmed')
    expect(state().pending).toMatchObject([{ state: 'waiting' }])
    const key = state().pending[0]!.key
    const id = await live.resolvePending(key)
    expect(id).toBe(server.intents[0]!.id)
    expect(server.intents).toHaveLength(1)
    expect(state().pending).toEqual([])
  })

  it('recovers a lost answer after a reload from the exact lookup, without the content', async () => {
    await signedIn()
    server.failNext('createSendRequest', lost(), true)
    await live.submit(content)
    const key = state().pending[0]!.key
    // A reload: a new page with the same browser storage and cookie.
    live = tab(server, local)
    await live.start()
    await flush()
    expect(state().pending).toEqual([])
    expect(server.intents).toHaveLength(1)
    expect(server.intents[0]!.key).toBe(key)
    expect(server.count('createSendRequest')).toBe(1)
  })

  it('reports a submission the server never saved as missing, and forgets it only when told', async () => {
    await signedIn()
    server.failNext('createSendRequest', lost())
    await live.submit(content)
    const key = state().pending[0]!.key
    live = tab(server, local)
    await live.start()
    await flush()
    expect(state().pending).toMatchObject([{ key, state: 'missing' }])
    expect(local.data.size).toBeGreaterThan(0)
    live.dismissPending(key)
    expect(state().pending).toEqual([])
    expect([...local.data.keys()].filter((k) => k.startsWith('elevateo:pending:'))).toEqual([])
  })

  it('does not forget a submission whose fate is still unknown', async () => {
    await signedIn()
    server.failNext('createSendRequest', lost())
    await live.submit(content)
    const key = state().pending[0]!.key
    live.dismissPending(key)
    expect(state().pending).toHaveLength(1)
  })

  it('keeps a submission pending when the server cannot be asked', async () => {
    await signedIn()
    server.failNext('createSendRequest', lost(), true)
    await live.submit(content)
    const key = state().pending[0]!.key
    live = tab(server, local)
    server.failNext('lookupSendRequest', lost())
    await live.start()
    await flush()
    expect(state().pending).toMatchObject([{ key, state: 'waiting' }])
    expect(state().pending[0]!.notice).toContain('could not be checked')
  })

  it('finds a lost submission behind more than a hundred newer requests', async () => {
    await signedIn()
    server.failNext('createSendRequest', lost(), true)
    await live.submit(content)
    for (let i = 0; i < 130; i++) server.insert(`filler-${i}`, content)
    live = tab(server, local)
    await live.start()
    await flush()
    await flush()
    expect(state().pending).toEqual([])
    expect(server.count('createSendRequest')).toBe(1)
  })

  it('refuses a new submission at the limit instead of dropping an unresolved one', async () => {
    await signedIn()
    for (let i = 0; i < 20; i++) {
      server.failNext('createSendRequest', lost())
      await live.submit(content)
    }
    expect(state().pending).toHaveLength(20)
    const before = server.count('createSendRequest')
    const result = await live.submit(content)
    expect(result).toMatchObject({ outcome: 'refused' })
    expect(server.count('createSendRequest')).toBe(before)
    expect(state().pending).toHaveLength(20)
  })

  it('keeps both submissions when two tabs each start one at the same moment', async () => {
    await signedIn()
    const other = tab(server, local)
    await other.start()
    server.failNext('createSendRequest', lost())
    server.failNext('createSendRequest', lost())
    await Promise.all([live.submit(content), other.submit({ ...content, subject: 'Other' })])
    expect([...local.data.keys()].filter((k) => k.startsWith('elevateo:pending:'))).toHaveLength(2)
    live.onStorageEvent([...local.data.keys()].find((k) => k.startsWith('elevateo:pending:'))!)
    expect(state().pending).toHaveLength(2)
  })
})

describe('answers that arrive out of order or under the wrong account', () => {
  it('never pairs one account\'s id with another account\'s data when the cookie changes during loading', async () => {
    server.cookie.user = 'alice'
    const original = server.gateway.listMailboxes
    server.gateway.listMailboxes = async () => {
      server.gateway.listMailboxes = original
      // Another tab replaces the cookie after this page has already been told it is alice.
      server.cookie.user = 'bob'
      return original()
    }
    await live.start()
    expect(state()).toMatchObject({ session: { status: 'ready' }, accountId: ACCOUNT.bob })
    expect(server.count('me')).toBe(4)
  })

  it('drops what it holds the moment another tab reports a different account, before asking the server', async () => {
    await signedIn('alice')
    await live.openList('mbx-1')
    local.data.set('elevateo:account', 'changing:1:x')
    live.onStorageEvent('elevateo:account')
    expect(state()).toMatchObject({ session: { status: 'loading' }, accountId: null, list: null, mailboxes: [] })
    await flush()
    expect(state().accountId).toBe(ACCOUNT.alice)
  })

  it('does not let an older read of a request overwrite a newer state', async () => {
    await signedIn()
    const id = await saved()
    live = tab(server, local)
    await live.start()
    let release: (() => void) | undefined
    const original = server.gateway.getSendContent
    server.gateway.getSendContent = async (intentId) => {
      const answer = await original(intentId)
      await new Promise<void>((resolve) => (release = resolve))
      return answer
    }
    const opening = live.openRequest(id)
    await flush()
    server.intents[0]!.status = 'pending'
    await live.refresh(id)
    release?.()
    await opening
    expect(detail(id)).toMatchObject({ status: 'pending', saved: { status: 'ready' } })
  })

  it('recovers behind hundreds of newer requests with one exact lookup', async () => {
    await signedIn()
    server.failNext('createSendRequest', lost(), true)
    await live.submit(content)
    const key = state().pending[0]!.key
    for (let i = 0; i < 620; i++) server.insert(`filler-${i}`, content)
    live = tab(server, local)
    await live.start()
    for (let i = 0; i < 10; i++) await flush()
    expect(server.intents[0]!.key).toBe(key)
    expect(server.count('lookupSendRequest')).toBe(1)
    expect(server.count('listSendRequests')).toBe(0)
    expect(state().pending).toEqual([])
    expect(server.count('createSendRequest')).toBe(1)
  })

  it('keeps the recovery key when a replacement made elsewhere cannot be read yet', async () => {
    await signedIn()
    const id = await saved()
    const other = tab(server, local)
    await other.start()
    await other.openRequest(id)
    const target = { id, revision: detail(id)!.revision! }
    await live.submit({ ...content, subject: 'Winner' }, target)
    server.failNext('getSendContent', lost())
    const result = await other.submit({ ...content, subject: 'Loser' }, target)
    expect(result.outcome).toBe('unconfirmed')
    const key = other.store.getState().pending[0]!.key
    expect(await other.resolvePending(key)).toBe(server.intents[1]!.id)
    expect(other.store.getState().pending).toEqual([])
    expect(server.intents).toHaveLength(2)
  })
})

describe('replacing a request', () => {
  it('cancels the old request and saves one successor that still needs approval', async () => {
    await signedIn()
    const id = await saved()
    const result = await live.submit({ ...content, subject: 'Edited' }, { id, revision: detail(id)!.revision! })
    expect(result).toMatchObject({ outcome: 'saved', converged: false })
    expect(server.intents.map((i) => i.status)).toEqual(['cancelled', 'draft'])
    expect(detail(id)).toMatchObject({ status: 'cancelled', successorId: server.intents[1]!.id })
    expect(server.count('approveSendRequest')).toBe(0)
  })

  it('converges two tabs replacing the same request on one successor', async () => {
    await signedIn()
    const id = await saved()
    const other = tab(server, local)
    await other.start()
    await other.openRequest(id)
    const target = { id, revision: detail(id)!.revision! }
    const [first, second] = await Promise.all([live.submit({ ...content, subject: 'From tab one' }, target), other.submit({ ...content, subject: 'From tab two' }, target)])
    expect(first).toMatchObject({ outcome: 'saved', converged: false })
    expect(second).toMatchObject({ outcome: 'saved', converged: true })
    expect(second.outcome === 'saved' && first.outcome === 'saved' && second.id === first.id).toBe(true)
    expect(server.intents).toHaveLength(2)
    expect(server.intents[1]!.content.subject).toBe('From tab one')
    // The browser tells the other tab that the first tab's key is gone; it then holds none.
    other.onStorageEvent(`elevateo:pending:${ACCOUNT.alice}:any`)
    expect(other.store.getState().pending).toEqual([])
  })

  it('recovers a lost replacement answer by repeating the identical replacement', async () => {
    await signedIn()
    const id = await saved()
    server.failNext('replaceSendRequest', lost(), true)
    const result = await live.submit({ ...content, subject: 'Edited' }, { id, revision: detail(id)!.revision! })
    expect(result.outcome).toBe('unconfirmed')
    const successor = await live.resolvePending(state().pending[0]!.key)
    expect(successor).toBe(server.intents[1]!.id)
    expect(server.intents).toHaveLength(2)
  })

  it('reports a request that can no longer be replaced, changing nothing', async () => {
    await signedIn()
    const id = await saved()
    server.intents[0]!.status = 'accepted'
    const result = await live.submit({ ...content, subject: 'Edited' }, { id, revision: detail(id)!.revision! })
    expect(result).toMatchObject({ outcome: 'refused' })
    expect(server.intents).toHaveLength(1)
    expect(state().pending).toEqual([])
  })
})

describe('approval, cancellation and status', () => {
  it('loads saved content from the server when a request is opened', async () => {
    await signedIn()
    const id = await saved({ ...content, subject: 'Saved subject' })
    expect(detail(id)).toMatchObject({ status: 'draft', saved: { status: 'ready', data: { subject: 'Saved subject', to: ['a@example.com'] } } })
  })

  it('reports content that could not be loaded', async () => {
    await signedIn()
    server.failNext('getSendContent', refused('intent_not_found', 404))
    await live.openRequest('intent-9')
    expect(detail('intent-9')?.saved.status).toBe('error')
  })

  it('approves the saved version once', async () => {
    await signedIn()
    const id = await saved()
    await live.approve(id)
    expect(detail(id)?.status).toBe('pending')
    await live.approve(id)
    expect(server.count('approveSendRequest')).toBe(1)
  })

  it('reads the state back, and does not approve again, when the approval answer is lost', async () => {
    await signedIn()
    const id = await saved()
    server.failNext('approveSendRequest', lost(), true)
    await live.approve(id)
    expect(detail(id)).toMatchObject({ status: 'pending', notice: null })
    expect(server.count('approveSendRequest')).toBe(1)
  })

  it('says the approval is unconfirmed when neither it nor the check got an answer', async () => {
    await signedIn()
    const id = await saved()
    server.failNext('approveSendRequest', lost())
    server.failNext('getSendRequest', lost())
    await live.approve(id)
    expect(detail(id)?.status).toBe('draft')
    expect(detail(id)?.notice).toContain('not known whether the approval was recorded')
    await live.refresh(id)
    expect(detail(id)?.notice).toBeNull()
  })

  it('keeps the request unapproved and explains a refusal', async () => {
    await signedIn()
    const id = await saved()
    server.failNext('approveSendRequest', refused('quota_exceeded', 429))
    await live.approve(id)
    expect(detail(id)?.status).toBe('draft')
    expect(detail(id)?.notice).toContain('still awaiting approval')
  })

  it('shows what another tab already did instead of approving twice', async () => {
    await signedIn()
    const id = await saved()
    const other = tab(server, local)
    await other.start()
    await other.openRequest(id)
    await live.approve(id)
    await other.approve(id)
    expect(other.store.getState().details[0]).toMatchObject({ status: 'pending', notice: null })
    expect(server.intents[0]!.status).toBe('pending')
  })

  it('cancels before sending and reads the result back', async () => {
    await signedIn()
    const id = await saved()
    await live.cancel(id)
    expect(detail(id)?.status).toBe('cancelled')
    await live.cancel(id)
    expect(server.count('cancelSendRequest')).toBe(1)
  })

  it('explains a cancellation that came too late and shows the real state', async () => {
    await signedIn()
    const id = await saved()
    await live.approve(id)
    server.intents[0]!.status = 'accepted'
    await live.cancel(id)
    expect(detail(id)?.status).toBe('accepted')
    expect(detail(id)?.notice).not.toBeNull()
  })

  it('reads the reason and reference of a rejected or unknown request', async () => {
    await signedIn()
    const id = await saved()
    server.intents[0]!.status = 'unknown'
    live = tab(server, local)
    await live.start()
    await live.openRequest(id)
    expect(detail(id)).toMatchObject({ status: 'unknown', correlationId: 'corr-1' })
  })

  it('reads the server again when another tab reports a change', async () => {
    await signedIn()
    const id = await saved()
    await live.openRequests()
    const stop = live.watch(id)
    server.intents[0]!.status = 'cancelled'
    live.onStorageEvent('elevateo:sync')
    await flush()
    expect(detail(id)?.status).toBe('cancelled')
    expect(state().requests?.page).toMatchObject({ status: 'ready', data: { items: [{ status: 'cancelled' }] } })
    stop()
  })
})

describe('request history', () => {
  it('holds one bounded page at a time, however many unfinished requests exist', async () => {
    await signedIn()
    for (let i = 0; i < 130; i++) server.insert(`k-${i}`, content)
    await live.openRequests()
    const first = state().requests!
    if (first.page.status !== 'ready') throw new Error('not ready')
    expect(first.page.data.items).toHaveLength(25)
    let cursor = first.page.data.next
    let seen = 25
    while (cursor) {
      await live.openRequests(cursor)
      const page = state().requests!.page
      if (page.status !== 'ready') throw new Error('not ready')
      expect(page.data.items.length).toBeLessThanOrEqual(25)
      seen += page.data.items.length
      cursor = page.data.next
    }
    // Every unfinished request is reachable; none was dropped, and none of it is in browser storage.
    expect(seen).toBe(130)
    expect(server.intents).toHaveLength(130)
    expect(local.data.size).toBeLessThanOrEqual(2)
  })

  it('keeps at most twenty opened requests in memory', async () => {
    await signedIn()
    for (let i = 0; i < 25; i++) await live.openRequest(server.insert(`k-${i}`, content).id)
    expect(state().details).toHaveLength(20)
    expect(detail('intent-1')).toBeUndefined()
  })

  it('reports a list that could not be read', async () => {
    await signedIn()
    server.failNext('listSendRequests', lost())
    await live.openRequests()
    expect(state().requests?.page.status).toBe('error')
    await live.reloadRequests()
    expect(state().requests?.page.status).toBe('ready')
  })

  it('never shows one account\'s requests to another', async () => {
    await signedIn('alice')
    await saved()
    await live.fixtureSignIn('bob')
    await live.openRequests()
    expect(state().requests?.page).toMatchObject({ status: 'ready', data: { items: [] } })
    await live.openRequest('intent-1')
    expect(detail('intent-1')?.saved.status).toBe('error')
  })
})

describe('records left by the earlier version', () => {
  const legacyKey = 'elevateo:sends:abc123'
  const record = (patch: object) => ({ key: 'old-key-1', status: 'draft', intentId: null, createdAt: '2026-10-05T00:00:00.000Z', content: { ...content, body: 'Old private text' }, ...patch })

  it('removes the browser copy of a record the server holds', async () => {
    server.cookie.user = 'alice'
    const held = server.insert('old-key-1', { ...content, body: 'Old private text' })
    local.data.set(legacyKey, JSON.stringify([record({ intentId: held.id })]))
    await live.start()
    await flush()
    expect(local.data.has(legacyKey)).toBe(false)
    expect(state().legacy).toEqual([])
  })

  it('recovers an unconfirmed record by its key from the exact lookup', async () => {
    server.cookie.user = 'alice'
    server.insert('old-key-1', { ...content, body: 'Old private text' })
    // Far enough back that it is not on the first page of the list.
    for (let i = 0; i < 60; i++) server.insert(`filler-${i}`, content)
    local.data.set(legacyKey, JSON.stringify([record({ status: 'unconfirmed' })]))
    await live.start()
    await flush()
    await flush()
    expect(local.data.has(legacyKey)).toBe(false)
  })

  it('keeps a record whose id exists on the server but whose text the server does not hold', async () => {
    server.cookie.user = 'alice'
    const other = server.insert('old-key-1', { ...content, body: 'Something else entirely' })
    const unrelated = server.insert('another-key', { ...content, body: 'Old private text' })
    local.data.set(legacyKey, JSON.stringify([record({ intentId: other.id }), record({ key: 'old-key-2', intentId: unrelated.id })]))
    await live.start()
    await flush()
    expect(JSON.parse(local.data.get(legacyKey)!)).toHaveLength(2)
    expect(state().legacy).toHaveLength(2)
  })

  it('keeps a record the server does not hold until the person discards it, without exposing its text', async () => {
    server.cookie.user = 'alice'
    local.data.set(legacyKey, JSON.stringify([record({ status: 'local_draft' }), record({ key: 'old-key-2', intentId: 'intent-404' })]))
    await live.start()
    await flush()
    expect(local.data.has(legacyKey)).toBe(true)
    expect(state().legacy).toHaveLength(2)
    expect(JSON.stringify(state().legacy)).not.toContain('Old private text')
    live.discardLegacy()
    expect(local.data.has(legacyKey)).toBe(false)
    expect(state().legacy).toEqual([])
  })

  it('keeps a record it cannot read rather than deleting it', async () => {
    server.cookie.user = 'alice'
    local.data.set(legacyKey, '{not json')
    await live.start()
    await flush()
    expect(local.data.has(legacyKey)).toBe(true)
    expect(state().legacy).toMatchObject([{ status: 'unreadable' }])
  })
})

describe('mail and mailboxes', () => {
  it('refreshes cached bodies and completeness, fences stale reads, and fails without stale text', async () => {
    await signedIn()
    await live.openList('mbx-1')
    const original = server.gateway.getMessage
    const old = await original('mbx-1', 'new')
    let resolveOld!: (value: typeof old) => void
    server.gateway.getMessage = () => new Promise(resolve => { resolveOld = resolve })
    const pending = live.openBody('mbx-1', 'new')
    server.gateway.getMessage = async () => ({ ...old, body: 'Current saved text', incomplete: true })
    await live.reloadPage()
    expect(state().bodies[0]?.body).toMatchObject({ status: 'ready', data: { incomplete: true, body: 'Current saved text' } })
    resolveOld(old)
    await pending
    expect(state().bodies[0]?.body).toMatchObject({ status: 'ready', data: { incomplete: true } })
    server.gateway.getMessage = async () => { throw lost() }
    await live.reloadPage()
    expect(state().bodies[0]?.body.status).toBe('error')
    expect(JSON.stringify(state().bodies)).not.toContain('Current saved text')
  })

  it('opens one page at a time and reports a page that cannot be read', async () => {
    await signedIn()
    await live.openList('mbx-1')
    expect(state().list?.page).toMatchObject({ status: 'ready', data: { items: [{ id: 'new' }] } })
    await live.openList('mbx-1', { before: 1, beforeId: 'new' })
    expect(state().list?.page).toMatchObject({ status: 'ready', data: { items: [{ id: 'old' }], next: null } })
    server.failNext('listMessages', lost())
    await live.reloadPage()
    expect(state().list?.page.status).toBe('error')
  })

  it('loads a body only when asked and keeps at most twenty', async () => {
    await signedIn()
    expect(server.count('getMessage')).toBe(0)
    for (let i = 0; i < 22; i++) await live.openBody('mbx-1', `m${i}`)
    expect(state().bodies).toHaveLength(20)
    await live.openBody('mbx-1', 'm21')
    expect(server.count('getMessage')).toBe(22)
    server.failNext('getMessage', lost())
    await live.openBody('mbx-1', 'bad')
    expect(state().bodies.at(-1)?.body.status).toBe('error')
  })

  it('shows what the server holds after a permission change, whether it worked or not', async () => {
    await signedIn()
    await live.setPermissions('mbx-1', { connected: true, sendEnabled: false, aiRead: false, aiDraft: false, aiSend: false })
    server.failNext('updateMailboxPermissions', refused('mailbox_permission', 403))
    await expect(live.setPermissions('mbx-1', { connected: true, sendEnabled: true, aiRead: true, aiDraft: false, aiSend: false })).rejects.toBeInstanceOf(ApiFailure)
    expect(server.count('listMailboxes')).toBeGreaterThanOrEqual(3)
    await live.refreshMailboxes()
    expect(state().mailboxes).toEqual([mailbox])
  })

  it('reports capacity it cannot read as an error instead of an old figure', async () => {
    await signedIn()
    await live.loadQuota('mbx-1')
    expect(state().quotas['mbx-1']).toMatchObject({ status: 'ready' })
    server.failNext('mailboxQuota', lost())
    await live.loadQuota('mbx-1')
    expect(state().quotas['mbx-1']?.status).toBe('error')
  })
})

describe('status checks', () => {
  beforeEach(() => vi.useFakeTimers())

  it('checks a queued request a bounded number of times, then stops and says so', async () => {
    await signedIn()
    const id = await saved()
    await live.approve(id)
    const before = server.count('getSendRequest')
    const stop = live.watch(id)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    const checks = server.count('getSendRequest') - before
    expect(checks).toBeGreaterThan(0)
    expect(checks).toBeLessThanOrEqual(MAX_POLL_ATTEMPTS)
    expect(state().stalled).toContain(id)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(server.count('getSendRequest') - before).toBe(checks)
    stop()
  })

  it('stops checking when the view closes and never checks an unknown outcome by itself', async () => {
    await signedIn()
    const id = await saved()
    await live.approve(id)
    const stop = live.watch(id)
    stop()
    const before = server.count('getSendRequest')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(server.count('getSendRequest')).toBe(before)
    server.intents[0]!.status = 'unknown'
    await live.refresh(id)
    const again = live.watch(id)
    const settled = server.count('getSendRequest')
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(server.count('getSendRequest')).toBe(settled)
    again()
  })

  it('stops every check when the session ends', async () => {
    await signedIn()
    const id = await saved()
    await live.approve(id)
    live.watch(id)
    await live.signOut()
    const before = server.calls.length
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(server.calls.length).toBe(before)
  })
})


describe('bounded mailbox history', () => {
  it('replaces history pages, retains the selected archive, and keeps it on failure', async () => {
    const server = fakeServer()
    const app = tab(server, memoryStorage())
    await app.fixtureSignIn('alice')
    const archive = (id: string): ServerMailbox => ({ ...mailbox, id, connected: false })
    server.gateway.listMailboxHistory = async (after) => ({ items: Array.from({ length: 25 }, (_, n) => archive(`${after ?? 'first'}-${n}`)), next: { after: 'next' } })
    server.gateway.getMailbox = async (id) => archive(id)
    await app.loadMailboxHistory()
    await app.ensureMailbox('first-0')
    await app.loadMailboxHistory('next')
    expect(app.store.getState().mailboxes).toHaveLength(27)
    expect(app.store.getState().mailboxes.some(m => m.id === 'first-0')).toBe(true)
    expect(app.store.getState().mailboxes.some(m => m.id === 'first-1')).toBe(false)
    server.gateway.listMailboxHistory = async () => { throw lost() }
    await app.loadMailboxHistory('later')
    expect(app.store.getState().mailboxHistory.status).toBe('error')
    expect(app.store.getState().mailboxes).toHaveLength(27)
    await app.signOut()
    expect(app.store.getState().mailboxHistory.items).toEqual([])
  })
})


it('retains reply identity when recovering a submission whose answer was lost', async () => {
  await signedIn()
  server.failNext('createSendRequest', lost(), true)
  const result = await live.submit({ ...content, replyToMessageId: 'source_1' }, null)
  expect(result.outcome).toBe('unconfirmed')
  if (result.outcome !== 'unconfirmed') throw new Error('expected unconfirmed')
  const id = await live.resolvePending(result.key)
  expect(server.intents).toHaveLength(1)
  expect(server.intents[0]!.content.replyToMessageId).toBe('source_1')
  if (!id) throw new Error('expected recovered intent')
  await live.openRequest(id)
  expect(state().details.find((d) => d.id === id)?.saved).toMatchObject({ status: 'ready', data: { replyToMessageId: 'source_1' } })
})
