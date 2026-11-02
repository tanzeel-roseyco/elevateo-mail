import { describe, expect, it } from 'vitest'
import { appendUnique } from './appendUnique'

const row = (id: string, note = '') => ({ id, note })

describe('appendUnique', () => {
  it('appends new ids after the existing items in page order', () => {
    expect(appendUnique([row('a'), row('b')], [row('c'), row('d')]).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps the existing item when a continuation repeats its id', () => {
    const merged = appendUnique([row('a', 'confirmed')], [row('a', 'stale'), row('b')])
    expect(merged).toEqual([row('a', 'confirmed'), row('b')])
  })

  it('copies the page when nothing was accumulated yet (a reset)', () => {
    const page = [row('a'), row('a'), row('b')]
    const merged = appendUnique([], page)
    expect(merged).not.toBe(page)
    // Duplicates inside one server page are the server's responsibility; a reset keeps the page as sent.
    expect(merged.map((r) => r.id)).toEqual(['a', 'a', 'b'])
  })

  it('returns the existing rows unchanged in content for an empty page', () => {
    expect(appendUnique([row('a')], [])).toEqual([row('a')])
  })
})
