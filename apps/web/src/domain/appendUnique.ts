// Page merging for cursor-paginated lists (inbox rows, unified rows, thread messages).
//
// AIDEV-NOTE: Concurrent updates may reorder server pages, so a continuation can repeat an id the
// client already holds. The existing row wins: it may already carry a confirmed star/read/folder
// change that the server page predates (FE-R08/R10).
export interface Identified {
  readonly id: string
}

/** Appends `incoming` items whose id is not already in `existing`; order is preserved. */
export function appendUnique<T extends Identified>(existing: readonly T[], incoming: readonly T[]): T[] {
  if (existing.length === 0) return [...incoming]
  const seen = new Set(existing.map((item) => item.id))
  return [...existing, ...incoming.filter((item) => !seen.has(item.id))]
}
