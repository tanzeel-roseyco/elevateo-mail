export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ')

export function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const FULL_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
const DATE_TIME = new Intl.DateTimeFormat('en-GB', DATE_TIME_OPTIONS)

/** Gmail-style compact timestamp: time today, day+month this year, full date otherwise. */
export function formatWhen(iso: string, now = Date.now()): string {
  const date = new Date(iso)
  const today = new Date(now)
  if (date.toDateString() === today.toDateString()) return TIME.format(date)
  if (date.getFullYear() === today.getFullYear()) return DAY_MONTH.format(date)
  return FULL_DATE.format(date)
}

const zonedDateTime = new Map<string, Intl.DateTimeFormat>()

/** Local date and time, or the wall-clock date and time in `timeZone` when one is given. */
export function formatDateTime(iso: string, timeZone?: string): string {
  if (!timeZone) return DATE_TIME.format(new Date(iso))
  let format = zonedDateTime.get(timeZone)
  if (!format) {
    try {
      format = new Intl.DateTimeFormat('en-GB', { ...DATE_TIME_OPTIONS, timeZone })
    } catch {
      // An unknown zone name in stored data must not break rendering: fall back to local time.
      format = DATE_TIME
    }
    zonedDateTime.set(timeZone, format)
  }
  return format.format(new Date(iso))
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
