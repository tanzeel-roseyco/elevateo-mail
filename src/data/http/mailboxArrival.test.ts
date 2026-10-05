import { expect, it } from 'vitest'
import { mailboxPage, toMailbox } from './contract'

// AIDEV-NOTE: Older deployments cannot signal arrivals; invalid counters must not reach notification state.
it('defaults absent arrival counters and rejects unsafe or negative values', () => {
  const row = { id: 'mail', address: 'a@example.com', provider: 'gmail', connected: 1, send_enabled: 0, ai_read: 0, ai_draft: 0, ai_send: 0 }
  expect(toMailbox(mailboxPage.parse({ items: [row], next: null }).items[0]!).arrivalCount).toBe(0)
  for (const arrival_count of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(mailboxPage.safeParse({ items: [{ ...row, arrival_count }], next: null }).success).toBe(false)
  }
  expect(toMailbox(mailboxPage.parse({ items: [{ ...row, arrival_count: 4 }], next: null }).items[0]!).arrivalCount).toBe(4)
})
