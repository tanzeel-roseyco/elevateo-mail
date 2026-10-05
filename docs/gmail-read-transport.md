# Gmail HTTP read adapter

`GmailReadProvider` is a credential-independent, injected-HTTP implementation of the sync core's provider port. It is not enabled or scheduled. Pass the access token and stable Google subject from the same vault credential revision; the core separately fences that revision at commit.

Full scans capture the profile history watermark before listing, then preserve it across pages. All-mail listing includes spam/trash so a rescan does not accidentally prune those cached messages. Each list requests 25 entries. History uses specific addition/deletion records, orders by numeric history ID, collapses duplicate changes and handles expired history (HTTP 404) separately from a message deleted during fetch. The core retains the original start cursor until history pagination finishes.

Only inline UTF-8/ASCII plaintext is decoded. HTML-only messages retain metadata with an empty body; HTML is never rendered or converted. Attachments are not downloaded. Multipart depth is capped at ten, parts at fifty and each HTTP response at 64 KiB with a ten-second abort. Message fetches are sequential, at most 25 per page. Subject identity comes from the OAuth credential; `users/me` never uses caller-selected remote URLs.

Limits requiring follow-up before broad production use:
- History pages are durably subdivided into 25 changes using the existing database continuation field. Its bounded envelope stores only the remote page token, offset and SHA-256 fingerprint, never message IDs. Resume refetches the bounded page and verifies the fingerprint; changed or expired pages reset to a full scan instead of skipping changes. The original start watermark remains held until all subpages and remote pages finish. Oversized remote responses or continuation envelopes still fail explicitly.
- Oversized message responses, attachment-backed plain text, legacy character sets and unsupported/malformed sender headers become durable incomplete-content issues while other messages progress. Oversized list/history/profile responses still fail the page. Network/authentication failures remain retryable failures, never skipped messages. Full RFC mailbox/encoded-header support and large-message retrieval remain work.
- Labels/read state/folders, attachments, notifications, outbound reply correlation and search are not represented by the current sync schema.
- A page can require up to 27 bounded HTTP calls; production orchestration needs an overall execution budget, retries/backoff and quota management. No live provider calls, routes, scheduler or credential activation were added.

Docker tests remain pending in the parent task. Injected fixtures cover full watermark ordering/preservation, history collapse/pagination, expired cursor versus deleted message, 31-change durable subpaging, cross-page deletion, changed/expired replay, identity mismatch, malformed responses and unsupported bodies.

Official references checked 6 October 2026:
- [Synchronization guidance](https://developers.google.com/workspace/gmail/api/guides/sync)
- [History pagination and expired cursor behavior](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)
- [Message payload and MIME representation](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages)
- [Profile history watermark](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile)
