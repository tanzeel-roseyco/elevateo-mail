// Caller-generated operation/draft/note identifiers (contract: canonical lowercase UUID). The id
// is an idempotency key, never permission; it is created once per deliberate attempt and retried
// unchanged, so it must never be derived from content or regenerated on retry.

/** Lowercase hyphenated UUID v4 (code points counted as the server does). */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // jsdom without randomUUID: build v4 from getRandomValues (RFC 4122 §4.4).
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Lowercase canonical form, or null when the value is not a UUID. Used for typed-in target ids. */
export function canonicalId(value: string): string | null {
  const trimmed = value.trim()
  return UUID.test(trimmed) ? trimmed.toLowerCase() : null
}

/** Unicode code points, the unit every contract maxLength uses (not UTF-16 units or bytes). */
export function codePoints(value: string): number {
  const iterator = value[Symbol.iterator]()
  let count = 0
  while (!iterator.next().done) count += 1
  return count
}
