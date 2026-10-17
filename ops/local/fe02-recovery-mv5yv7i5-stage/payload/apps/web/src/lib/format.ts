// Adapted from first-party Ledger frontend 4322cfbb, src/lib/format.ts (blob 00b61a9a…).
// Selected cx/formatWhen only; uid/formatBytes/initials/delay were unused here and not copied.

export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ')

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const FULL_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const DATE_TIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Compact timestamp: time today, day+month this year, full date otherwise. Invalid input renders a placeholder. */
export function formatWhen(iso: string, now = Date.now()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  const today = new Date(now)
  if (date.toDateString() === today.toDateString()) return TIME.format(date)
  if (date.getFullYear() === today.getFullYear()) return DAY_MONTH.format(date)
  return FULL_DATE.format(date)
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return DATE_TIME.format(date)
}
