# Bounded Gmail sync core

`backend/gmailSync.ts` processes one provider page per call using an injected provider. It does not make live Google requests, send messages, create contacts, infer consent, or change DNS.

Each page allows 25 messages and 25 deletions, with at most 1 MiB of combined UTF-8 body text. Individual bodies are limited to 100,000 characters. The provider returns normalized plain text, verified sender addresses, message/thread IDs, a history cursor and an optional page token. Transport implementations must separately bound response bytes and request duration before parsing.

Initial import scans full pages at one fixed history watermark. A bounded cleanup step removes obsolete previously synced cache rows, preserving other imported rows. History pages then catch changes since the watermark. Expired history resets to a full scan. History pagination preserves its starting cursor until the final page. Replayed message IDs update existing records rather than duplicating them.

Message changes and cursor advancement share a D1 transaction. Every write checks the same version, current connected mailbox identity, and the required credential ID/revision captured by the caller. Revocation, credential replacement, a competing worker or disconnect/reconnect invalidates old results. A conflict is retryable from durable state with current credentials; do not reuse the old provider page. An ID collision with a manually/event-imported row preserves that row's original content and provenance.

## Integration remaining

The returned `imported` and `deleted` counts describe database changes, not provider page lengths. Protected imported-ID collisions and absent deletion targets count as zero.

- Connect a verified OAuth credential to its owned mailbox and capture its credential revision when constructing the transport. Pass that same credential ID/revision to the core; do not substitute a newer revision for a transport still using an old token.
- Implement bounded Google API transport and MIME normalization. Full scans must retain their initial watermark across every page. History adapters must collapse repeated changes for each ID within a page.
- Schedule bounded calls and retries with backoff; authenticated ownership must come from the server session, never a client-provided owner.
- Add unread/label metadata and verified reply correlation before enabling real campaign dispatch. This core deliberately cannot infer a campaign reply from an arbitrary thread ID.
- Add notifications and user-facing import progress once the scheduler and live adapter are connected.

Tests use real local D1 with injected provider responses: pagination, duplicate updates, imported-ID collisions, expired cursor recovery, malformed/oversized responses, transport failure, foreign owner, concurrent workers, reconnection races and credential revocation/replacement races. Validation is performed by the parent task in Docker; this document does not claim an unrun test result.

References: [Google Gmail sync guide](https://developers.google.com/workspace/gmail/api/guides/sync), [D1 transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/).
