import { describe, expect, it } from 'vitest'
import { createSeed } from './seed'
import { loadPersisted } from './store'

// AIDEV-NOTE: Legacy fixtures exercise the storage boundary so migration cannot conceal unrelated corruption.
const NOW = new Date('2026-10-01T12:00:00Z').getTime()
const load = (value: unknown) => loadPersisted({ getItem: () => JSON.stringify(value) }, NOW)

describe('persisted daily limit compatibility', () => {
  it.each([31, 40, 500])('reduces the legacy limit %i while preserving saved work', (limit) => {
    const expected = createSeed(NOW)
    expected.drafts[0]!.body = 'Unsent work that must survive an upgrade'
    expected.contacts[0]!.name = 'Edited contact name'
    expected.settings.dailyLimitPerIdentity = 30
    expected.campaigns[0]!.schedule.dailyLimit = 30
    const saved = structuredClone(expected)
    saved.settings.dailyLimitPerIdentity = limit
    saved.campaigns[0]!.schedule.dailyLimit = limit

    expect(load(saved)).toEqual({ data: expected, recovered: false })
  })

  it.each([1, 15, 30])('retains the current limit %i exactly', (limit) => {
    const saved = createSeed(NOW)
    saved.settings.dailyLimitPerIdentity = limit
    saved.campaigns[0]!.schedule.dailyLimit = limit

    expect(load(saved)).toEqual({ data: saved, recovered: false })
  })

  it('migrates settings with no campaigns', () => {
    const saved = createSeed(NOW)
    saved.settings.dailyLimitPerIdentity = 40
    saved.campaigns = []

    expect(load(saved)).toEqual({
      data: { ...saved, settings: { ...saved.settings, dailyLimitPerIdentity: 30 } },
      recovered: false,
    })
  })

  it.each([0, 501, 31.5, '40', null, undefined])('rejects an invalid saved settings limit %s', (limit) => {
    const seed = createSeed(NOW)
    const saved = { ...seed, settings: { ...seed.settings, dailyLimitPerIdentity: limit } }

    expect(load(saved)).toEqual({ data: seed, recovered: true })
  })

  it.each([0, 501, 31.5, '40', null, undefined])('rejects an invalid saved campaign limit %s', (limit) => {
    const seed = createSeed(NOW)
    const saved = {
      ...seed,
      campaigns: seed.campaigns.map((campaign) => ({ ...campaign, schedule: { ...campaign.schedule, dailyLimit: limit } })),
    }

    expect(load(saved)).toEqual({ data: seed, recovered: true })
  })

  it.each([
    { label: 'null settings', fields: { settings: null } },
    { label: 'malformed campaign', fields: { campaigns: [{ schedule: { dailyLimit: 40 } }] } },
    { label: 'malformed draft', fields: { drafts: [{ body: 'Missing fields' }] } },
    { label: 'unknown version', fields: { version: 2 } },
  ])('rejects $label even when other legacy limits are migratable', ({ fields }) => {
    const seed = createSeed(NOW)
    const saved = structuredClone(seed)
    saved.settings.dailyLimitPerIdentity = 40
    saved.campaigns[0]!.schedule.dailyLimit = 500

    expect(load({ ...saved, ...fields })).toEqual({ data: seed, recovered: true })
  })
})

describe('persisted connections compatibility', () => {
  it('adds default connections to data saved before Connections existed, keeping saved work', () => {
    const expected = createSeed(NOW)
    expected.contacts[0]!.name = 'Edited contact name'
    const { connections, ...legacy } = structuredClone(expected)

    const loaded = load(legacy)
    expect(loaded.recovered).toBe(false)
    expect(loaded.data.contacts[0]!.name).toBe('Edited contact name')
    expect(loaded.data.connections.mailboxes.map((m) => m.address)).toEqual(connections.mailboxes.map((m) => m.address))
    expect(loaded.data.connections.ai.allowSend).toBe(false)
  })

  it('keeps saved connections exactly, including an added mailbox', () => {
    const saved = createSeed(NOW)
    saved.connections.mailboxes.push({ ...saved.connections.mailboxes[0]!, id: 'mbx-extra', address: 'tenth@example.com', sendEnabled: false })
    expect(load(saved)).toEqual({ data: saved, recovered: false })
  })

  it.each([
    { label: 'eleven mailboxes', mutate: (c: ReturnType<typeof createSeed>['connections']) => { for (const n of [1, 2]) c.mailboxes.push({ ...c.mailboxes[0]!, id: `mbx-x${n}`, address: `x${n}@example.com` }) } },
    { label: 'an unknown Resend purpose', mutate: (c: ReturnType<typeof createSeed>['connections']) => { (c.resendIdentities[0] as { purpose: string }).purpose = 'marketing' } },
  ])('rejects saved connections with $label', ({ mutate }) => {
    const seed = createSeed(NOW)
    const saved = structuredClone(seed)
    mutate(saved.connections)
    expect(load(saved)).toEqual({ data: seed, recovered: true })
  })
})
