import { readFileSync, readdirSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// AIDEV-NOTE: Palette literals belong only to styles; user tag colours remain data, not chrome.
const forbidden = /\bdark:|\b(?:bg|text|border|ring|outline|divide|fill|stroke|from|via|to|accent|placeholder|shadow)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gold)-\d{2,3})\b|#[\da-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab)\(/i
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? sources(path) : /\.(tsx?|css)$/.test(path) ? [path] : []
  })
}
const root = resolve('src')
const css = readFileSync(resolve(root, 'styles/index.css'), 'utf8')
function token(name: string): string {
  const value = css.match(new RegExp(`--color-${name}: (#[a-f0-9]{6});`))?.[1]
  if (!value) throw new Error(`Missing colour token: ${name}`)
  return value
}
function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return channel(1) * 0.2126 + channel(3) * 0.7152 + channel(5) * 0.0722
}
function contrast(first: string, second: string): number {
  const a = luminance(token(first))
  const b = luminance(token(second))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('corporate light design system', () => {
  it('keeps palette classes and literals out of application components', () => {
    const tokens = new Set(['styles/index.css', 'styles/tagColours.ts'].map(path => resolve(root, path)))
    const violations = sources(root).filter(path => !tokens.has(path) && !/\.(test|d)\.tsx?$/.test(path))
      .filter(path => forbidden.test(readFileSync(path, 'utf8'))).map(path => relative(root, path))
    expect(violations).toEqual([])
  })
  it.each(['dark:bg-surface', 'text-blue-600', 'bg-white', '"#ff00ff"', 'bg-[#ff0000]', 'text-[#fff]', 'rgba(0,0,0,.5)', 'hsla(0,0%,0%,1)', 'rgb(0,0,0)'])('rejects %s', value => {
    expect(forbidden.test(value)).toBe(true)
  })
  it('allows semantic utilities', () => {
    expect(forbidden.test('bg-surface text-fg border-line focus:ring-ring')).toBe(false)
  })
  it.each(['surface', 'surface-2'])('meets text and outline contrast on %s', surface => {
    for (const ink of ['fg', 'muted', 'danger', 'success', 'warn']) expect(contrast(ink, surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast('line', surface)).toBeGreaterThanOrEqual(3)
    expect(contrast('ring', surface)).toBeGreaterThanOrEqual(3)
  })
  it.each(['danger', 'success', 'warn'])('keeps %s labels accessible on tinted surfaces', status => {
    expect(contrast(status, `${status}-soft`)).toBeGreaterThanOrEqual(4.5)
  })
  it('forces a single light colour scheme', () => {
    expect(css).toContain('color-scheme: light;')
    expect(css).not.toMatch(/prefers-color-scheme|@custom-variant dark/)
  })
})
