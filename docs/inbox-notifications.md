# Inbox notifications

Enable notifications from Inbox using the explicit button. Browser permission is required. Opt-in lasts only for the current authenticated tab session; logout, account change, or an unavailable session switches it off and closes the displayed notification. Notifications contain only a generic new-mail notice, never sender, subject, or body. Only one notification is retained per tab. Multiple independently opted-in tabs can each notify.

There is no extra polling, service worker, or background process. Notifications follow existing mailbox inventory refreshes, including the refresh after a Gmail sync action. Keeping a tab open alone does not guarantee immediate notification: mailbox data must refresh. Closing the browser stops notifications. This is not desktop push delivery.

Migration 0019 adds a mailbox-scoped monotonic arrival counter. A transactional insert trigger increments it only for new Gmail inbox cache rows during incremental history processing. Initial/full scans, cursor-reset rescans, historical imports, and updates to existing rows are excluded. Failed sync commits cannot increment it; replayed upserts do not increment it twice. A message deleted from the inbox and later reinserted during history processing counts as an arrival again. Unsupported messages become issues and notify only if successfully inserted later during incremental sync. The counter saturates at the largest exact JavaScript integer.

The mailbox contract adds `arrival_count` (camel-case `arrivalCount` in the UI). Missing counters from older servers default to zero. On opt-in, existing counters become a baseline; newly connected mailboxes also establish their own baseline, so previous mail cannot flood notifications. No message identifiers or notification preference are persisted in browser storage. Counter state is bounded to the ten connected Gmail mailboxes permitted per account.

Docker verification and visual validation are required before publication; the implementation's unit and D1 regression tests cover opt-in, replay, history exclusion, account switching, and failed commit isolation.
