// BE-05 contract pins: folder/snooze/star inputs and states are closed objects with the
// documented bounds, and every thread summary now carries the three folder facts.
import { describe, expect, it } from 'vitest'
import {
  ThreadFolderInputSchema,
  ThreadFolderSchema,
  ThreadFolderStateSchema,
  ThreadSnoozeInputSchema,
  ThreadStarInputSchema,
  ThreadStarStateSchema,
  ThreadSummarySchema,
} from './contract'

const MB = '00000000-0000-4000-8000-000000000021'
const TH = '00000000-0000-4000-8000-000000000031'
const envelope = { context_id: 'context_A_0123456789', authorization_version: 'authz_A_0123456789', thread_id: TH, mailbox_id: MB }

describe('thread folder contract', () => {
  it('folders are a closed enum', () => {
    for (const folder of ['inbox', 'archive', 'spam', 'trash']) expect(ThreadFolderSchema.safeParse(folder).success).toBe(true)
    for (const folder of ['sent', 'drafts', 'INBOX', '']) expect(ThreadFolderSchema.safeParse(folder).success).toBe(false)
  })

  it('a summary without folder facts is rejected', () => {
    const base = { id: TH, mailbox_id: MB, subject: null, subject_truncated: false, sender: null, preview_text: '', last_message_at: null, unread: false, message_count: 0 }
    expect(ThreadSummarySchema.safeParse(base).success).toBe(false)
    expect(ThreadSummarySchema.safeParse({ ...base, folder: 'inbox', snoozed_until: null, starred: false }).success).toBe(true)
    expect(ThreadSummarySchema.safeParse({ ...base, folder: 'inbox', snoozed_until: '2026-10-21T08:00:00Z', starred: true }).success).toBe(true)
    expect(ThreadSummarySchema.safeParse({ ...base, folder: 'inbox', snoozed_until: 'tomorrow', starred: true }).success).toBe(false)
  })

  it('folder, snooze and star inputs are closed and typed', () => {
    expect(ThreadFolderInputSchema.safeParse({ mailbox_id: MB, folder: 'archive' }).success).toBe(true)
    expect(ThreadFolderInputSchema.safeParse({ mailbox_id: MB, folder: 'archive', extra: 1 }).success).toBe(false)
    expect(ThreadSnoozeInputSchema.safeParse({ mailbox_id: MB, snoozed_until: null }).success).toBe(true)
    expect(ThreadSnoozeInputSchema.safeParse({ mailbox_id: MB, snoozed_until: '2026-10-21T08:00:00Z' }).success).toBe(true)
    expect(ThreadSnoozeInputSchema.safeParse({ mailbox_id: MB }).success).toBe(false)
    expect(ThreadStarInputSchema.safeParse({ mailbox_id: MB, starred: 'yes' }).success).toBe(false)
    expect(ThreadStarInputSchema.safeParse({ mailbox_id: MB, starred: false }).success).toBe(true)
  })

  it('folder and star states carry versions in 0..2^31-1 and closed keys', () => {
    const folder = { ...envelope, folder: 'inbox', snoozed_until: null, folder_version: 0, updated_at: null }
    expect(ThreadFolderStateSchema.safeParse(folder).success).toBe(true)
    expect(ThreadFolderStateSchema.safeParse({ ...folder, folder_version: 2147483648 }).success).toBe(false)
    expect(ThreadFolderStateSchema.safeParse({ ...folder, folder_version: -1 }).success).toBe(false)
    expect(ThreadFolderStateSchema.safeParse({ ...folder, unexpected: true }).success).toBe(false)
    const star = { ...envelope, starred: true, star_version: 1, updated_at: '2026-10-20T00:00:00Z' }
    expect(ThreadStarStateSchema.safeParse(star).success).toBe(true)
    expect(ThreadStarStateSchema.safeParse({ ...star, star_version: 1.5 }).success).toBe(false)
  })
})
