// Shared one-reset cursor policy for the mailbox, inbox and reader traversals (accepted D4).
// The helper owns no collections, React state or pagination loops; callers accumulate items and
// hold one TraversalBudget for the entire traversal, so a per-page call cannot grant a fresh reset.
import { isApiError } from '@/data/errors'

/** One reset per entire traversal; continuing or resetting never replenishes it. */
export interface TraversalBudget {
  resetUsed: boolean
}

export function newTraversalBudget(): TraversalBudget {
  return { resetUsed: false }
}

export type PageOutcome<P> =
  /** `replace: true` means the caller must discard accumulated items and keep only this page. */
  | { kind: 'page'; page: P; replace: boolean }
  /** Ownership moved on; the caller applies nothing and surfaces nothing. */
  | { kind: 'stale' }
  | { kind: 'failed'; error: unknown }

/**
 * Read one page. A `cursor_invalid` on a continuation cursor consumes the traversal's single
 * reset budget and refetches the first page once; any further failure is returned for manual
 * retry. An initial (cursor-less) request never retries `cursor_invalid`.
 */
export async function readPage<P>(options: {
  read(cursor: string | undefined): Promise<P>
  cursor: string | undefined
  budget: TraversalBudget
  /** Ownership check before work is issued; stale traversals stop silently (D4). */
  isCurrent(): boolean
}): Promise<PageOutcome<P>> {
  const { read, cursor, budget, isCurrent } = options
  if (!isCurrent()) return { kind: 'stale' }
  try {
    return { kind: 'page', page: await read(cursor), replace: false }
  } catch (error) {
    if (!isApiError(error, 'cursor_invalid') || cursor === undefined || budget.resetUsed) {
      return { kind: 'failed', error }
    }
    budget.resetUsed = true
    if (!isCurrent()) return { kind: 'stale' }
    try {
      return { kind: 'page', page: await read(undefined), replace: true }
    } catch (resetError) {
      return { kind: 'failed', error: resetError }
    }
  }
}
