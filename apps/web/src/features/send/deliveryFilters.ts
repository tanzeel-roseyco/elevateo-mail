// Shared URL-driven time-window filter for the bounce list. Kept tiny and pure so both the page and
// its tests agree on the preset set and the ISO lower bound each preset maps to.
export type TimeWindow = 'all' | '24h' | '7d' | '30d'

export const WINDOW_LABELS: Record<TimeWindow, string> = {
  all: 'All time',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
}

const WINDOW_MS: Record<Exclude<TimeWindow, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

export function parseWindow(value: string | null): TimeWindow {
  return value === '24h' || value === '7d' || value === '30d' ? value : 'all'
}

/** ISO lower bound for a window, or null for 'all'. `now` is injectable for deterministic tests. */
export function windowSinceIso(window: TimeWindow, now = Date.now()): string | null {
  if (window === 'all') return null
  return new Date(now - WINDOW_MS[window]).toISOString()
}
