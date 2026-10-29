/**
 * Monotonic request generation. Invalidated on session replacement, recovery, explicit retry and
 * failed session validation; a response is applied only when its captured generation is still
 * current, so a delayed success or error can never populate (or clear) a newer context even if
 * abort was late. Mailbox/filter/thread changes use narrower per-request controllers and captured
 * generations instead; they do not invalidate unrelated requests (D3).
 */
export class RequestScope {
  private generation = 0

  current(): number {
    return this.generation
  }

  invalidate(): number {
    this.generation += 1
    return this.generation
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation
  }
}
