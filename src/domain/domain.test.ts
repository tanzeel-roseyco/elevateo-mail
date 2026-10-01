import { describe, expect, it } from 'vitest'
import { countByKind, filterEvents, isRange, notifiableEvents, rangeStart, searchAll } from './activity'
import { ACCENT_PRESETS, CHROME_OPACITY_MIN, DEFAULT_APPEARANCE, resolveAppearance } from './appearance'
import { contrast, hexToRgb, mix, onColor, readableAccent, rgbToHex } from './color'
import { parseCsv, validateImport } from './csv'
import { defaultIdentities, defaultSettings, identityDomain, isOwnAddress } from './identities'
import { awaitingResponse, buildReply, inFolder, isMailFolder, lastMessage, threadMatches, type ThreadFilter } from './mail'
import { isSafeHref, parseInline, parseRichText, plainPreview } from './richText'
import { batchSize, campaignMetrics, contactMatches, isSendable, nextAction, percent, personalise, sendBlockReason, validateCampaignName, validateSend } from './rules'
import type { ActivityEvent, Campaign, Contact, Draft, Thread } from './schema'

const identities = defaultIdentities()
const contact = (over: Partial<Contact> = {}): Contact => ({ id: 'c1', name: 'Amara Abernathy', email: 'amara@northwind.example', company: 'Northwind Logistics', tags: ['Logistics'], consent: 'opted_in', consentSource: 'Form', subscription: 'subscribed', ...over })
const draft = (over: Partial<Draft> = {}): Draft => ({ id: 'd1', identityId: 'lachlan@boltloop.co', to: ['amara@northwind.example'], cc: [], bcc: [], subject: 'Hello', body: 'Body text', attachments: [], campaignId: null, threadId: null, banner: false, updatedAt: '2026-10-01T10:00:00.000Z', ...over })
const thread = (over: Partial<Thread> = {}): Thread => ({
  id: 't1', subject: 'Audit scope', folder: 'inbox', starred: false, unread: true, identityId: 'lachlan@flooda.co', campaignId: null,
  messages: [{ id: 'm1', from: { name: 'Priya Raman', email: 'priya@harbourgate.example' }, to: [{ name: 'Lachlan', email: 'lachlan@flooda.co' }], cc: [{ name: 'Ines', email: 'ines@harbourgate.example' }], body: 'Can we move the **readout**?', at: '2026-09-30T09:00:00.000Z', direction: 'in', attachments: [] }],
  ...over,
})
const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  id: 'cmp1', name: 'Audit offer', status: 'running', identityIds: ['lachlan@boltloop.co', 'l.macdonald@boltloop.co'], steps: [], unsubscribeFooter: 'footer', createdAt: '2026-09-01T00:00:00.000Z',
  schedule: { startAt: '2026-10-05T09:00:00.000Z', timezone: 'Europe/London', windowStart: '09:00', windowEnd: '17:00', dailyLimit: 2 },
  recipients: [
    { contactId: 'a', delivery: 'delivered', replied: true, unsubscribed: false, at: null },
    { contactId: 'b', delivery: 'bounced', replied: false, unsubscribed: false, at: null },
    { contactId: 'c', delivery: 'failed', replied: false, unsubscribed: false, at: null },
    { contactId: 'd', delivery: 'delivered', replied: false, unsubscribed: true, at: null },
    { contactId: 'e', delivery: 'skipped', replied: false, unsubscribed: false, at: null },
    { contactId: 'f', delivery: 'pending', replied: false, unsubscribed: false, at: null },
  ],
  ...over,
})
const fmt = (iso: string) => `on ${iso.slice(0, 10)}`

describe('send rules', () => {
  it('lets an opted-in subscribed contact receive campaigns and blocks every other state with a reason', () => {
    expect(isSendable(contact())).toBe(true)
    expect(sendBlockReason(contact({ subscription: 'unsubscribed' }))).toBe('unsubscribed')
    expect(sendBlockReason(contact({ subscription: 'bounced' }))).toMatch(/bounced/)
    expect(sendBlockReason(contact({ subscription: 'suppressed' }))).toMatch(/suppression/)
    expect(sendBlockReason(contact({ consent: 'unconfirmed' }))).toMatch(/consent/)
  })

  it('accepts a complete draft', () => {
    expect(validateSend(draft(), [contact()], identities)).toEqual({ ok: true, errors: [], warnings: [] })
  })

  it('reports every missing required field', () => {
    const check = validateSend(draft({ to: [], subject: ' ', body: '', identityId: 'nobody@nowhere.test' }), [], identities)
    expect(check.ok).toBe(false)
    expect(check.errors.map((e) => e.field)).toEqual(['from', 'to', 'subject', 'body'])
  })

  it('rejects malformed addresses in any recipient field', () => {
    const check = validateSend(draft({ cc: ['not-an-email'] }), [], identities)
    expect(check.errors).toEqual([{ field: 'to', message: '“not-an-email” is not a valid email address.' }])
  })

  it('blocks a campaign-linked send to an unsubscribed contact but only warns for an ordinary message', () => {
    const contacts = [contact({ subscription: 'unsubscribed' })]
    const blocked = validateSend(draft({ campaignId: 'cmp1' }), contacts, identities)
    expect(blocked.ok).toBe(false)
    expect(blocked.errors[0]?.message).toContain('cannot receive campaign emails')
    const ordinary = validateSend(draft(), contacts, identities)
    expect(ordinary.ok).toBe(true)
    expect(ordinary.warnings).toHaveLength(1)
  })
})

describe('campaign rules', () => {
  it('counts delivery outcomes without treating delivered as read', () => {
    expect(campaignMetrics(campaign())).toEqual({ total: 6, sent: 4, delivered: 2, bounced: 1, failed: 1, pending: 1, skipped: 1, replies: 1, unsubscribes: 1 })
  })

  it('handles an empty audience', () => {
    expect(campaignMetrics(campaign({ recipients: [] })).total).toBe(0)
    expect(percent(0, 0)).toBe('—')
    expect(percent(1, 4)).toBe('25%')
  })

  it('describes the next simulated action for each status', () => {
    expect(nextAction(campaign({ status: 'draft' }), fmt)).toMatch(/Finish setup/)
    expect(nextAction(campaign({ status: 'scheduled' }), fmt)).toBe('Starts on 2026-10-05')
    expect(nextAction(campaign(), fmt)).toBe('Next batch: up to 1 recipients')
    expect(nextAction(campaign({ recipients: [] }), fmt)).toBe('Finishing')
    expect(nextAction(campaign({ status: 'paused' }), fmt)).toBe('Paused with 1 remaining')
    expect(nextAction(campaign({ status: 'completed' }), fmt)).toBe('No further sends')
  })

  it('sizes a batch as daily limit × identities, never below one', () => {
    expect(batchSize(campaign())).toBe(4)
    expect(batchSize(campaign({ identityIds: [], schedule: { ...campaign().schedule, dailyLimit: 0 } }))).toBe(1)
  })

  it('personalises placeholders and leaves unknown ones visible', () => {
    expect(personalise('Hi {{first_name}} at {{company}} {{role}}', contact())).toBe('Hi Amara at Northwind Logistics {{role}}')
  })

  it('validates campaign names', () => {
    expect(validateCampaignName('  ', [])).toMatch(/name/)
    expect(validateCampaignName('x'.repeat(121), [])).toMatch(/120/)
    expect(validateCampaignName('audit OFFER', [campaign()])).toMatch(/already exists/)
    expect(validateCampaignName('New one', [campaign()])).toBeNull()
  })

  it('matches contacts on name, email, company, and tag', () => {
    expect(contactMatches(contact(), 'northwind')).toBe(true)
    expect(contactMatches(contact(), 'LOGISTICS')).toBe(true)
    expect(contactMatches(contact(), '')).toBe(true)
    expect(contactMatches(contact(), 'zzz')).toBe(false)
  })
})

describe('mail views', () => {
  const filter = (over: Partial<ThreadFilter> = {}): ThreadFilter => ({ folder: 'inbox', q: '', domain: '', identityId: '', unread: false, campaign: '', ...over })
  const replied = thread({ id: 't2', folder: 'archive', unread: false, starred: true, campaignId: 'cmp1', identityId: 'lachlan@boltloop.co', messages: [...thread().messages, { id: 'm2', from: { name: 'Lachlan', email: 'lachlan@boltloop.co' }, to: [{ name: 'Priya Raman', email: 'priya@harbourgate.example' }], cc: [], body: 'Yes', at: '2026-09-30T10:00:00.000Z', direction: 'out', attachments: [] }] })

  it('recognises folder names', () => {
    expect(isMailFolder('starred')).toBe(true)
    expect(isMailFolder('junk')).toBe(false)
    expect(isMailFolder(undefined)).toBe(false)
  })

  it('treats starred, sent, and drafts as views rather than storage folders', () => {
    expect(inFolder(replied, 'archive')).toBe(true)
    expect(inFolder(replied, 'starred')).toBe(true)
    expect(inFolder(replied, 'sent')).toBe(true)
    expect(inFolder(thread(), 'sent')).toBe(false)
    expect(inFolder(replied, 'drafts')).toBe(false)
    expect(inFolder({ ...replied, folder: 'trash' }, 'starred')).toBe(false)
    expect(inFolder({ ...replied, folder: 'spam' }, 'sent')).toBe(false)
  })

  it('applies unread, domain, address, campaign, and text filters together', () => {
    expect(threadMatches(thread(), filter())).toBe(true)
    expect(threadMatches({ ...thread(), unread: false }, filter({ unread: true }))).toBe(false)
    expect(threadMatches(thread(), filter({ domain: 'boltloop.co' }))).toBe(false)
    expect(threadMatches(thread(), filter({ domain: 'flooda.co', identityId: 'lachlan@flooda.co' }))).toBe(true)
    expect(threadMatches(thread(), filter({ identityId: 'l.macdonald@flooda.co' }))).toBe(false)
    expect(threadMatches(thread(), filter({ campaign: 'any' }))).toBe(false)
    expect(threadMatches(thread(), filter({ campaign: 'none' }))).toBe(true)
    expect(threadMatches(replied, filter({ folder: 'archive', campaign: 'none' }))).toBe(false)
    expect(threadMatches(replied, filter({ folder: 'archive', campaign: 'cmp1' }))).toBe(true)
    expect(threadMatches(replied, filter({ folder: 'archive', campaign: 'other' }))).toBe(false)
  })

  it('searches subject, sender, recipient, and body', () => {
    for (const q of ['audit', 'PRIYA', 'ines@harbourgate', 'readout']) expect(threadMatches(thread(), filter({ q }))).toBe(true)
    expect(threadMatches(thread(), filter({ q: 'nothing-here' }))).toBe(false)
  })

  it('lists inbox conversations where the other side spoke last', () => {
    expect(awaitingResponse([thread(), { ...replied, folder: 'inbox' }]).map((t) => t.id)).toEqual(['t1'])
  })

  it('fails loudly on a thread with no messages', () => {
    expect(() => lastMessage({ ...thread(), messages: [] })).toThrow(/no messages/)
  })

  it('replies from the identity that received the message', () => {
    const reply = buildReply(thread(), 'reply', identities, fmt)
    expect(reply).toMatchObject({ identityId: 'lachlan@flooda.co', to: ['priya@harbourgate.example'], cc: [], subject: 'Re: Audit scope', threadId: 't1' })
  })

  it('reply-all copies other external recipients but never our own addresses', () => {
    expect(buildReply(thread(), 'replyAll', identities, fmt).cc).toEqual(['ines@harbourgate.example'])
  })

  it('replies to the original recipients when we spoke last, without stacking Re: prefixes', () => {
    const reply = buildReply({ ...replied, subject: 'RE: Audit scope' }, 'reply', identities, fmt)
    expect(reply.to).toEqual(['priya@harbourgate.example'])
    expect(reply.subject).toBe('RE: Audit scope')
  })

  it('forwards as a new ordinary conversation quoting the last message', () => {
    const forward = buildReply({ ...thread(), campaignId: 'cmp1' }, 'forward', identities, fmt)
    expect(forward).toMatchObject({ to: [], threadId: null, campaignId: null, subject: 'Fwd: Audit scope' })
    expect(forward.body).toContain('Forwarded message')
    expect(forward.body).toContain('Can we move the **readout**?')
  })
})

describe('activity', () => {
  const now = new Date('2026-10-01T12:00:00').getTime()
  const event = (over: Partial<ActivityEvent>): ActivityEvent => ({ id: 'e', at: new Date(now - 3_600_000).toISOString(), kind: 'sent', domain: 'boltloop.co', identityId: 'lachlan@boltloop.co', email: 'a@b.example', campaignId: null, threadId: null, text: '', ...over })
  const events = [event({ id: '1' }), event({ id: '2', kind: 'reply', domain: 'flooda.co' }), event({ id: '3', kind: 'failed', at: new Date(now - 10 * 86_400_000).toISOString() }), event({ id: '4', kind: 'campaign', text: 'Campaign completed' }), event({ id: '5', kind: 'campaign', text: 'Campaign started' }), event({ id: '6', kind: 'bounce' })]

  it('computes range starts', () => {
    expect(rangeStart('all', now)).toBe(0)
    expect(rangeStart('7d', now)).toBe(now - 7 * 86_400_000)
    expect(rangeStart('30d', now)).toBe(now - 30 * 86_400_000)
    expect(new Date(rangeStart('today', now)).getHours()).toBe(0)
    expect(isRange('7d')).toBe(true)
    expect(isRange('1y')).toBe(false)
  })

  it('filters by range, domain, and kind', () => {
    expect(filterEvents(events, { range: '7d', domain: '', kind: '', now })).toHaveLength(5)
    expect(filterEvents(events, { range: 'all', domain: 'flooda.co', kind: '', now }).map((e) => e.id)).toEqual(['2'])
    expect(filterEvents(events, { range: '30d', domain: '', kind: 'failed', now }).map((e) => e.id)).toEqual(['3'])
    expect(filterEvents([], { range: 'all', domain: '', kind: '', now })).toEqual([])
  })

  it('counts events per kind', () => {
    expect(countByKind(events)).toMatchObject({ sent: 1, reply: 1, failed: 1, campaign: 2, bounce: 1, delivered: 0 })
  })

  it('surfaces only the notification types that are switched on', () => {
    expect(notifiableEvents(events, { replies: true, failures: true, completion: true }).map((e) => e.id)).toEqual(['2', '3', '4', '6'])
    expect(notifiableEvents(events, { replies: false, failures: false, completion: false })).toEqual([])
  })

  it('groups search results and ignores trash and one-letter queries', () => {
    const data = { threads: [thread(), thread({ id: 'gone', folder: 'trash' })], contacts: [contact({ name: 'Audit Person' })], campaigns: [campaign()] }
    const results = searchAll(data, 'audit')
    expect(results.threads.map((t) => t.id)).toEqual(['t1'])
    expect(results.contacts).toHaveLength(1)
    expect(results.campaigns).toHaveLength(1)
    expect(results.total).toBe(3)
    expect(searchAll(data, 'a').total).toBe(0)
  })
})

describe('identities', () => {
  it('provides nine identities across three domains with no banner forced on', () => {
    expect(identities).toHaveLength(9)
    expect(new Set(identities.map((i) => i.domain)).size).toBe(3)
    expect(identities.every((i) => i.banner === false)).toBe(true)
  })

  it('derives domains and recognises own addresses case-insensitively', () => {
    expect(identityDomain('lachlan@flooda.co')).toBe('flooda.co')
    expect(identityDomain('someone@elsewhere.example')).toBeNull()
    expect(isOwnAddress('Lachlan@Boltloop.co', identities)).toBe(true)
    expect(isOwnAddress('priya@harbourgate.example', identities)).toBe(false)
    expect(identities.some((i) => i.id === defaultSettings('2026-01-01T00:00:00.000Z').defaultIdentityId)).toBe(true)
  })
})

describe('colour and appearance', () => {
  const rgb = (hex: string) => hexToRgb(hex)!

  it('parses hex colours and rejects invalid input', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('2563eb')).toEqual([37, 99, 235])
    expect(hexToRgb('blue')).toBeNull()
    expect(rgbToHex(mix([0, 0, 0], [255, 255, 255], 1))).toBe('#ffffff')
  })

  it('computes WCAG contrast', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0)
    expect(onColor(rgb('#2563eb'))).toBe('#ffffff')
    expect(onColor(rgb('#fde047'))).not.toBe('#ffffff')
  })

  it('makes a pale accent readable on light and dark surfaces', () => {
    for (const surface of ['#ffffff', '#181b20']) {
      const adjusted = readableAccent(rgb('#fde047'), rgb(surface))
      expect(contrast(rgb(adjusted), rgb(surface))).toBeGreaterThanOrEqual(4.5)
    }
    expect(readableAccent(rgb('#1d4ed8'), rgb('#ffffff'))).toBe('#1d4ed8')
  })

  it('keeps accent text at AA contrast for every preset in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      const surface = rgb(theme === 'light' ? '#ffffff' : '#181b20')
      for (const preset of ACCENT_PRESETS) {
        const { vars } = resolveAppearance({ ...DEFAULT_APPEARANCE, theme, accent: preset.value }, false)
        expect(contrast(rgb(vars['--accent-text']!), mix(surface, rgb(preset.value), 0.14))).toBeGreaterThanOrEqual(4.5)
        expect(contrast(rgb(vars['--accent-fg']!), rgb(preset.value))).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('follows the system theme, clamps overlay strength, and falls back from a bad accent', () => {
    expect(resolveAppearance(DEFAULT_APPEARANCE, true).theme).toBe('dark')
    expect(resolveAppearance(DEFAULT_APPEARANCE, false).theme).toBe('light')
    const resolved = resolveAppearance({ ...DEFAULT_APPEARANCE, chromeOpacity: 10, accent: 'nope', bgColor: '#e8eef6' }, false)
    expect(resolved.vars['--chrome-opacity']).toBe(`${CHROME_OPACITY_MIN}%`)
    expect(resolved.vars['--accent']).toBe(DEFAULT_APPEARANCE.accent)
    expect(resolved.vars['--bg']).toBe('#e8eef6')
    expect(resolveAppearance(DEFAULT_APPEARANCE, false).vars['--bg']).toBe('')
  })

  it('keeps sidebar text readable at the minimum overlay strength over any background', () => {
    // Worst cases: light chrome over a black image, dark chrome over a white image.
    const cases = [{ surface: '#ffffff', fg: '#171a1f', behind: '#000000' }, { surface: '#181b20', fg: '#e9ebee', behind: '#ffffff' }]
    for (const c of cases) {
      const blended = mix(rgb(c.behind), rgb(c.surface), CHROME_OPACITY_MIN / 100)
      expect(contrast(rgb(c.fg), blended)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('csv import', () => {
  it('parses quoted fields, escaped quotes, CRLF, and skips blank lines', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n\n1,2')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['1', '2']])
    expect(parseCsv('')).toEqual([])
  })

  it('rejects empty files, missing columns, header-only files, and oversized files', () => {
    expect(validateImport('', new Set())).toEqual({ ok: false, error: 'The file is empty.' })
    expect(validateImport('name,email\nA,a@b.example', new Set())).toMatchObject({ ok: false, error: expect.stringContaining('company, tags, consent') })
    expect(validateImport('name,email,company,tags,consent', new Set())).toMatchObject({ ok: false })
    const big = 'name,email,company,tags,consent\n' + 'A,a@b.example,C,,yes\n'.repeat(2001)
    expect(validateImport(big, new Set())).toMatchObject({ ok: false, error: expect.stringContaining('Too many rows') })
  })

  it('flags invalid, duplicate, existing, nameless, and non-consenting rows per line', () => {
    const csv = ['Name,Email,Company,Tags,Consent', 'Ann Lee,ANN@x.example,X Co,SaaS;Q4,yes', 'Bob,bob[at]x.example,X,,yes', ',noname@x.example,X,,yes', 'Cy,cy@x.example,X,,no', 'Ann Again,ann@x.example,X,,yes', 'Old,old@x.example,X,,yes', 'Nomail,,X,,yes'].join('\n')
    const result = validateImport(csv, new Set(['old@x.example']))
    if (!result.ok) throw new Error('expected rows')
    expect(result.rows.map((r) => r.errors)).toEqual([[], ['Email is not valid'], ['Name is missing'], ['No opt-in consent recorded'], ['Duplicate within this file'], ['Already in contacts'], ['Email is missing']])
    expect(result.rows[0]).toMatchObject({ line: 2, email: 'ann@x.example', tags: ['SaaS', 'Q4'], consent: 'opted_in' })
  })
})

describe('rich text', () => {
  it('parses bold, italic, and links into nodes', () => {
    expect(parseInline('a **b** _c_ [d](https://e.example) f')).toEqual([
      { kind: 'text', text: 'a ' }, { kind: 'bold', text: 'b' }, { kind: 'text', text: ' ' }, { kind: 'italic', text: 'c' }, { kind: 'text', text: ' ' }, { kind: 'link', text: 'd', href: 'https://e.example' }, { kind: 'text', text: ' f' },
    ])
  })

  it('never produces a clickable link for unsafe schemes', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
    expect(isSafeHref('mailto:a@b.example')).toBe(true)
    expect(parseInline('[x](javascript:alert(1))').every((n) => n.kind === 'text')).toBe(true)
  })

  it('does not italicise snake_case words', () => {
    expect(parseInline('first_name and last_name')).toEqual([{ kind: 'text', text: 'first_name and last_name' }])
  })

  it('splits paragraphs and lists, and handles empty input', () => {
    const blocks = parseRichText('Hello\nworld\n\n- one\n- two\n\n\n')
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list'])
    expect(parseRichText('')).toEqual([])
  })

  it('builds a plain, truncated preview', () => {
    expect(plainPreview('**Hi** [there](https://x.example)\nfriend')).toBe('Hi there friend')
    expect(plainPreview('x'.repeat(200), 10)).toHaveLength(10)
  })
})
