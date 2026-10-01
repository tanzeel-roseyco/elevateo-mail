import { describe, expect, it } from 'vitest'
import { filterEvents } from './activity'
import { appearanceSchema, DEFAULT_APPEARANCE, MAX_BACKGROUND_IMAGE_BYTES } from './appearance'
import { contrast, hexToRgb, onColor, type Rgb } from './color'
import { MAX_IMPORT_ROWS, parseCsv, validateImport } from './csv'
import { defaultIdentities, identityDomain } from './identities'
import { plainPreview } from './richText'
import { dailyLimitError, isCampaignSend, nextAction, sendingWindowError, validateSend } from './rules'
import type { ActivityEvent, Campaign, Contact, Draft } from './schema'
import { zonedTimeToIso } from './time'

// Edge cases found in adversarial review (see code-reviews.md): each test pins a boundary that was once wrong.

const identities = defaultIdentities()
const contact = (over: Partial<Contact> = {}): Contact => ({ id: 'c1', name: 'Amara Abernathy', email: 'amara@northwind.example', company: 'Northwind Logistics', tags: [], consent: 'opted_in', consentSource: 'Form', subscription: 'subscribed', ...over })
const draft = (over: Partial<Draft> = {}): Draft => ({ id: 'd1', identityId: 'lachlan@boltloop.co', to: ['amara@northwind.example'], cc: [], bcc: [], subject: 'Hello', body: 'Body text', attachments: [], campaignId: null, threadId: null, banner: false, updatedAt: '2026-10-01T10:00:00.000Z', ...over })

describe('form limits shared with the persisted schema', () => {
  it('accepts whole daily limits from 1 to 500 and rejects everything else', () => {
    expect(dailyLimitError(1)).toBeNull()
    expect(dailyLimitError(500)).toBeNull()
    for (const bad of [0, 501, 1.5, Number.NaN, -3]) expect(dailyLimitError(bad)).toMatch(/whole number between 1 and 500/)
  })

  it('accepts a sending window that ends after it starts', () => {
    expect(sendingWindowError('09:00', '17:00')).toBeNull()
  })

  it('rejects a cleared or malformed time, and a window that does not end after it starts', () => {
    expect(sendingWindowError('', '17:00')).toMatch(/start and an end time/)
    expect(sendingWindowError('99:99', '17:00')).toMatch(/start and an end time/)
    expect(sendingWindowError('17:00', '09:00')).toMatch(/end after it starts/)
    expect(sendingWindowError('09:00', '09:00')).toMatch(/end after it starts/)
  })
})

describe('campaign sends versus replies', () => {
  it('treats only a new campaign-linked conversation as a campaign send', () => {
    expect(isCampaignSend({ campaignId: 'cmp1', threadId: null })).toBe(true)
    expect(isCampaignSend({ campaignId: 'cmp1', threadId: 't1' })).toBe(false)
    expect(isCampaignSend({ campaignId: null, threadId: null })).toBe(false)
  })

  it('blocks a campaign send to an address with no contact record, since no opt-in is recorded', () => {
    const check = validateSend(draft({ campaignId: 'cmp1', to: ['stranger@elsewhere.example'] }), [contact()], identities)
    expect(check.ok).toBe(false)
    expect(check.errors[0]?.message).toContain('is not an opted-in contact')
  })

  it('allows the same unknown address in an ordinary message', () => {
    expect(validateSend(draft({ to: ['stranger@elsewhere.example'] }), [contact()], identities).ok).toBe(true)
  })

  it('only warns when replying inside a campaign conversation to someone who has since unsubscribed', () => {
    const check = validateSend(draft({ campaignId: 'cmp1', threadId: 't1' }), [contact({ subscription: 'unsubscribed' })], identities)
    expect(check.ok).toBe(true)
    expect(check.warnings).toHaveLength(1)
  })
})

describe('campaign start time', () => {
  it('converts a wall-clock time in the sending timezone to the right instant, in and out of daylight saving', () => {
    expect(zonedTimeToIso('2026-10-05', '09:00', 'Europe/London')).toBe('2026-10-05T08:00:00.000Z')
    expect(zonedTimeToIso('2026-12-01', '09:00', 'Europe/London')).toBe('2026-12-01T09:00:00.000Z')
    expect(zonedTimeToIso('2026-10-05', '09:00', 'Australia/Sydney')).toBe('2026-10-04T22:00:00.000Z')
    expect(zonedTimeToIso('2026-10-05', '09:00', 'UTC')).toBe('2026-10-05T09:00:00.000Z')
  })

  it('returns null for a cleared time, a malformed date, or an unknown timezone', () => {
    expect(zonedTimeToIso('2026-10-05', '', 'Europe/London')).toBeNull()
    expect(zonedTimeToIso('05/10/2026', '09:00', 'Europe/London')).toBeNull()
    expect(zonedTimeToIso('2026-13-45', '09:00', 'Europe/London')).toBeNull()
    expect(zonedTimeToIso('2026-10-05', '09:00', 'Mars/Olympus_Mons')).toBeNull()
  })

  it('describes a scheduled start in the campaign timezone', () => {
    const scheduled = { status: 'scheduled', recipients: [], identityIds: [], schedule: { startAt: '2026-10-05T08:00:00.000Z', timezone: 'Europe/London', windowStart: '09:00', windowEnd: '17:00', dailyLimit: 5 } } as unknown as Campaign
    expect(nextAction(scheduled, (iso, zone) => `${iso} in ${zone}`)).toBe('Starts 2026-10-05T08:00:00.000Z in Europe/London')
  })
})

describe('activity range', () => {
  it('leaves out events dated after now', () => {
    const now = new Date('2026-10-01T12:00:00Z').getTime()
    const event = (id: string, at: number): ActivityEvent => ({ id, at: new Date(at).toISOString(), kind: 'sent', domain: 'boltloop.co', identityId: 'lachlan@boltloop.co', email: 'a@b.example', campaignId: null, threadId: null, text: '' })
    const events = [event('past', now - 60_000), event('now', now), event('future', now + 86_400_000)]
    expect(filterEvents(events, { range: 'all', domain: '', kind: '', now }).map((e) => e.id)).toEqual(['past', 'now'])
  })
})

describe('accent and background boundaries', () => {
  it('picks button text that reaches 4.5:1 on every grey, including the mid-greys where white falls just short', () => {
    for (let v = 0; v <= 255; v += 3) {
      const bg: Rgb = [v, v, v]
      expect(contrast(bg, hexToRgb(onColor(bg))!)).toBeGreaterThanOrEqual(4.5)
    }
    expect(onColor(hexToRgb('#777777')!)).toBe('#000000')
  })

  it('accepts a base64 image within the size cap', () => {
    expect(appearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, bgImage: 'data:image/png;base64,' + 'A'.repeat(4000) }).success).toBe(true)
    expect(appearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, bgImage: 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil(MAX_BACKGROUND_IMAGE_BYTES / 3) * 4) }).success).toBe(true)
  })

  it('rejects a stored image that is oversized or not base64 image data', () => {
    expect(appearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, bgImage: 'data:image/png;base64,' + 'A'.repeat(MAX_BACKGROUND_IMAGE_BYTES * 2) }).success).toBe(false)
    expect(appearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, bgImage: 'data:image/svg+xml,<svg onload="x"/>' }).success).toBe(false)
  })
})

describe('csv boundaries', () => {
  const header = 'name,email,company,tags,consent\n'

  it('keeps a quote inside an unquoted field as written instead of silently dropping it', () => {
    expect(parseCsv('a"foo"@x.example,b')).toEqual([['a"foo"@x.example', 'b']])
    expect(parseCsv('x,"y, z"')).toEqual([['x', 'y, z']])
  })

  it('reads a file that starts with a byte-order mark', () => {
    expect(validateImport('﻿' + header + 'Ann,ann@x.example,X,,yes', new Set())).toMatchObject({ ok: true })
  })

  it('accepts exactly the maximum number of rows', () => {
    const result = validateImport(header + 'A,a@b.example,C,,yes\n'.repeat(MAX_IMPORT_ROWS), new Set())
    expect(result.ok && result.rows.length).toBe(MAX_IMPORT_ROWS)
  })
})

describe('previews and identities', () => {
  it('strips italic markup from one-line previews but leaves snake_case words alone', () => {
    expect(plainPreview('_Please review_ the **plan**')).toBe('Please review the plan')
    expect(plainPreview('rename snake_case_here today')).toBe('rename snake_case_here today')
  })

  it('does not read a domain out of an address with more than one @', () => {
    expect(identityDomain('x@boltloop.co@evil.example')).toBeNull()
    expect(identityDomain('no-at-sign')).toBeNull()
    expect(identityDomain('lachlan@boltloop.co')).toBe('boltloop.co')
  })
})
