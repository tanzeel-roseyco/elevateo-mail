/**
 * Monotonic request generation. Incremented on session reset, re-bootstrap, mailbox switch and
 * filter change; a response is applied only when its captured generation is still current, so a
 * delayed success or error can never populate (or clear) a newer context even if abort was late.
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
