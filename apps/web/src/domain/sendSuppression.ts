// Pure suppression helpers for send review (FC web-delivery). The server marks each reviewed
// recipient with a status; the UI must not re-derive suppression from addresses. This exposes the
// suppressed recipient positions so the review can link to the suppression list.
// AIDEV-NOTE: Mirrors the recipient_checks status union in data/sendContract.ts (SendReviewSchema).

export type RecipientStatus = 'ok' | 'invalid' | 'duplicate' | 'suppressed'

export interface RecipientCheck {
  /** Zero-based position in the review's recipient list. */
  index: number
  status: RecipientStatus
}

/** Zero-based indexes of recipients the server has suppressed, in input order. */
export function suppressedRecipientIndexes(checks: readonly RecipientCheck[]): number[] {
  return checks.filter((check) => check.status === 'suppressed').map((check) => check.index)
}
