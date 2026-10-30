// Stage-A micro-gap regression: supplementary-Unicode counting semantics. The canonical contract's
// JSON Schema maxLength counts Unicode CODE POINTS. These cases pin that decision at the exact
// boundaries: astral (surrogate-pair) characters count once, ZWJ emoji clusters count per code
// point (not one grapheme), and a mixed string whose UTF-16 length exceeds the limit while its
// code-point count does not is contract-legal (the case plain .max/.length counting rejected).
import { describe, expect, it } from 'vitest'
import { ErrorSchema, MessageSchema, ThreadDetailPageSchema, ThreadPageSchema, ThreadSummarySchema } from './contract'

const ID = '00000000-0000-4000-8000-000000000031'
const MB = '00000000-0000-4000-8000-000000000021'
const TOKEN = 'context_A_0123456789'

const ASTRAL = '\u{1F600}' // 1 code point, 2 UTF-16 units
const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}' // ZWJ family: 7 code points

const summary = (subject: string | null, preview = 'p') => ({
  id: ID,
  mailbox_id: MB,
  subject,
  subject_truncated: false,
  sender: null,
  preview_text: preview,
  last_message_at: null,
  unread: false,
  message_count: 0,
})

const message = (bodyText: string) => ({
  id: ID,
  sender: null,
  to: [],
  sent_at: null,
  body_text: bodyText,
  body_truncated: false,
  attachment_count: 0,
})

const detailPage = (subject: string) => ({
  context_id: TOKEN,
  authorization_version: TOKEN,
  next_cursor: null,
  thread: { id: ID, mailbox_id: MB, subject, subject_truncated: false, unread: true, message_count: 1 },
  messages: [],
})

describe('string limits count Unicode code points (contract maxLength semantics)', () => {
  it('a subject of exactly 256 astral characters is contract-legal; 257 is not', () => {
    expect(ThreadSummarySchema.safeParse(summary(ASTRAL.repeat(256))).success).toBe(true)
    expect(ThreadSummarySchema.safeParse(summary(ASTRAL.repeat(257))).success).toBe(false)
  })

  it('a mixed string over the limit in UTF-16 units but at it in code points is accepted', () => {
    const mixed = 'a'.repeat(255) + ASTRAL // 256 code points, 257 UTF-16 units
    expect(mixed.length).toBe(257) // the regression: unit counting would reject this
    expect(ThreadSummarySchema.safeParse(summary(mixed)).success).toBe(true)
    expect(ThreadSummarySchema.safeParse(summary('a'.repeat(256) + ASTRAL)).success).toBe(false)
  })

  it('a ZWJ emoji cluster counts as its constituent code points, not one grapheme', () => {
    const atLimit = 'f'.repeat(249) + FAMILY // 249 + 7 = exactly 256 code points
    expect(ThreadSummarySchema.safeParse(summary(atLimit)).success).toBe(true)
    expect(ThreadSummarySchema.safeParse(summary(atLimit + 'x')).success).toBe(false) // 257
  })

  it('preview_text shares the 256-code-point boundary', () => {
    expect(ThreadSummarySchema.safeParse(summary(null, ASTRAL.repeat(256))).success).toBe(true)
    expect(ThreadSummarySchema.safeParse(summary(null, ASTRAL.repeat(257))).success).toBe(false)
  })

  it('body_text accepts exactly 16384 astral code points and rejects 16385', () => {
    expect(MessageSchema.safeParse(message(ASTRAL.repeat(16_384))).success).toBe(true)
    expect(MessageSchema.safeParse(message(ASTRAL.repeat(16_385))).success).toBe(false)
  })

  it('the reader thread subject accepts 998 astral code points and rejects 999', () => {
    expect(ThreadDetailPageSchema.safeParse(detailPage(ASTRAL.repeat(998))).success).toBe(true)
    expect(ThreadDetailPageSchema.safeParse(detailPage(ASTRAL.repeat(999))).success).toBe(false)
  })

  // Cursors and request ids carry no ASCII pattern in the contract, so their maxima are code
  // points too; their min(1) is preserved (non-empty is identical in both countings).
  it('next_cursor accepts exactly 2048 astral code points, rejects 2049, and stays non-empty', () => {
    const page = (cursor: string | null) => ({
      context_id: TOKEN,
      authorization_version: TOKEN,
      next_cursor: cursor,
      mailbox_id: MB,
      items: [],
    })
    expect(ThreadPageSchema.safeParse(page(ASTRAL.repeat(2048))).success).toBe(true)
    expect(ThreadPageSchema.safeParse(page(ASTRAL.repeat(2049))).success).toBe(false)
    expect(ThreadPageSchema.safeParse(page('')).success).toBe(false)
  })

  it('error request_id accepts exactly 128 astral code points, rejects 129, and stays non-empty', () => {
    const error = (requestId: string) => ({ code: 'internal_error', message: 'm', request_id: requestId })
    expect(ErrorSchema.safeParse(error(ASTRAL.repeat(128))).success).toBe(true)
    expect(ErrorSchema.safeParse(error(ASTRAL.repeat(129))).success).toBe(false)
    expect(ErrorSchema.safeParse(error('')).success).toBe(false)
  })
})
