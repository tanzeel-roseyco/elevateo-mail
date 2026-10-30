import { describe, expect, it } from 'vitest'
import { RequestScope } from './scope'

describe('RequestScope', () => {
  it('rejects generations captured before an invalidation', () => {
    const scope = new RequestScope()
    const before = scope.current()
    expect(scope.isCurrent(before)).toBe(true)
    scope.invalidate()
    expect(scope.isCurrent(before)).toBe(false)
    expect(scope.isCurrent(scope.current())).toBe(true)
  })
})
