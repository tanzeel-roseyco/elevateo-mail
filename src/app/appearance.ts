import { useEffect, useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { appearanceSchema, DEFAULT_APPEARANCE, resolveAppearance, type Appearance } from '@/domain/appearance'

// AIDEV-NOTE: Appearance preferences persist separately from mock data so "Reset prototype data" keeps the theme.

const KEY = 'mailroom:appearance:v1'

function load(): Appearance {
  try {
    const parsed = appearanceSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
    return parsed.success ? parsed.data : DEFAULT_APPEARANCE
  } catch {
    // Unreadable or blocked storage: defaults are always a safe appearance.
    return DEFAULT_APPEARANCE
  }
}

interface PrefsState {
  prefs: Appearance
  /** False after a save the browser could not store: the preferences then last only for this session. */
  persisted: boolean
  /** Returns false when the browser refused to store the preferences (e.g. image too large for quota). */
  save(prefs: Appearance): boolean
}

export const usePrefs = create<PrefsState>()((set) => ({
  prefs: load(),
  persisted: true,
  save: (prefs) => {
    let persisted = true
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs))
    } catch {
      // Quota exceeded or storage blocked: still applied in memory, and reported through `persisted`.
      persisted = false
    }
    set({ prefs, persisted })
    return persisted
  },
}))

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

/** Writes resolved theme, density, and CSS variables onto `element` (the document root, or a preview container). */
export function applyAppearance(element: HTMLElement, prefs: Appearance, systemPrefersDark: boolean): void {
  const resolved = resolveAppearance(prefs, systemPrefersDark)
  element.dataset.theme = resolved.theme
  element.dataset.density = resolved.density
  for (const [name, value] of Object.entries(resolved.vars)) {
    if (value === '') element.style.removeProperty(name)
    else element.style.setProperty(name, value)
  }
}

export function useApplyAppearance(): void {
  const prefs = usePrefs((s) => s.prefs)
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  useEffect(() => applyAppearance(document.documentElement, prefs, systemDark), [prefs, systemDark])
}
