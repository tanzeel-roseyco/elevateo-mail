// Pure folder-view rules for conversations (contract 1.0.0-folders.1). The server applies the same
// predicate when it lists a folder; the UI uses this copy only to decide whether a row that was
// just written still belongs to the view it is shown in, and to build snooze choices.
//
// AIDEV-NOTE: Keep this module free of React, gateways and storage: fixtures import it to emulate
// the server, and InboxPage/ThreadPage import it to reconcile confirmed writes. Drift between this
// predicate and the backend SQL shows up as a row that lingers or vanishes until the next refresh,
// never as a wrong write, because every mutation is still confirmed by the server response.
import type { ThreadFolder } from '@/data/contract'

/** Folder views the list understands; the URL `filter` query and the server `filter` share them. */
export type ThreadView = 'all' | 'unread' | 'starred' | 'snoozed' | 'archive' | 'spam' | 'trash'

export const THREAD_VIEWS: readonly ThreadView[] = ['all', 'unread', 'starred', 'snoozed', 'archive', 'spam', 'trash']

export function parseThreadView(raw: string | null): ThreadView {
  return (THREAD_VIEWS as readonly string[]).includes(raw ?? '') ? (raw as ThreadView) : 'all'
}

/** The fields a view decision needs; both ThreadSummary and the reader's thread carry them. */
export interface FolderFacts {
  readonly folder: ThreadFolder
  readonly snoozed_until: string | null
  readonly starred: boolean
  readonly unread: boolean
}

export function isSnoozing(snoozedUntil: string | null, now = Date.now()): boolean {
  if (snoozedUntil === null) return false
  const at = Date.parse(snoozedUntil)
  return Number.isFinite(at) && at > now
}

/** Server predicate per view (see the `filter` parameter description in contracts/v1/openapi.json). */
export function matchesView(t: FolderFacts, view: ThreadView, now = Date.now()): boolean {
  const snoozing = isSnoozing(t.snoozed_until, now)
  switch (view) {
    case 'all':
      return t.folder === 'inbox' && !snoozing
    case 'unread':
      return t.folder === 'inbox' && !snoozing && t.unread
    case 'starred':
      return t.starred && t.folder !== 'spam' && t.folder !== 'trash'
    case 'snoozed':
      return t.folder === 'inbox' && snoozing
    default:
      return t.folder === view
  }
}

// --- Snooze window and presets ---------------------------------------------------------------

/** Server window: at least one minute and at most 366 days ahead of its clock. */
export const SNOOZE_MIN_MS = 60_000
export const SNOOZE_MAX_MS = 366 * 86_400_000

export type SnoozeWindow = 'ok' | 'too_soon' | 'too_late' | 'invalid'

export function snoozeWindow(iso: string, now = Date.now()): SnoozeWindow {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return 'invalid'
  if (at < now + SNOOZE_MIN_MS) return 'too_soon'
  if (at > now + SNOOZE_MAX_MS) return 'too_late'
  return 'ok'
}

export interface SnoozePreset {
  readonly key: 'later_today' | 'tomorrow' | 'weekend' | 'next_week'
  readonly label: string
  /** UTC ISO instant the server receives; computed in the device's local time zone. */
  readonly at: string
}

const MORNING_HOUR = 8

function atLocalMorning(base: Date, daysAhead: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + daysAhead)
  d.setHours(MORNING_HOUR, 0, 0, 0)
  return d
}

/**
 * Gmail-like choices relative to `now`, unique and ascending; every result lies inside the server
 * window. "This weekend" is omitted on Saturday and Sunday, and on Sunday "Tomorrow morning" already
 * is Monday so "Next week" collapses into it (de-duplicated by instant, earliest label kept).
 */
export function snoozePresets(now = Date.now()): readonly SnoozePreset[] {
  const base = new Date(now)
  const day = base.getDay()
  const laterToday = new Date(now + 3 * 3_600_000)
  laterToday.setSeconds(0, 0)
  const iso = (d: Date) => d.toISOString().replace('.000Z', 'Z')
  const candidates: SnoozePreset[] = [
    { key: 'later_today', label: 'Later today', at: iso(laterToday) },
    { key: 'tomorrow', label: 'Tomorrow morning', at: iso(atLocalMorning(base, 1)) },
  ]
  if (day !== 0 && day !== 6) candidates.push({ key: 'weekend', label: 'This weekend', at: iso(atLocalMorning(base, 6 - day)) })
  candidates.push({ key: 'next_week', label: 'Next week', at: iso(atLocalMorning(base, (8 - day) % 7 || 7)) })
  const seen = new Set<string>()
  return candidates
    .filter((p) => (seen.has(p.at) ? false : (seen.add(p.at), true)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}
