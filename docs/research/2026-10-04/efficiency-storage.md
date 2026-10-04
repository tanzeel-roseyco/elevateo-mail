# Storage and query efficiency

Research checked 4 October 2026. **Proposals, not approved backend requirements.** Ten private users, 600 outgoing/user/day and 30/connected-mailbox/day are confirmed ceilings. Inbound volume, mailbox count and retained history are unspecified; no performance results exist. The A$15 hosting goal excludes provider mail and AI costs.

## Macro decisions

Keep D1's working index small: ownership, connection/provider IDs, thread IDs, dates, labels, bounded subject/snippet, sender summary, attachment descriptors and content references. Keep authoritative consent, suppression, approved drafts and send identities separately; they cannot expire merely because inbox cache does. Fetch Gmail bodies/attachments on demand with a bounded cache; store imported originals and approved outbound content durably in R2. Provider deletion/offline access makes a cache different from a backup: agree whether users need independent copies.

Gmail partial sync reads changes after a saved history ID; expired history returns 404 and requires full sync. Paginate recovery, checkpoint committed batches and expose stale status rather than an empty inbox. Cap concurrent recovery/import work per user and reserve resources for receipt/suppression processing. [Google sync](https://developers.google.com/workspace/gmail/api/guides/sync)

Propose 180 days of detailed working metadata, bounded older references, and user-approved archival/deletion. R2 objects are not searchable mail indexes: older-search scope and rehydration must be explicit. Imported originals remain durable until explicit deletion/agreed retention; only staging and provider-cache objects expire automatically.

## Micro decisions

- Start lists at 50 items, hard maximum 100; use stable `(received_at,id)` keyset cursors bound to owner, filters and connection. Fetch details separately; omit repeated exact totals and bodies from list responses.
- Candidate indexes: `(owner,connection,received_at,id)` for mailbox lists; `(owner,received_at,id)` for unified lists; unique `(owner,connection,provider_message_id)` for deduplication. Label joins need matching ownership/message keys. Retain an index only for a demonstrated query; leftmost columns matter. Verify plans and measured reads; avoid leading-wildcard scans and premature full-text indexing. [D1 indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/)
- Do not rewrite unchanged metadata during reconciliation. Measure write amplification, including indexes, receipts and label mutations; D1 bills scanned rows, indexes consume space, and indexed-column writes add billed writes. Paid allowances currently include 25 billion reads, 50 million writes/month and 5 GB storage across the account. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- Reserve bytes/count before imports; stream MIME parsing with bounded nesting, expansion and attachment size. Use resumable batches and owner-scoped manifests, never user-supplied object paths. Authorise every download and deletion; prefixes alone do not enforce tenant isolation.

## Two arithmetic tradeoffs

1. At the ceiling, 6,000/day × 30 = 180,000 outgoing/month. Assumed 2 KB metadata = 0.36 GB/month; assumed 100 KB bodies add 18 GB/month. Six months becomes 2.16 GB metadata versus 108 GB bodies, before indexes, inbound, attachments and backups. Lazy content materially changes capacity, but sacrifices independent offline history unless archived.
2. R2 Standard: 100 GB total minus 10 GB free costs US$1.35/month; doubling to 200 GB with backups costs US$2.85. At illustrative FX 1.70 and 10% tax, that extra storage is A$2.81/month. Request charges, rounding and shared allowances also matter; this is not a complete hosting bill. [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

## Validation and unresolved decisions

In Docker, seed ordinary and ceiling histories; measure p95 first/deep-page latency, scanned/returned ratio, bytes/index, writes/sync and peak import memory. Proposed gate: p95 list response below 300 ms under simultaneous sync/import; indexed work scales with page size rather than history depth. Test duplicate timestamps, cursor filter changes, quota exhaustion and cross-owner IDs/objects. These are targets, not results.

D1 Paid Time Travel covers 30 days without extra recovery charges; rehearse encrypted logical exports/object manifests, bounded backup rotation and sends-paused restore. Include backups in quotas; same-account R2 alone is not independent disaster recovery. [D1 recovery](https://developers.cloudflare.com/d1/reference/time-travel/)

Resolve mailbox/inbound/history allowances, offline/full-text needs, cache/retention consent, attachment/import limits and backup independence before promising price or capacity.
