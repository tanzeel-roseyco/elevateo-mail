import { z } from 'zod'
import { hexToRgb, mix, onColor, readableAccent, rgbToHex } from './color'

// AIDEV-NOTE: Pure mapping from saved preferences to CSS variables; app/appearance.ts applies the result to the DOM.

export const CHROME_OPACITY_MIN = 70
export const BLUR_MAX = 24
export const MAX_BACKGROUND_IMAGE_BYTES = 1_500_000
// Base64 encodes 3 bytes as 4 characters; the allowance covers the data-URL prefix.
const MAX_BACKGROUND_IMAGE_CHARS = Math.ceil(MAX_BACKGROUND_IMAGE_BYTES / 3) * 4 + 64

export const appearanceSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  bgColor: z.string().regex(/^#[0-9a-f]{6}$/i).nullable(),
  /** data: URL read locally; never uploaded. */
  // The size cap is enforced here as well as at upload, so an oversized stored value is rejected on load.
  bgImage: z.string().regex(/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+=*$/).max(MAX_BACKGROUND_IMAGE_CHARS).nullable(),
  blur: z.number().min(0).max(BLUR_MAX),
  /** How opaque the sidebar/top bar are over the background, in percent. */
  chromeOpacity: z.number().min(CHROME_OPACITY_MIN).max(100),
  density: z.enum(['comfortable', 'compact']),
  inboxLayout: z.enum(['list', 'split']),
})
export type Appearance = z.infer<typeof appearanceSchema>

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'system',
  // Brand gold; must match the --accent fallback in styles/index.css.
  accent: '#c9a227',
  bgColor: null,
  bgImage: null,
  blur: 0,
  chromeOpacity: 88,
  density: 'comfortable',
  inboxLayout: 'list',
}

export const ACCENT_PRESETS = [
  { name: 'Gold', value: '#c9a227' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Teal', value: '#0f766e' },
  { name: 'Green', value: '#15803d' },
  { name: 'Amber', value: '#d97706' },
  { name: 'Rose', value: '#e11d48' },
  { name: 'Slate', value: '#475569' },
] as const

export const BACKGROUND_PRESETS = [
  { name: 'Mist', value: '#e8eef6' },
  { name: 'Sand', value: '#f1ece2' },
  { name: 'Sage', value: '#e3ece6' },
  { name: 'Graphite', value: '#23272e' },
] as const

// Must mirror --surface in styles/index.css.
const SURFACE = { light: '#ffffff', dark: '#25262a' } as const

export interface ResolvedAppearance {
  theme: 'light' | 'dark'
  density: Appearance['density']
  /** CSS custom properties; an empty value means "remove the override". */
  vars: Record<string, string>
}

export function resolveAppearance(prefs: Appearance, systemPrefersDark: boolean): ResolvedAppearance {
  const theme = prefs.theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : prefs.theme
  const surface = hexToRgb(SURFACE[theme])!
  const accent = hexToRgb(prefs.accent) ?? hexToRgb(DEFAULT_APPEARANCE.accent)!
  // Accent text is shown on both the plain surface and the 14% accent-soft tint; the tint is the harder case.
  const soft = mix(surface, accent, 0.14)
  return {
    theme,
    density: prefs.density,
    vars: {
      '--accent': rgbToHex(accent),
      '--accent-fg': onColor(accent),
      '--accent-text': readableAccent(accent, soft),
      '--bg': prefs.bgColor ?? '',
      '--chrome-opacity': `${Math.max(CHROME_OPACITY_MIN, prefs.chromeOpacity)}%`,
      '--bg-blur': `${prefs.blur}px`,
    },
  }
}
