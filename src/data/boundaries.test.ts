import { beforeEach, describe, expect, it } from 'vitest'
import { isSendable } from '@/domain/rules'
import { dataSchema, type Data, type Draft } from '@/domain/schema'
import { eventHref, threadHref } from '@/lib/routes'
import { clampPage, PAGE_SIZE } from '@/ui/Bits'
import { mockGateway } from './mockGateway'
import { createSeed } from './seed'
import { loadPersisted, snapshot, useData } from './store'

// Edge cases found in adversarial review (see code-reviews.md): each test pins a boundary that was once wrong.

const NOW = new Date('2026-10-01T12:00:00Z').getTime()
const draft = (over: Partial<Draft> = {}): Draft => ({ id: 'd-test', identityId: 'lachlan@flooda.co', to: ['new.person@somewhere.example'], cc: [], bcc: [], subject: 'Test subject', body: 'Test body', attachments: [], campaignId: null, threadId: null, banner: false, updatedAt: new Date(NOW).toISOString(), ...over })
const schedule = { startAt: new Date(NOW).toISOString(), timezone: 'Europe/London', windowStart: '09:00', windowEnd: '17:00', dailyLimit: 5 }

beforeEach(() => useData.getState().replaceAll(createSeed(NOW)))

describe('persisted-state validation', () => {
  const corrupt = (change: (data: Data) => void): Data => {
    const data = structuredClone(createSeed(NOW))
    change(data)
    return data
  }

  it('rejects malformed emails, timestamps, times, limits, and identity lists', () => {
    const cases: Array<(data: Data) => void> = [
      (d) => (d.contacts[0]!.email = 'not-an-email'),
      (d) => (d.settings.profile.email = 'nope'),
      (d) => (d.events[0]!.at = 'invalid'),
      (d) => (d.settings.windowStart = '99:99'),
      (d) => (d.settings.dailyLimitPerIdentity = 1.5),
      (d) => (d.campaigns[0]!.schedule.dailyLimit = -1),
      (d) => (d.identities = []),
      (d) => (d.identities[1] = d.identities[0]!),
    ]
    for (const change of cases) expect(dataSchema.safeParse(corrupt(change)).success).toBe(false)
  })

  it('still accepts a draft holding a half-typed recipient', () => {
    expect(dataSchema.safeParse(corrupt((d) => d.drafts.push(draft({ to: ['amar'] })))).success).toBe(true)
  })

  it('falls back to seed data, flagged as recovered, when stored state breaks a rule', () => {
    const stored = JSON.stringify(corrupt((d) => (d.settings.windowStart = '')))
    expect(loadPersisted({ getItem: () => stored }, NOW).recovered).toBe(true)
  })
})

describe('mock gateway boundaries', () => {
  it('logs sent and delivered events for cc and bcc recipients as well', async () => {
    const before = useData.getState().events.length
    await mockGateway.sendMessage(draft({ cc: ['copy@somewhere.example'], bcc: ['blind@somewhere.example'] }))
    const added = useData.getState().events.slice(0, useData.getState().events.length - before)
    expect(added).toHaveLength(6)
    expect(new Set(added.map((e) => e.email))).toEqual(new Set(['new.person@somewhere.example', 'copy@somewhere.example', 'blind@somewhere.example']))
  })

  it('rejects a campaign whose senders are unknown or span more than one domain', async () => {
    const input = { name: 'Senders', contactIds: [], steps: [{ subject: 'S', body: 'B', delayDays: 0 }], schedule, unsubscribeFooter: 'f', status: 'draft' as const }
    await expect(mockGateway.createCampaign({ ...input, identityIds: ['fake@boltloop.co'] })).rejects.toThrow(/single domain/)
    await expect(mockGateway.createCampaign({ ...input, identityIds: ['lachlan@boltloop.co', 'lachlan@flooda.co'] })).rejects.toThrow(/single domain/)
    await expect(mockGateway.createCampaign({ ...input, identityIds: ['lachlan@boltloop.co', 'l.macdonald@boltloop.co'] })).resolves.toBeDefined()
  })

  it('records a lifecycle event with every start, pause, and resume', async () => {
    const contactIds = useData.getState().contacts.filter(isSendable).slice(0, 2).map((c) => c.id)
    const { id } = await mockGateway.createCampaign({ name: 'Lifecycle', identityIds: ['lachlan@boltloop.co'], contactIds, steps: [{ subject: 'S', body: 'B', delayDays: 0 }], schedule, unsubscribeFooter: 'f', status: 'scheduled' })
    const latest = () => useData.getState().events[0]
    const status = () => useData.getState().campaigns.find((c) => c.id === id)!.status

    await mockGateway.setCampaignStatus(id, 'running')
    expect([status(), latest()?.text]).toEqual(['running', 'Campaign started'])
    await mockGateway.setCampaignStatus(id, 'paused')
    expect([status(), latest()?.text]).toEqual(['paused', 'Campaign paused'])
    await mockGateway.setCampaignStatus(id, 'running')
    expect([status(), latest()?.text]).toEqual(['running', 'Campaign resumed'])
    expect(latest()).toMatchObject({ kind: 'campaign', campaignId: id })
  })

  it('refuses an impossible status change and an unknown campaign', async () => {
    const paused = useData.getState().campaigns.find((c) => c.status === 'paused')!
    const completed = useData.getState().campaigns.find((c) => c.status === 'completed')!
    await expect(mockGateway.setCampaignStatus(paused.id, 'paused')).rejects.toThrow(/cannot be paused/)
    await expect(mockGateway.setCampaignStatus(completed.id, 'running')).rejects.toThrow(/cannot be started/)
    await expect(mockGateway.setCampaignStatus('missing', 'running')).rejects.toThrow(/not found/)
  })
})

describe('deleting a campaign', () => {
  it('leaves nothing pointing at it and keeps its conversations as ordinary mail', () => {
    const linked = useData.getState().threads.find((t) => t.campaignId)!
    const id = linked.campaignId!
    useData.getState().upsertDraft(draft({ campaignId: id }))
    useData.getState().deleteCampaign(id)

    const state = useData.getState()
    expect(state.campaigns.some((c) => c.id === id)).toBe(false)
    expect(state.threads.find((t) => t.id === linked.id)).toMatchObject({ campaignId: null })
    expect([...state.threads, ...state.drafts, ...state.events].some((item) => item.campaignId === id)).toBe(false)
    expect(dataSchema.safeParse(snapshot(state)).success).toBe(true)
  })
})

describe('links and paging', () => {
  it('opens a conversation in the folder it lives in', () => {
    const thread = useData.getState().threads[0]!
    useData.getState().patchThreads([thread.id], { folder: 'archive' })
    const threads = useData.getState().threads
    const event = { ...useData.getState().events[0]!, threadId: thread.id, campaignId: null }
    expect(threadHref({ id: 't9', folder: 'spam' })).toBe('/mail/spam/t9')
    expect(eventHref(event, threads)).toBe(`/mail/archive/${thread.id}`)
  })

  it('links an event without a conversation to its campaign, or to the activity list', () => {
    const event = { ...useData.getState().events[0]!, threadId: null }
    expect(eventHref({ ...event, campaignId: 'cmp1' }, [])).toBe('/campaigns/cmp1/activity')
    expect(eventHref({ ...event, campaignId: null }, [])).toBe('/activity')
    expect(eventHref({ ...event, threadId: 'gone' }, [])).toBe('/mail/inbox/gone')
  })

  it('limits a page number from the URL to the pages that exist', () => {
    const total = PAGE_SIZE * 3 + 1
    expect(clampPage('2', total)).toBe(2)
    expect(clampPage(null, total)).toBe(1)
    expect(clampPage('999', total)).toBe(4)
    expect(clampPage('2.7', total)).toBe(2)
    for (const bad of ['Infinity', '-4', 'abc', '0']) expect(clampPage(bad, total)).toBeGreaterThanOrEqual(1)
    expect(clampPage('Infinity', total)).toBe(1)
    expect(clampPage('5', 0)).toBe(1)
  })
})
