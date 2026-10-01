// AIDEV-NOTE: WCAG contrast maths; keeps user-chosen accents readable instead of trusting the colour picker.

export type Rgb = readonly [number, number, number]

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  const digits = match?.[1]
  if (!digits) return null
  const full = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits
  const n = Number.parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')
}

export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Linear mix: t = 0 returns `a`, t = 1 returns `b`. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

const BLACK: Rgb = [17, 19, 23]
const WHITE: Rgb = [255, 255, 255]

/**
 * Text colour to place on top of a filled `bg` (e.g. the Compose button). Compares against pure black:
 * the better of pure black and white always reaches 4.5:1, which the softer near-black cannot guarantee.
 */
export function onColor(bg: Rgb): string {
  return contrast(bg, WHITE) >= contrast(bg, [0, 0, 0]) ? '#ffffff' : '#000000'
}

/**
 * Returns `accent` nudged toward black or white until it reaches `min` contrast on `surface`,
 * so a pale yellow accent still yields legible link and active-nav text.
 */
export function readableAccent(accent: Rgb, surface: Rgb, min = 4.5): string {
  const target = luminance(surface) > 0.4 ? BLACK : WHITE
  for (let t = 0; t <= 1; t += 0.05) {
    const candidate = mix(accent, target, t)
    if (contrast(candidate, surface) >= min) return rgbToHex(candidate)
  }
  return rgbToHex(target)
}
