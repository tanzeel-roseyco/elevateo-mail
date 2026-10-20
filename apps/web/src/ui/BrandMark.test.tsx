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
    expect(mark.getAttribute('src')).toBe('/brand/elevateo-mark-64.png')
    expect(mark.getAttribute('srcset')).toBe('/brand/elevateo-mark-64.png 64w, /brand/elevateo-mark-180.png 180w')
    expect(mark.getAttribute('sizes')).toBe(`${size}px`)
    expect(mark.getAttribute('width')).toBe(String(size))
    expect(mark.getAttribute('height')).toBe(String(size))
  })

  it('avoids a repeated accessible name beside visible brand text', () => {
    const { container } = render(<BrandMark decorative />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
  })

  // AIDEV-NOTE: Hashes pin the handoff-derived artwork; budgets prevent shipping the 954 KB master.
  it.each([
    ['elevateo-mark-64.png', 64, 8192, '58b580ea5396176695ec1fcfe6eb7363564207c9dce629f5c7782ecaf48c8ae3'],
    ['elevateo-mark-180.png', 180, 49152, 'bbd2e6f9fffc92562dd7b3a457f88e15a4f40abdee81cf812b8602b4eed21e5e'],
  ] as const)('keeps %s authentic, square and within its download budget', (file, size, budget, digest) => {
    const bytes = readFileSync(new NodeURL(`../../public/brand/${file}`, import.meta.url))
    expect(bytes.byteLength).toBeLessThanOrEqual(budget)
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(bytes.readUInt32BE(16)).toBe(size)
    expect(bytes.readUInt32BE(20)).toBe(size)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(digest)
  })
})
