import { DEFAULT_UNSUBSCRIBE_FOOTER, defaultDomains, defaultIdentities, defaultSettings, LOCAL_PARTS } from '@/domain/identities'
import { isSendable, personalise } from '@/domain/rules'
import type { ActivityEvent, Address, Attachment, Campaign, CampaignStatus, Contact, Data, DomainName, EventKind, Message, StoredFolder, Thread } from '@/domain/schema'

// AIDEV-NOTE: Deterministic fictional dataset (~840 opted-in CEO contacts). All people and companies are invented;
// addresses use the reserved .example TLD so nothing here can be a real mailbox.

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Small seeded PRNG so the dataset is identical on every first load and in tests. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = ['Amara', 'Benedikt', 'Chiara', 'Dmitri', 'Eleni', 'Farid', 'Greta', 'Hamza', 'Ingrid', 'Jonas', 'Keiko', 'Lucian', 'Mirela', 'Nikhil', 'Oksana', 'Pablo', 'Quentin', 'Rosalind', 'Stellan', 'Tamsin', 'Uma', 'Viktor', 'Wren', 'Xavier', 'Yusuf', 'Zofia', 'Anselm', 'Brigid']
const LAST = ['Abernathy', 'Bergstrom', 'Castellanos', 'Drummond', 'Eriksen', 'Fontaine', 'Galloway', 'Hartigan', 'Iwasaki', 'Jankowski', 'Kovalenko', 'Lindqvist', 'Marchetti', 'Novak', 'Oyelaran', 'Pemberton', 'Quigley', 'Rahimi', 'Sorensen', 'Thackeray', 'Ueda', 'Vasquez', 'Whitcombe', 'Yamada', 'Zielinski', 'Ashdown', 'Brennan', 'Coelho', 'Dalgaard', 'Ekwueme']
const COMPANY_PREFIX = ['Northwind', 'Harbourgate', 'Kestrel', 'Lumen', 'Meridian', 'Oakline', 'Pinecrest', 'Quarry', 'Redfern', 'Silverbirch', 'Tidewater', 'Upland', 'Vantage', 'Westmark', 'Yarrow', 'Alder', 'Brightwell', 'Cinder', 'Dovetail', 'Everfield', 'Foxglove', 'Granite', 'Highmoor', 'Ironbridge', 'Juniper', 'Kingsway', 'Larkspur', 'Millrace', 'Netherby', 'Orchard']
const COMPANY_SUFFIX: Array<[string, string]> = [
  ['Logistics', 'Logistics'], ['Freight', 'Logistics'], ['Capital', 'Fintech'], ['Payments', 'Fintech'], ['Health', 'Healthcare'], ['Clinics', 'Healthcare'], ['Retail Group', 'Retail'],
  ['Outfitters', 'Retail'], ['Systems', 'SaaS'], ['Software', 'SaaS'], ['Cloud', 'SaaS'], ['Analytics', 'SaaS'], ['Manufacturing', 'Manufacturing'], ['Foundry', 'Manufacturing'],
  ['Robotics', 'Manufacturing'], ['Insurance', 'Fintech'], ['Pharma', 'Healthcare'], ['Foods', 'Retail'], ['Supply Co', 'Logistics'], ['Marine', 'Logistics'], ['Labs', 'SaaS'],
  ['Ventures', 'Fintech'], ['Textiles', 'Manufacturing'], ['Energy', 'Manufacturing'], ['Mobility', 'Logistics'], ['Networks', 'SaaS'], ['Biotech', 'Healthcare'], ['Markets', 'Retail'],
]
const CONSENT_SOURCES = ['Webinar sign-up form', 'Newsletter opt-in', 'Event badge scan with consent', 'Inbound enquiry form']

function buildContacts(rand: () => number): Contact[] {
  const used = new Set<string>()
  return Array.from({ length: 840 }, (_, i): Contact => {
    const first = FIRST[i % FIRST.length]!
    const last = LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]!
    const prefix = COMPANY_PREFIX[i % COMPANY_PREFIX.length]!
    const [suffix, industry] = COMPANY_SUFFIX[Math.floor(i / COMPANY_PREFIX.length) % COMPANY_SUFFIX.length]!
    const company = `${prefix} ${suffix}`
    const host = `${company.toLowerCase().replace(/[^a-z]+/g, '-')}.example`
    let email = `${first}.${last}@${host}`.toLowerCase()
    if (used.has(email)) email = `${first}.${last}${i}@${host}`.toLowerCase()
    used.add(email)
    return {
      id: `c-${i + 1}`,
      name: `${first} ${last}`,
      email,
      company,
      tags: rand() < 0.15 ? [industry, 'Q4 priority'] : [industry],
      // A few imported records lack recorded opt-in; they must be excluded from campaigns.
      consent: i % 70 === 5 ? 'unconfirmed' : 'opted_in',
      consentSource: i % 70 === 5 ? 'Legacy import — no opt-in record' : CONSENT_SOURCES[i % CONSENT_SOURCES.length]!,
      subscription: i % 210 === 17 ? 'suppressed' : 'subscribed',
    }
  })
}

interface CampaignSpec {
  id: string
  name: string
  domain: DomainName
  status: CampaignStatus
  size: number
  processed: number
  /** Sending window, in days before "now". */
  fromDaysAgo: number
  toDaysAgo: number
  subject: string
  body: string
  followUp?: { subject: string; body: string; delayDays: number }
}

const SPECS: CampaignSpec[] = [
  {
    id: 'cmp-elevateo-cohort', name: 'Elevateo — Spring leadership cohort invitation', domain: 'elevateoco.com', status: 'completed', size: 200, processed: 200, fromDaysAgo: 27, toDaysAgo: 19,
    subject: 'An invitation for {{company}}: spring leadership cohort',
    body: 'Hi {{first_name}},\n\nWe are opening twelve places on the spring leadership cohort and I would like to hold one for {{company}}.\n\nThe programme covers:\n- Running a leadership team through rapid growth\n- Board communication under pressure\n- Succession planning that people trust\n\nWould a short call next week be useful?',
    followUp: { delayDays: 4, subject: 'Re: An invitation for {{company}}: spring leadership cohort', body: 'Hi {{first_name}},\n\nA quick follow-up in case my earlier note was buried. Three places remain on the spring cohort.\n\nHappy to send the outline if that is easier than a call.' },
  },
  {
    id: 'cmp-boltloop-audit', name: 'Boltloop — Q4 automation audit offer', domain: 'boltloop.co', status: 'running', size: 240, processed: 150, fromDaysAgo: 6, toDaysAgo: 0.15,
    subject: 'A two-week automation audit for {{company}}',
    body: 'Hi {{first_name}},\n\nYou asked to hear from us when the Q4 audit slots opened. We have capacity for **six** audits before year end.\n\nIn two weeks we map the manual work across your operations team and return a ranked list of what to automate first, with estimated hours saved.\n\nIs this worth a 20-minute conversation?',
    followUp: { delayDays: 5, subject: 'Re: A two-week automation audit for {{company}}', body: 'Hi {{first_name}},\n\nFollowing up on the audit. I have attached nothing and will keep this short: two slots are left for November.\n\nShall I pencil one in for {{company}}?' },
  },
  {
    id: 'cmp-flooda-insurers', name: 'Flooda — Insurer partnership intro', domain: 'flooda.co', status: 'running', size: 100, processed: 70, fromDaysAgo: 4, toDaysAgo: 0.3,
    subject: 'Property-level flood scores for {{company}}',
    body: 'Hi {{first_name}},\n\nFlooda now publishes property-level flood-risk scores refreshed weekly. Several underwriting teams use them to price renewals.\n\nI can share a sample for a postcode district of your choosing. Which one would be most useful?',
  },
  {
    id: 'cmp-boltloop-casestudy', name: 'Boltloop — Case study follow-up', domain: 'boltloop.co', status: 'paused', size: 120, processed: 60, fromDaysAgo: 12, toDaysAgo: 9,
    subject: 'How a 40-person ops team removed 310 hours of manual work a month',
    body: 'Hi {{first_name}},\n\nWe have just published a case study I think is relevant to {{company}}: a 40-person operations team that removed 310 hours of manual work a month.\n\nYou can [read the case study](https://boltloop.co/case-studies/ops-automation).\n\nWould a similar review be useful for your team?',
  },
  {
    id: 'cmp-flooda-report', name: 'Flooda — 2027 flood-risk report launch', domain: 'flooda.co', status: 'scheduled', size: 180, processed: 0, fromDaysAgo: 0, toDaysAgo: 0,
    subject: 'The 2027 flood-risk report is ready for {{company}}',
    body: 'Hi {{first_name}},\n\nOur 2027 flood-risk report is published next week. As a subscriber you get it 48 hours early.\n\nReply to this email and I will send your copy.',
    followUp: { delayDays: 6, subject: 'Re: The 2027 flood-risk report is ready for {{company}}', body: 'Hi {{first_name}},\n\nThe report is now public. If it would help, I can walk your team through the sections relevant to {{company}}.' },
  },
  {
    id: 'cmp-elevateo-roundtable', name: 'Elevateo — Board advisory roundtable', domain: 'elevateoco.com', status: 'draft', size: 0, processed: 0, fromDaysAgo: 0, toDaysAgo: 0,
    subject: 'A seat at the board advisory roundtable',
    body: 'Hi {{first_name}},\n\nWe are convening a small roundtable of chief executives in January.',
  },
]

const REPLIES = [
  'Thanks for reaching out. This is timely — we were discussing exactly this at our leadership offsite. Could you send over some times next week?',
  'Appreciate the note. I am travelling until the 14th; can we pick this up when I am back?',
  'Interesting. What would the commitment look like from our side, and who else would need to be involved?',
  'Yes, worth a conversation. Please loop in my chief of staff, who manages my diary.',
  'Could you share pricing and a couple of references before we speak?',
  'Not the right moment for us this quarter, but please check in again in the new year.',
]

export function createSeed(now: number): Data {
  const rand = mulberry32(20261001)
  const iso = (msAgo: number) => new Date(now - Math.max(msAgo, 60_000)).toISOString()
  const identities = defaultIdentities()
  const contacts = buildContacts(rand)
  const events: ActivityEvent[] = []
  const threads: Thread[] = []
  let eventSeq = 0

  const addEvent = (kind: EventKind, msAgo: number, identityId: string, domain: DomainName, email: string, campaignId: string | null, threadId: string | null, text = '') => {
    events.push({ id: `e-${++eventSeq}`, at: iso(msAgo), kind, domain, identityId, email, campaignId, threadId, text })
  }

  // Shuffled once; each campaign walks it from a different offset so audiences overlap realistically.
  const order = contacts.map((_, i) => i).sort(() => rand() - 0.5)
  let offset = 0

  const campaigns = SPECS.map((spec): Campaign => {
    const identityIds = LOCAL_PARTS.map((local) => `${local}@${spec.domain}`)
    const audience: Contact[] = []
    for (let step = 0; audience.length < spec.size && step < order.length; step++) {
      const contact = contacts[order[(offset + step) % order.length]!]!
      // Checked at pick time, so earlier bounces/unsubscribes exclude a contact from later campaigns.
      if (isSendable(contact)) audience.push(contact)
    }
    offset += 97

    const recipients = audience.map((contact, j) => {
      if (j >= spec.processed) return { contactId: contact.id, delivery: 'pending' as const, replied: false, unsubscribed: false, at: null }
      const identityId = identityIds[j % identityIds.length]!
      const span = (spec.fromDaysAgo - spec.toDaysAgo) * DAY
      const sentAgo = spec.fromDaysAgo * DAY - (span * j) / Math.max(1, spec.processed)
      const roll = rand()
      // Fixed indexes guarantee every outcome exists in the demo data regardless of the random rolls.
      const delivery = j === 3 || roll < 0.025 ? ('bounced' as const) : j === 7 || roll < 0.035 ? ('failed' as const) : ('delivered' as const)
      const replied = delivery === 'delivered' && (j === 1 || rand() < 0.09)
      const unsubscribed = delivery === 'delivered' && !replied && (j === 11 || rand() < 0.02)

      addEvent('sent', sentAgo, identityId, spec.domain, contact.email, spec.id, null)
      if (delivery === 'delivered') addEvent('delivered', sentAgo - 60_000, identityId, spec.domain, contact.email, spec.id, null)
      if (delivery === 'bounced') {
        addEvent('bounce', sentAgo - 90_000, identityId, spec.domain, contact.email, spec.id, null)
        contact.subscription = 'bounced'
      }
      if (delivery === 'failed') addEvent('failed', sentAgo - 30_000, identityId, spec.domain, contact.email, spec.id, null)
      if (unsubscribed) {
        addEvent('unsubscribe', sentAgo - (2 + rand() * 20) * HOUR, identityId, spec.domain, contact.email, spec.id, null)
        contact.subscription = 'unsubscribed'
      }
      if (replied) {
        const replyAgo = sentAgo - (2 + rand() * 28) * HOUR
        const threadId = `t-${spec.id}-${j}`
        const identity = identities.find((i) => i.id === identityId)!
        const recent = replyAgo < 3 * DAY
        threads.push({
          id: threadId,
          subject: personalise(spec.subject, contact),
          folder: !recent && replyAgo > 14 * DAY && rand() < 0.5 ? 'archive' : 'inbox',
          starred: rand() < 0.08,
          unread: recent && rand() < 0.65,
          identityId,
          campaignId: spec.id,
          messages: [
            { id: `${threadId}-m1`, from: { name: identity.displayName, email: identityId }, to: [{ name: contact.name, email: contact.email }], cc: [], body: personalise(spec.body, contact), at: iso(sentAgo), direction: 'out', attachments: [], signature: identity.signature, unsubscribeFooter: DEFAULT_UNSUBSCRIBE_FOOTER },
            { id: `${threadId}-m2`, from: { name: contact.name, email: contact.email }, to: [{ name: identity.displayName, email: identityId }], cc: [], body: REPLIES[j % REPLIES.length]!, at: iso(replyAgo), direction: 'in', attachments: [] },
          ],
        })
        addEvent('reply', replyAgo, identityId, spec.domain, contact.email, spec.id, threadId)
      }
      return { contactId: contact.id, delivery, replied, unsubscribed, at: iso(sentAgo) }
    })

    const sender = identityIds[0]!
    const createdAgo = (spec.fromDaysAgo + 2) * DAY
    addEvent('campaign', createdAgo, sender, spec.domain, '', spec.id, null, 'Campaign created')
    if (spec.processed > 0) addEvent('campaign', spec.fromDaysAgo * DAY + HOUR, sender, spec.domain, '', spec.id, null, 'Campaign started')
    if (spec.status === 'paused') addEvent('campaign', spec.toDaysAgo * DAY - HOUR, sender, spec.domain, '', spec.id, null, 'Campaign paused')
    if (spec.status === 'completed') addEvent('campaign', spec.toDaysAgo * DAY - HOUR, sender, spec.domain, '', spec.id, null, 'Campaign completed')
    if (spec.status === 'scheduled') addEvent('campaign', DAY, sender, spec.domain, '', spec.id, null, 'Campaign scheduled')

    return {
      id: spec.id,
      name: spec.name,
      status: spec.status,
      identityIds,
      steps: [
        { id: `${spec.id}-s1`, subject: spec.subject, body: spec.body, delayDays: 0 },
        ...(spec.followUp ? [{ id: `${spec.id}-s2`, ...spec.followUp }] : []),
      ],
      recipients,
      schedule: {
        startAt: spec.status === 'scheduled' ? new Date(now + 2 * DAY).toISOString() : iso(spec.fromDaysAgo * DAY + HOUR),
        timezone: 'Europe/London',
        windowStart: '09:00',
        windowEnd: '17:00',
        dailyLimit: 40,
      },
      unsubscribeFooter: DEFAULT_UNSUBSCRIBE_FOOTER,
      createdAt: iso(createdAgo),
    }
  })

  threads.push(...ordinaryThreads(iso))
  events.sort((a, b) => b.at.localeCompare(a.at))

  return {
    version: 1,
    threads,
    drafts: [
      {
        id: 'd-seed-1', identityId: 'lachlan.macdonald@elevateoco.com', to: ['rosalind.fontaine@kestrel-capital.example'], cc: [], bcc: [],
        subject: 'Agenda for the January roundtable', body: 'Hi Rosalind,\n\nHere is the draft agenda. Still to confirm:\n- Venue\n- Dinner speaker', attachments: [],
        campaignId: null, threadId: null, banner: false, updatedAt: iso(5 * HOUR),
      },
    ],
    contacts,
    campaigns,
    events,
    identities,
    domains: defaultDomains(),
    settings: defaultSettings(new Date(now - 2 * DAY).toISOString()),
  }
}

/** Hand-written non-campaign conversations covering long subjects, attachments, multi-message threads and spam. */
function ordinaryThreads(iso: (msAgo: number) => string): Thread[] {
  const me = (identityId: string): Address => ({ name: 'Lachlan Macdonald', email: identityId })
  const file = (name: string, sizeBytes: number): Attachment => ({ id: `a-${name}`, name, sizeBytes })
  let seq = 0
  const thread = (subject: string, identityId: string, folder: StoredFolder, flags: { unread?: boolean; starred?: boolean }, messages: Array<Omit<Message, 'id' | 'cc'> & { cc?: Address[] }>): Thread => {
    const id = `t-ord-${++seq}`
    return { id, subject, folder, identityId, campaignId: null, unread: flags.unread ?? false, starred: flags.starred ?? false, messages: messages.map((m, i) => ({ cc: [], ...m, id: `${id}-m${i + 1}` })) }
  }
  const priya: Address = { name: 'Priya Raman', email: 'priya.raman@harbourgate-capital.example' }
  const tomasz: Address = { name: 'Tomasz Wieczorek', email: 'tomasz@riverline-underwriting.example' }
  const dana: Address = { name: 'Dana Okafor', email: 'dana.okafor@summit-events.example' }
  const accounts: Address = { name: 'Fieldhouse Accounts', email: 'accounts@fieldhouse-studio.example' }
  const bolt = 'lachlan@boltloop.co'
  const flooda = 'lachlan.macdonald@flooda.co'
  const elev = 'l.macdonald@elevateoco.com'

  return [
    thread('Follow-up on the automation audit scope, the revised timeline, and the three open questions from Thursday’s steering call', bolt, 'inbox', { unread: true }, [
      { from: priya, to: [me(bolt)], body: 'Hi Lachlan,\n\nThanks for Thursday. I have three open questions before we sign off the scope:\n- Does the audit include the finance close process?\n- Who owns the data-access request on your side?\n- Can the readout move to the week of the 21st?', at: iso(2 * DAY + 5 * HOUR), direction: 'in', attachments: [] },
      { from: me(bolt), to: [priya], cc: [{ name: 'Ines Halloran', email: 'ines.halloran@harbourgate-capital.example' }], body: 'Hi Priya,\n\nYes to finance close, and I will own the data-access request. The 21st works.\n\nRevised scope to follow.', at: iso(2 * DAY), direction: 'out', attachments: [], signature: 'Lachlan Macdonald\nBoltloop\nlachlan@boltloop.co' },
      { from: priya, to: [me(bolt)], cc: [{ name: 'Ines Halloran', email: 'ines.halloran@harbourgate-capital.example' }], body: 'Perfect. Revised scope and timeline attached — please confirm and we will countersign this week.', at: iso(3 * HOUR), direction: 'in', attachments: [file('Audit-scope-v3.pdf', 482_000), file('Revised-timeline.xlsx', 96_400)] },
    ]),
    thread('Speaking slot at the March leadership summit?', elev, 'inbox', { unread: true, starred: true }, [
      { from: dana, to: [me(elev)], body: 'Hello Lachlan,\n\nWe would love to have you on the opening panel at the March summit. The brief is attached. Could you let me know by Friday?', at: iso(7 * HOUR), direction: 'in', attachments: [file('Summit-speaker-brief.pdf', 1_240_000)] },
    ]),
    thread('Flood model data-sharing agreement', flooda, 'inbox', {}, [
      { from: tomasz, to: [me(flooda)], body: 'Lachlan,\n\nLegal have reviewed the data-sharing agreement. Two small changes in clause 4, marked up in the attached draft.', at: iso(1 * DAY + 2 * HOUR), direction: 'in', attachments: [file('Data-sharing-agreement-draft.docx', 1_180_000)] },
    ]),
    thread('Invoice INV-2041 for the September retainer', bolt, 'inbox', {}, [
      { from: accounts, to: [me(bolt)], body: 'Hi,\n\nPlease find attached invoice INV-2041 for the September design retainer. Payment terms are 30 days.', at: iso(4 * DAY), direction: 'in', attachments: [file('INV-2041.pdf', 88_300)] },
    ]),
    thread('Intro: Lachlan <> Dana', elev, 'sent', {}, [
      { from: me(elev), to: [dana, { name: 'Rosalind Fontaine', email: 'rosalind.fontaine@kestrel-capital.example' }], body: 'Dana, meet Rosalind — she chairs the programme committee I mentioned.\n\nRosalind, Dana runs the March summit. I will let you two take it from here.', at: iso(3 * DAY), direction: 'out', attachments: [], signature: 'Lachlan Macdonald\nElevateo\nl.macdonald@elevateoco.com' },
    ]),
    thread('Notes from our call', flooda, 'sent', {}, [
      { from: me(flooda), to: [tomasz], body: 'Tomasz,\n\nThanks for the call. Summary:\n- We deliver weekly score refreshes\n- You provide two pilot postcode districts\n- Review in six weeks', at: iso(6 * DAY), direction: 'out', attachments: [file('Call-notes.pdf', 54_000)], signature: 'Lachlan Macdonald\nFlooda\nlachlan.macdonald@flooda.co' },
    ]),
    thread('Thanks — and a quick question about onboarding', bolt, 'archive', {}, [
      { from: { name: 'Greta Lindqvist', email: 'greta.lindqvist@oakline-systems.example' }, to: [me(bolt)], body: 'Thanks for the walkthrough yesterday. How long does onboarding usually take for a team of our size?', at: iso(16 * DAY), direction: 'in', attachments: [] },
      { from: me(bolt), to: [{ name: 'Greta Lindqvist', email: 'greta.lindqvist@oakline-systems.example' }], body: 'Hi Greta,\n\nTypically two to three weeks. I will send a plan on Monday.', at: iso(15 * DAY), direction: 'out', attachments: [], signature: 'Lachlan Macdonald\nBoltloop\nlachlan@boltloop.co' },
    ]),
    thread('Boost your domain authority in 48 hours!!!', 'l.macdonald@boltloop.co', 'spam', { unread: true }, [
      { from: { name: 'SEO Growth Team', email: 'offers@rank-rocket-deals.example' }, to: [me('l.macdonald@boltloop.co')], body: 'Limited offer! Guaranteed first-page ranking or your money back. Reply now.', at: iso(1 * DAY + 9 * HOUR), direction: 'in', attachments: [] },
    ]),
  ]
}
