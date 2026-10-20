// Reply-all recipient rules and forward content: own address excluded, duplicates collapsed,
// hostile addresses dropped, limits honoured, and shortened subjects never re-used.
import { describe, expect, it } from 'vitest'
import type { Message } from '@/data/contract'
import { forwardBody, forwardSubject, replyAllRecipients, replySubject, usableAddress } from './replyComposition'

const message = (over: Partial<Message> = {}): Message => ({
  id: '00000000-0000-4000-8000-000000000041',
  sender: { display_name: 'Ada', address: 'ada@example.test' },
  to: [
    { display_name: 'Team', address: 'team@example.test' },
    { display_name: null, address: 'ADA@example.test' },
    { display_name: 'Ben', address: 'ben@example.test' },
  ],
  sent_at: '2026-10-20T10:00:00Z',
  body_text: 'Hello\nthere',
  body_truncated: false,
  attachment_count: 0,
  ...over,
})

describe('usableAddress', () => {
  it('drops anything that could split into several recipients or smuggle a header', () => {
    for (const bad of ['attacker@example.test, victim@example.test', 'a@example.test;b@example.test', 'a@example.test\tb@example.test', 'a b@example.test', '"a"@example.test', 'a@b@example.test', '@example.test', 'nobody', 'a@', 'a@example.test\u0000']) {
      expect(usableAddress(bad)).toBeNull()
    }
    expect(usableAddress('  Ada.Lovelace+tag@example.test ')).toBe('Ada.Lovelace+tag@example.test')
  })
})

describe('replyAllRecipients', () => {
  it('keeps the sender and other recipients, drops the own mailbox and case-insensitive duplicates', () => {
    const to = replyAllRecipients(message(), 'Team@example.test')
    expect(to).toEqual([
      { display_name: 'Ada', address: 'ada@example.test' },
      { display_name: 'Ben', address: 'ben@example.test' },
    ])
  })

  it('drops multi-line or bracketed addresses and yields nothing when only the own address remains', () => {
    const hostile = message({ sender: { display_name: 'X', address: 'a@example.test\nbcc: v@example.test' }, to: [{ display_name: null, address: '<me@example.test>' }, { display_name: null, address: 'me@example.test' }] })
    expect(replyAllRecipients(hostile, 'me@example.test')).toEqual([])
  })

  it('caps the list at the draft limit of 100 recipients', () => {
    const many = message({ to: Array.from({ length: 150 }, (_, i) => ({ display_name: null, address: `r${i}@example.test` })) })
    expect(replyAllRecipients(many, null)).toHaveLength(100)
  })
})

describe('subjects and forward body', () => {
  it('prefixes once and never reuses a server-shortened subject', () => {
    expect(replySubject('Hello', false)).toBe('Re: Hello')
    expect(replySubject('RE: Hello', false)).toBe('RE: Hello')
    expect(forwardSubject('Fw: Hello', false)).toBe('Fw: Hello')
    expect(forwardSubject('Hello', false)).toBe('Fwd: Hello')
    expect(forwardSubject('Hello', true)).toBe('')
    expect(replySubject(null, false)).toBe('')
  })

  it('quotes the original with a header block and bounds the body', () => {
    const body = forwardBody(message(), 'Hello')
    expect(body.startsWith('\n\n---------- Forwarded message ----------\nFrom: Ada <ada@example.test>\nDate: 2026-10-20T10:00:00Z\nSubject: Hello\nTo: Team <team@example.test>, ADA@example.test, Ben <ben@example.test>\n\nHello\nthere')).toBe(true)
    const huge = forwardBody(message({ body_text: 'x'.repeat(70_000) }), null)
    expect(Array.from(huge)).toHaveLength(65_536)
    expect(huge).toContain('Subject: (no subject)')
  })
})

describe('forward header block hardening', () => {
  it('keeps every header-shaped value on one line so a hostile name or subject cannot forge fields', () => {
    const hostile = message({ sender: { display_name: 'Ada\nBcc: victim@example.test', address: 'ada@example.test' }, body_text: 'Body' })
    const body = forwardBody(hostile, 'Quarterly report\nTo: finance@example.test')
    expect(body).toContain('From: Ada Bcc: victim@example.test <ada@example.test>')
    expect(body).toContain('Subject: Quarterly report To: finance@example.test')
    expect(body).not.toMatch(/^Bcc:/m)
    expect(body.split('\n').filter((line) => line.startsWith('To: '))).toHaveLength(1)
  })
})
