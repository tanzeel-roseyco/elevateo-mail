// D4/V4: one reset per entire traversal, replacement signalled explicitly, initial requests never
// auto-retry, consumed budgets surface manual retry, and stale traversals issue no work.
import { describe, expect, it, vi } from 'vitest'
import { GatewayError } from '@/data/errors'
import { newTraversalBudget, readPage } from './readPage'

const cursorInvalid = () => new GatewayError('api', 'cursor_invalid', 'synthetic', { status: 400, requestId: 'r1' })
const notAvailable = () => new GatewayError('api', 'not_available', 'synthetic', { status: 404, requestId: 'r1' })

describe('readPage', () => {
  it('returns a plain page without touching the budget', async () => {
    const read = vi.fn().mockResolvedValue('page-2')
    const budget = newTraversalBudget()
    const outcome = await readPage({ read, cursor: 'c2', budget, isCurrent: () => true })
    expect(outcome).toEqual({ kind: 'page', page: 'page-2', replace: false })
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith('c2')
    expect(budget.resetUsed).toBe(false)
  })

  it('an invalid continuation cursor consumes the budget and refetches page one as a replacement', async () => {
    const read = vi.fn().mockRejectedValueOnce(cursorInvalid()).mockResolvedValueOnce('page-1-again')
    const budget = newTraversalBudget()
    const outcome = await readPage({ read, cursor: 'c2', budget, isCurrent: () => true })
    expect(outcome).toEqual({ kind: 'page', page: 'page-1-again', replace: true })
    expect(read).toHaveBeenNthCalledWith(1, 'c2')
    expect(read).toHaveBeenNthCalledWith(2, undefined)
    expect(budget.resetUsed).toBe(true)
  })

  it('an initial cursor-less request never auto-retries cursor_invalid', async () => {
    const error = cursorInvalid()
    const read = vi.fn().mockRejectedValue(error)
    const budget = newTraversalBudget()
    const outcome = await readPage({ read, cursor: undefined, budget, isCurrent: () => true })
    expect(outcome).toEqual({ kind: 'failed', error })
    expect(read).toHaveBeenCalledTimes(1)
    expect(budget.resetUsed).toBe(false)
  })

  it('a second invalid cursor after a successful reset is not automatically retried (V4)', async () => {
    const budget = newTraversalBudget()
    // First call in the traversal: reset succeeds and spends the only allowance.
    const first = vi.fn().mockRejectedValueOnce(cursorInvalid()).mockResolvedValueOnce('page-1')
    expect(await readPage({ read: first, cursor: 'bad-1', budget, isCurrent: () => true })).toEqual({
      kind: 'page',
      page: 'page-1',
      replace: true,
    })
    // Later continuation in the same traversal shares the consumed budget.
    const secondError = cursorInvalid()
    const second = vi.fn().mockRejectedValue(secondError)
    expect(await readPage({ read: second, cursor: 'bad-2', budget, isCurrent: () => true })).toEqual({
      kind: 'failed',
      error: secondError,
    })
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('a failed reset request is returned for manual retry with the budget still consumed', async () => {
    const resetError = notAvailable()
    const read = vi.fn().mockRejectedValueOnce(cursorInvalid()).mockRejectedValueOnce(resetError)
    const budget = newTraversalBudget()
    const outcome = await readPage({ read, cursor: 'c2', budget, isCurrent: () => true })
    expect(outcome).toEqual({ kind: 'failed', error: resetError })
    expect(budget.resetUsed).toBe(true)
  })

  it('non-cursor errors pass through without consuming the budget', async () => {
    const error = notAvailable()
    const read = vi.fn().mockRejectedValue(error)
    const budget = newTraversalBudget()
    const outcome = await readPage({ read, cursor: 'c2', budget, isCurrent: () => true })
    expect(outcome).toEqual({ kind: 'failed', error })
    expect(budget.resetUsed).toBe(false)
  })

  it('a stale traversal issues no request at all', async () => {
    const read = vi.fn()
    const outcome = await readPage({ read, cursor: undefined, budget: newTraversalBudget(), isCurrent: () => false })
    expect(outcome).toEqual({ kind: 'stale' })
    expect(read).not.toHaveBeenCalled()
  })

  it('ownership lost between the failure and the reset stops before the reset request', async () => {
    const read = vi.fn().mockRejectedValueOnce(cursorInvalid())
    let current = true
    const outcome = await readPage({
      read: (cursor) => {
        current = false // ownership moves on while the first request is settling
        return read(cursor) as Promise<string>
      },
      cursor: 'c2',
      budget: newTraversalBudget(),
      isCurrent: () => current,
    })
    expect(outcome).toEqual({ kind: 'stale' })
    expect(read).toHaveBeenCalledTimes(1)
  })
})
