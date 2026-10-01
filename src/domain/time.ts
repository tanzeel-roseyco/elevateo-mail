import { TIME_PATTERN } from './schema'

// AIDEV-NOTE: Wall-clock time in a named IANA zone -> UTC instant, using Intl only (no date-library dependency).

/** Milliseconds that `timeZone`'s wall clock is ahead of UTC at `instant`. Throws RangeError for an unknown zone. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(instant))
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')) - instant
}

/**
 * The instant at which clocks in `timeZone` read `date` (YYYY-MM-DD) and `time` (HH:mm), as an ISO string.
 * Returns null for a malformed date or time or an unknown zone.
 */
export function zonedTimeToIso(date: string, time: string, timeZone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !TIME_PATTERN.test(time)) return null
  const wall = Date.parse(`${date}T${time}:00Z`)
  if (Number.isNaN(wall)) return null
  try {
    // Two passes: the first offset is read at the wrong instant, which matters either side of a clock change.
    const guess = wall - zoneOffset(wall, timeZone)
    return new Date(wall - zoneOffset(guess, timeZone)).toISOString()
  } catch {
    // Intl rejects an unknown zone name with a RangeError; the caller treats that as invalid input.
    return null
  }
}
