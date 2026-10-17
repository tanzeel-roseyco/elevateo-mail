import { describe, expect, it } from 'vitest'
import { isAuthCompletePath } from './entry'

describe('completion form routing', () => {
  it('matches only the fixed query-free pathname', () => {
    expect(isAuthCompletePath('/auth/complete')).toBe(true)
    expect(isAuthCompletePath('/auth/complete/')).toBe(true)
    expect(isAuthCompletePath('/auth/accept')).toBe(false)
    expect(isAuthCompletePath('/auth/complete/extra')).toBe(false)
    expect(isAuthCompletePath('/')).toBe(false)
  })
})
