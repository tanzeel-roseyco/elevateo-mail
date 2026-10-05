# Bounded inbox search

GET /v1/messages/search requires the normal authenticated account-bound session. Parameters: mailboxId, q (trimmed 3–100 characters), optional limit (1–25, default 25), and paired before/beforeId continuation. Unknown or duplicated parameters are rejected. Foreign mailbox IDs return 404.

Search matches literal substrings in subject or sender only. Percent, underscore and backslash are escaped; they are not wildcard syntax. SQLite LIKE folds ASCII case, not general Unicode case. Bodies and attachments are not searched. Disconnected mailboxes can still have their stored messages searched.

Each request examines at most 1,000 metadata rows using the existing owner/mailbox/time index. The result includes search.scope=subject_sender, search.scanned and search.scanLimit=1000. A next cursor means more metadata may remain, even when items is empty. The UI must offer explicit Continue search and never automatically scan all pages. Cursor progress stops at the final returned match when the result limit is reached, so no overflow matches are skipped. A full final window may require one empty concluding request.

This limits per-request database reads; it is not an instant full-mailbox index or a fixed total search cost. A million-message mailbox can require roughly 1,000 explicit continuation requests in the worst case. New arrivals ahead of a cursor require restarting search. Full-text indexing should be considered only after real usage establishes that its extra storage, write maintenance and different token semantics are justified. No new service or dependency is required.

Focused real-D1 tests cover wildcard literals, sender case, body exclusion, empty-window continuation, overflowing results, invalid bounds, authentication and owner isolation. Validation is run in Docker with the backend suite.
