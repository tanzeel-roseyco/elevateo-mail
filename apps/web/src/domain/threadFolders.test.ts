// Folder-view predicate and snooze presets: every view's membership, snooze expiry at the boundary,
// and preset instants that always satisfy the server window.
import { describe, expect, it } from 'vitest'
import { matchesView, parseThreadView, snoozePresets, snoozeWindow, type FolderFacts } from './threadFolders'

const NOW = Date.parse('2026-10-20T12:00:00Z')
const base: FolderFacts = { folder: 'inbox', snoozed_until: null, starred: false, unread: true }

describe('matchesView', () => {
  it('shows an inbox thread in all and unread, and a read one only in all', () => {
    expect(matchesView(base, 'all', NOW)).toBe(true)
    expect(matchesView(base, 'unread', NOW)).toBe(true)
    expect(matchesView({ ...base, unread: false }, 'unread', NOW)).toBe(false)
  })

  it('hides a snoozed inbox thread from all/unread until the time passes, then shows it again', () => {
    const snoozed = { ...base, snoozed_until: '2026-10-21T08:00:00Z' }
    expect(matchesView(snoozed, 'all', NOW)).toBe(false)
    expect(matchesView(snoozed, 'snoozed', NOW)).toBe(true)
    const later = Date.parse('2026-10-21T08:00:00Z')
    expect(matchesView(snoozed, 'all', later)).toBe(true) // exactly at the instant: no longer in the future
    expect(matchesView(snoozed, 'snoozed', later)).toBe(false)
  })

  it('lists stars from inbox and archive but never from spam or trash', () => {
    expect(matchesView({ ...base, starred: true, folder: 'archive' }, 'starred', NOW)).toBe(true)
    expect(matchesView({ ...base, starred: true, folder: 'spam' }, 'starred', NOW)).toBe(false)
    expect(matchesView({ ...base, starred: true, folder: 'trash' }, 'starred', NOW)).toBe(false)
    expect(matchesView({ ...base, starred: false }, 'starred', NOW)).toBe(false)
  })

  it('matches shared folders regardless of snooze or read state', () => {
    const archived = { ...base, folder: 'archive' as const, snoozed_until: '2027-01-01T00:00:00Z', unread: false }
    expect(matchesView(archived, 'archive', NOW)).toBe(true)
    expect(matchesView(archived, 'all', NOW)).toBe(false)
    expect(matchesView({ ...base, folder: 'trash' }, 'trash', NOW)).toBe(true)
  })

  it('parses unknown filter values as the inbox view', () => {
    expect(parseThreadView('trash')).toBe('trash')
    expect(parseThreadView('nope')).toBe('all')
    expect(parseThreadView(null)).toBe('all')
  })
})

describe('snooze window and presets', () => {
  it('rejects times under one minute ahead, over 366 days ahead, and unparsable input', () => {
    expect(snoozeWindow('2026-10-20T12:00:30Z', NOW)).toBe('too_soon')
    expect(snoozeWindow('2026-10-20T12:01:00Z', NOW)).toBe('ok')
    expect(snoozeWindow('2027-10-22T12:00:00Z', NOW)).toBe('too_late')
    expect(snoozeWindow('not a time', NOW)).toBe('invalid')
  })

  it('offers four ascending presets on a weekday that all satisfy the server window', () => {
    const presets = snoozePresets(NOW)
    expect(presets.map((p) => p.key)).toEqual(['later_today', 'tomorrow', 'weekend', 'next_week'])
    for (const preset of presets) expect(snoozeWindow(preset.at, NOW)).toBe('ok')
    expect(Date.parse(presets[0]!.at)).toBe(NOW + 3 * 3_600_000)
    // Tomorrow and next week land on the local morning hour.
    expect(new Date(presets[1]!.at).getHours()).toBe(8)
    expect(new Date(presets[3]!.at).getDay()).toBe(1)
    expect(new Date(presets[2]!.at).getDay()).toBe(6)
  })

  // Local-time table: a Saturday, a Sunday, a month end and a year end. Each case must yield
  // unique, strictly ascending instants inside the window; weekends offer no "This weekend".
  // AIDEV-NOTE: The process time zone is whatever Vitest inherits; the invariants hold in any zone.
  const localNoon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
  it.each([
    ['Saturday', localNoon(2026, 10, 24), ['later_today', 'tomorrow', 'next_week']],
    ['Sunday', localNoon(2026, 10, 25), ['later_today', 'tomorrow']],
    ['month end (Saturday)', localNoon(2026, 10, 31), ['later_today', 'tomorrow', 'next_week']],
    ['year end (Thursday)', localNoon(2026, 12, 31), ['later_today', 'tomorrow', 'weekend', 'next_week']],
  ])('%s: presets are unique, ascending and inside the window', (_name, now, keys) => {
    const presets = snoozePresets(now)
    expect(presets.map((p) => p.key)).toEqual(keys)
    const instants = presets.map((p) => Date.parse(p.at))
    for (let i = 1; i < instants.length; i += 1) expect(instants[i]).toBeGreaterThan(instants[i - 1]!)
    expect(new Set(instants).size).toBe(instants.length)
    for (const preset of presets) expect(snoozeWindow(preset.at, now)).toBe('ok')
    for (const preset of presets.slice(1)) expect(new Date(preset.at).getHours()).toBe(8)
  })

  it('on Sunday "tomorrow morning" is already Monday, so there is no duplicate "next week"', () => {
    const presets = snoozePresets(localNoon(2026, 10, 25))
    expect(new Date(presets[1]!.at).getDay()).toBe(1)
    expect(presets.some((p) => p.key === 'next_week')).toBe(false)
  })
})
