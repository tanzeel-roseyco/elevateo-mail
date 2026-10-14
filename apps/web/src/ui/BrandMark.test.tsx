import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { URL as NodeURL } from 'node:url'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandMark } from './BrandMark'

describe('official brand mark', () => {
  it.each([24, 28, 36] as const)('reserves a square %i pixel slot and offers density-aware sources', size => {
    render(<BrandMark size={size} />)
    const mark = screen.getByRole('img', { name: 'Elevateo' })
    expect(mark.getAttribute('src')).toBe('/brand/logo-mark-64.png')
    expect(mark.getAttribute('srcset')).toBe('/brand/logo-mark-64.png 64w, /brand/logo-mark-180.png 180w')
    expect(mark.getAttribute('sizes')).toBe(`${size}px`)
    expect(mark.getAttribute('width')).toBe(String(size))
    expect(mark.getAttribute('height')).toBe(String(size))
  })

  it('avoids a repeated accessible name beside visible brand text', () => {
    const { container } = render(<BrandMark decorative />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
  })

  // AIDEV-NOTE: Hashes pin unchanged official artwork; budgets prevent restoring the multi-megabyte master.
  it.each([
    ['logo-mark-64.png', 64, 8192, '69e64beb0e9414bb8f0ade0a703c15f3cd9c6801b6b95e4bc236ae9a48ec14b9'],
    ['logo-mark-180.png', 180, 49152, '0afd2777ac35b3c0af53d62e9a7dbb4fb95c7b74bc85df6c968d8691d2d7d9a5'],
  ] as const)('keeps %s authentic, square and within its download budget', (file, size, budget, digest) => {
    const bytes = readFileSync(new NodeURL(`../../public/brand/${file}`, import.meta.url))
    expect(bytes.byteLength).toBeLessThanOrEqual(budget)
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(bytes.readUInt32BE(16)).toBe(size)
    expect(bytes.readUInt32BE(20)).toBe(size)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(digest)
  })
})
