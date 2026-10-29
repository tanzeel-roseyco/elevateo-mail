import { describe, expect, it } from 'vitest'
import { suppressedRecipientIndexes, type RecipientCheck } from './sendSuppression'

describe('suppressedRecipientIndexes', () => {
  it('returns the positions of suppressed recipients in input order', () => {
    const checks: RecipientCheck[] = [
      { index: 0, status: 'ok' },
      { index: 1, status: 'suppressed' },
      { index: 2, status: 'invalid' },
      { index: 3, status: 'suppressed' },
    ]
    expect(suppressedRecipientIndexes(checks)).toEqual([1, 3])
  })

  it('returns an empty array when no recipient is suppressed', () => {
    expect(suppressedRecipientIndexes([{ index: 0, status: 'ok' }, { index: 1, status: 'duplicate' }])).toEqual([])
  })

  it('returns an empty array for an empty recipient list', () => {
    expect(suppressedRecipientIndexes([])).toEqual([])
  })
})
