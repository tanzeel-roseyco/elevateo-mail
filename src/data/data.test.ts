import { beforeEach, describe, expect, it } from 'vitest'
import { lastMessage } from '@/domain/mail'
import { isSendable } from '@/domain/rules'
import { dataSchema, type Draft } from '@/domain/schema'
import { FAILING_DOMAIN, mockGateway } from './mockGateway'
import { createSeed } from './seed'
import { loadPersisted, snapshot, STORAGE_KEY, useData } from './store'

const NOW = new Date('2026-10-01T12:00:00Z').getTime()
const storageWith = (value: string | null) => ({ getItem: () => value })

const draft = (over: Partial<Draft> = {}): Draft => ({ id: 'd-test', identityId: 'lachlan@flooda.co', to: ['new.person@somewhere.example'], cc: [], bcc: [], subject: 'Test subject', body: 'Test body', attachments: [], campaignId: null, threadId: null, banner: true, updatedAt: new Date(NOW).toISOString(), ...over })

beforeEach(() => useData.getState().replaceAll(createSeed(NOW)))

describe('seed data', () => {
  const seed = createSeed(NOW)

  it('is valid against the schema and deterministic', () => {
    expect(dataSchema.safeParse(seed).success).toBe(true)
    expect(createSeed(NOW)).toEqual(seed)
  })

  it('covers the scenarios the prototype must demonstrate', () => {
    expect(seed.contacts).toHaveLength(840)
    expect(new Set(seed.contacts.map((c) => c.email)).size).toBe(840)
    expect(seed.identities).toHaveLength(9)
    for (const state of ['unsubscribed', 'bounced', 'suppressed'] as const) expect(seed.contacts.some((c) => c.subscription === state)).toBe(true)
    expect(seed.threads.some((t) => t.subject.length > 100)).toBe(true)
    expect(seed.threads.some((t) => t.messages.some((m) => m.attachments.length > 0))).toBe(true)
    expect(seed.threads.some((t) => t.unread && t.folder === 'inbox')).toBe(true)
    expect(seed.threads.some((t) => t.campaignId) && seed.threads.some((t) => !t.campaignId)).toBe(true)
    expect(seed.threads.filter((t) => t.folder === 'trash')).toEqual([])
    expect(new Set(seed.campaigns.map((c) => c.status))).toEqual(new Set(['draft', 'scheduled', 'running', 'paused', 'completed']))
    expect(seed.events.some((e) => e.kind === 'failed')).toBe(true)
  })

  it('never queues a suppressed contact as a pending recipient', () => {
    const byId = new Map(seed.contacts.map((c) => [c.id, c]))
    const scheduled = seed.campaigns.find((c) => c.status === 'scheduled')!
    expect(scheduled.recipients.length).toBeGreaterThan(0)
    expect(scheduled.recipients.every((r) => isSendable(byId.get(r.contactId)!))).toBe(true)
  })
})

describe('persisted state', () => {
  it('uses seed data on first run', () => {
    const result = loadPersisted(storageWith(null), NOW)
    expect(result.recovered).toBe(false)
    expect(result.data.contacts).toHaveLength(840)
  })

  it('round-trips a saved snapshot', () => {
    useData.getState().patchThreads([useData.getState().threads[0]!.id], { starred: true })
    const saved = JSON.stringify(snapshot(useData.getState()))
    const result = loadPersisted(storageWith(saved), NOW)
    expect(result.recovered).toBe(false)
    expect(result.data.threads[0]!.starred).toBe(true)
  })

  it('recovers from malformed JSON and from data that fails validation', () => {
    expect(loadPersisted(storageWith('{not json'), NOW)).toMatchObject({ recovered: true })
    expect(loadPersisted(storageWith(JSON.stringify({ version: 1, threads: 'nope' })), NOW)).toMatchObject({ recovered: true })
  })

  it('falls back to seed data when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('denied') } }
    expect(loadPersisted(blocked, NOW)).toMatchObject({ recovered: false })
  })
})

describe('store actions', () => {
  it('moves threads and restores their previous folders', () => {
    const [a, b] = useData.getState().threads.filter((t) => t.folder === 'inbox')
    useData.getState().patchThreads([a!.id, b!.id], { folder: 'trash' })
    expect(useData.getState().threads.filter((t) => t.folder === 'trash')).toHaveLength(2)
    useData.getState().restoreFolders({ [a!.id]: 'inbox' })
    expect(useData.getState().threads.find((t) => t.id === a!.id)!.folder).toBe('inbox')
    expect(useData.getState().threads.find((t) => t.id === b!.id)!.folder).toBe('trash')
  })

  it('upserts and deletes drafts without duplicating', () => {
    useData.getState().upsertDraft(draft())
    useData.getState().upsertDraft(draft({ subject: 'Edited' }))
    expect(useData.getState().drafts.filter((d) => d.id === 'd-test').map((d) => d.subject)).toEqual(['Edited'])
    useData.getState().deleteDraft('d-test')
    expect(useData.getState().drafts.some((d) => d.id === 'd-test')).toBe(false)
  })
})

describe('mock gateway', () => {
  it('simulates a new message: creates a Sent conversation, logs events, and clears the draft', async () => {
    useData.getState().upsertDraft(draft())
    const { threadId } = await mockGateway.sendMessage(draft())
    const state = useData.getState()
    const created = state.threads.find((t) => t.id === threadId)!
    expect(created).toMatchObject({ folder: 'sent', identityId: 'lachlan@flooda.co', campaignId: null })
    expect(lastMessage(created)).toMatchObject({ direction: 'out', bannerDomain: 'flooda.co', unsubscribeFooter: undefined })
    expect(state.events.slice(0, 2).map((e) => e.kind).sort()).toEqual(['delivered', 'sent'])
    expect(state.drafts.some((d) => d.id === 'd-test')).toBe(false)
  })

  it('appends a reply to its conversation and adds the unsubscribe footer for campaign mail', async () => {
    const sendable = new Set(useData.getState().contacts.filter(isSendable).map((c) => c.email))
    const target = useData.getState().threads.find((t) => t.campaignId && sendable.has(lastMessage(t).from.email))!
    const before = target.messages.length
    await mockGateway.sendMessage(draft({ threadId: target.id, campaignId: target.campaignId, identityId: target.identityId, to: [lastMessage(target).from.email], banner: false }))
    const after = useData.getState().threads.find((t) => t.id === target.id)!
    expect(after.messages).toHaveLength(before + 1)
    expect(lastMessage(after).unsubscribeFooter).toBeTruthy()
    expect(lastMessage(after).bannerDomain).toBeUndefined()
  })

  it('rejects a simulated provider failure and leaves state untouched', async () => {
    const threads = useData.getState().threads
    await expect(mockGateway.sendMessage(draft({ to: [`someone${FAILING_DOMAIN}`] }))).rejects.toThrow(/Simulated provider failure/)
    expect(useData.getState().threads).toBe(threads)
  })

  it('refuses a campaign email to an unsubscribed contact even if the UI were bypassed', async () => {
    const unsubscribed = useData.getState().contacts.find((c) => c.subscription === 'unsubscribed')!
    await expect(mockGateway.sendMessage(draft({ to: [unsubscribed.email], campaignId: 'cmp-boltloop-audit' }))).rejects.toThrow(/cannot receive campaign emails/)
  })

  it('imports only contacts that are not already present', async () => {
    const existing = useData.getState().contacts[0]!
    const { added } = await mockGateway.importContacts([
      { name: 'New Person', email: 'New.Person@fresh.example', company: 'Fresh', tags: [], consent: 'opted_in' },
      { name: existing.name, email: existing.email.toUpperCase(), company: existing.company, tags: [], consent: 'opted_in' },
    ])
    expect(added).toBe(1)
    expect(useData.getState().contacts[0]).toMatchObject({ email: 'new.person@fresh.example', subscription: 'subscribed' })
  })

  it('creates a campaign without suppressed contacts and rejects one with no sender', async () => {
    const contacts = useData.getState().contacts
    const blocked = contacts.find((c) => !isSendable(c))!
    const ok = contacts.find(isSendable)!
    const input = { name: ' Launch ', identityIds: ['lachlan@boltloop.co'], contactIds: [ok.id, blocked.id], steps: [{ subject: 'S', body: 'B', delayDays: 0 }], schedule: { startAt: new Date(NOW).toISOString(), timezone: 'Europe/London', windowStart: '09:00', windowEnd: '17:00', dailyLimit: 5 }, unsubscribeFooter: 'f', status: 'scheduled' as const }
    const { id } = await mockGateway.createCampaign(input)
    const created = useData.getState().campaigns.find((c) => c.id === id)!
    expect(created.name).toBe('Launch')
    expect(created.recipients.map((r) => r.contactId)).toEqual([ok.id])
    await expect(mockGateway.createCampaign({ ...input, identityIds: [] })).rejects.toThrow(/sender identity/)
  })

  it('runs batches up to the daily limit, skips contacts suppressed since scheduling, and completes', async () => {
    const contacts = useData.getState().contacts.filter(isSendable).slice(0, 3)
    const { id } = await mockGateway.createCampaign({ name: 'Batch', identityIds: ['lachlan@boltloop.co'], contactIds: contacts.map((c) => c.id), steps: [{ subject: 'S', body: 'B', delayDays: 0 }], schedule: { startAt: new Date(NOW).toISOString(), timezone: 'Europe/London', windowStart: '09:00', windowEnd: '17:00', dailyLimit: 1 }, unsubscribeFooter: 'f', status: 'scheduled' })
    await expect(mockGateway.runCampaignBatch(id)).rejects.toThrow(/running/)
    useData.getState().updateCampaign(id, { status: 'running' })
    useData.getState().updateContact(contacts[1]!.id, { subscription: 'suppressed' })

    expect(await mockGateway.runCampaignBatch(id)).toEqual({ processed: 1, completed: false })
    expect(await mockGateway.runCampaignBatch(id)).toEqual({ processed: 1, completed: true })
    const done = useData.getState().campaigns.find((c) => c.id === id)!
    expect(done.status).toBe('completed')
    expect(done.recipients.map((r) => r.delivery)).toEqual(['delivered', 'skipped', 'delivered'])
    expect(useData.getState().events[0]).toMatchObject({ kind: 'campaign', text: 'Campaign completed' })
    await expect(mockGateway.runCampaignBatch('missing')).rejects.toThrow(/not found/)
  })

  it('resets to the demo dataset and clears stored state', async () => {
    localStorage.setItem(STORAGE_KEY, 'stale')
    useData.getState().deleteThreads(useData.getState().threads.map((t) => t.id))
    await mockGateway.resetAll()
    expect(useData.getState().threads.length).toBeGreaterThan(0)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
