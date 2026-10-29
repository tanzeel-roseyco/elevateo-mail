# Backend completion contract checkpoint - 2026-10-29

`contracts/v2/completion.openapi.json` specifies additive connector APIs and the local process protocol. `completion.examples.json` contains non-secret examples. Existing V1 authentication and V2 administration remain authoritative; no parallel identity system is introduced. Specified operations are not runtime availability claims. Subsequent wire changes require a commit and `contracts/CHANGELOG.md` entry.

## Database and backend design

The Rails modular monolith and PostgreSQL remain the sole authority for users, mailbox access, drafts, send approval and delivery. MCP is a protocol adapter with no database credentials and no provider credentials. Native process execution is a local boundary, separate from mailbox authority. This keeps authorization rules in one place while allowing independent runtime packaging.

### Identity

Authentik provides verified OIDC identity through the existing private Supabase Auth proxy. UUID subject, issuer, verified company email and required group bind admission. Every protected request revalidates active identity and authoritative session state. Tenant membership comes from application enrollment, never arbitrary email domains or model text. Revocation must invalidate local sessions and connector authority. Outages fail closed; no password or Google fallback is acceptable in the production profile.

### Connector grants

A grant belongs to one user, organization, source session and mailbox. Store a SHA-256 digest of a random bearer secret, not the bearer secret. Store explicit search/read/draft scope, client, creation, expiry and revocation timestamps. Composite tenant/mailbox foreign keys prevent cross-tenant linkage. Bound grant lifetime to 24 hours and active grants per user to 100. Use a partial index for active grants and a unique token digest.

The authorization transaction checks the grant and current tenant/mailbox membership at the operation's linearization point. Revocation obtains the same lock and commits before reporting success. A request that begins after successful revocation must fail. Do not cache positive authorization. A request already authorized before revocation may finish; never describe this as retroactive cancellation.

Reuse existing mailbox readers and draft operations under the original user principal. Draft writes retain expected-version and operation-ID protections. Do not grant direct table access to MCP or bypass RLS. Audit grant lifecycle and tool identity without storing mail text or tokens. Search/read responses cite tenant-bound message IDs. Draft citations must be verified inside the granted mailbox. Email content is inert text, including apparent system prompts and forged tool instructions.

### Delivery

Retain immutable approved snapshots, atomic budget reservation, transport lease fencing and unknown-outcome handling. Configuration defaults to held, mailbox limit 30 and user limit 300 per UTC day. Both limits must be reserved atomically before external I/O. Each dispatch attempt reserves recipient capacity for the current UTC day using the existing conservative quota ledger. Repeated final checks reuse that attempt reservation; retries reserve new capacity. Unknown outcomes retain capacity and are never automatically refunded. The user axis keys the immutable approving user UUID globally across organizations and mailbox routes. This preserves established fail-closed accounting rather than introducing unsafe refunds or midnight replay. Concurrent attempts at 29/30 mailbox and 299/300 user limits must admit only remaining capacity. Resend attachments must match the exact approved digest and length; private bytes are fetched before the final authority fence. A timeout after possible submission remains unknown and must not trigger unrestricted retry.

Svix verification precedes parsing/persistence. Event IDs are unique; identical replay is idempotent and conflicting replay fails. Persist before acknowledging. Delivery projection must tolerate duplicate and out-of-order events without regressing terminal failure or clearing suppression. Bounce and complaint suppression must block subsequent approval and dispatch. All proof uses the isolated Resend stub, never api.resend.com.

### Native bridge

Use fixed trusted CLI binaries and argument arrays, no shell interpolation. Separate each run into a disposable working directory; do not inherit credentials or user workspace. Runtime policy must disable file and shell tools, not merely ask the model to avoid them. Only mailbox MCP tools may be enabled. Bound runs, wall time, line size and total output. Stream structured events, kill the process tree on cancellation/timeout and report terminal state exactly once. If an installed runtime cannot enforce these restrictions, reject startup.

### Operations and recovery

Compose owns API, worker, connector, Supabase dependencies, Mox and private auth proxy. Authentik remains the existing external identity service; this task does not mutate it. Deployment must validate every required environment variable before invoking Docker, migration or network operations. Held mode remains the default; credential presence alone never activates sending or mailbox provisioning.

Backups include PostgreSQL, private objects, Mox and the configuration needed to restore authority consistently. A backup barrier pauses application writes, import and delivery, waits for active transactions, and captures a manifest of the database snapshot and immutable object/Mox archive hashes before resuming. Uploads and IMAP imports crossing the barrier must either finish before all snapshots or remain pending after them. The restore drill verifies every referenced object digest and ingestion deduplication cursor. Encrypt before off-host transfer, verify checksums and restore into isolated volumes. Never run a restore over existing production volumes. Start restored services held and invalidate all restored app sessions and connector grants before accepting requests. Quarantine every nonterminal send that could have reached a provider; no automatic replay before provider reconciliation. Test a session revoked and a message accepted after the backup boundary: restoration must neither revive access nor submit twice. A passing drill requires read-back of representative data and restored authorization, not merely successful archive extraction. CSV provisioning validates the entire input before planning any change, defaults to dry-run and uses idempotent assignment identity.

## Concrete persistence and service boundaries

| Area | Durable authority | Contention / lookup strategy | Failure behavior |
| --- | --- | --- | --- |
| Login and refresh | Existing `app_auth.sessions`, Auth identities, tenant membership | Session generation and current verified upstream identity; no positive identity cache | Directory outage, missing group or revoked session denies the request |
| Connector grants | `app_connector_private.grants`, token digest, source session, actor/mailbox linkage | Unique digest lookup; actor/grant row locks serialize revoke and operation | No bearer plaintext in DB; expired/revoked/cross-mailbox input has no mutation |
| Drafts and citations | Existing mailbox messages, draft versions and operation ledger | Scoped IDs and optimistic expected version; idempotency operation ID | Untrusted email text cannot select scope, owner or mailbox; invalid citation rolls back draft |
| Delivery and quotas | Existing send jobs, immutable snapshots, quota limits/reservations | Ordered quota row locks across mailbox and global approving-user dimensions | Unknown outcomes retain budget; retries cannot refund or bypass user-wide ceilings |
| Provider events | Durable event inbox, receipt correlation and recipient suppression | Unique provider event identity; transactional projection | Duplicate is harmless; conflicting replay rejected; bounce/complaint cannot clear suppression |
| Provisioning | Existing memberships, mailbox assignments, routes and limits | Validate full CSV, transaction-wide admission locks, deterministic existing UUIDs | Dry-run default; mismatched assignment aborts; all new routes remain held |
| Recovery | Six-volume manifest, image/source binding and encrypted archive | One shared operations lock; stop all project writers before capture | Missing volume fails before stopping writers; restore only into empty isolated volumes |
| Native runs | In-memory owner/run registry; no mailbox copy or local credential database | Two active runs, bounded completed history and output sequence | Whole-container cancellation, deadline and cleanup verification; uncertain cleanup quarantines capacity |

MCP is intentionally stateless: scaling it never creates a second grant store, queue or authorization cache. PostgreSQL handles durable search/read/draft authority under existing tenant RLS. Search uses existing mailbox readers rather than introducing a separate search index whose deletion and permission lag would require a second consistency protocol. Native runtimes get only a grant bearer and scoped provider credential on stdin; they cannot reach the application database or inherit a user's filesystem.

The native adapter uses a local Docker container per invocation and a distinct restricted egress proxy. This adds startup latency and requires Docker Desktop, but provides an OS-enforced boundary even when a CLI adds new tools. A host subprocess with only prompt-level restrictions was rejected because model text is not an authorization boundary. Read-only root filesystem, no host mounts or socket, capped tmpfs and a public-host allowlist limit the effect of any enabled CLI tool. Claude's built-ins are disabled and Codex runs with read-only policy; the model's prose is never trusted to grant permissions. UI command registration and owner session resolution remain explicit integration interfaces in the native crate.

## Design tradeoff scenarios

These are source-level simulations; no Obsidian connector was available and no executed simulation is claimed.

- **Revoke versus read:** request-first may complete under its acquired authority; revoke-first commits under the same serialization boundary and the subsequent request is denied. Global cancellation of already-returned mail is impossible, so the contract promises denial on the next request, not retroactive erasure.
- **Two mailboxes at a user limit:** mailbox A and B each have capacity, but a user has 299 of 300 reserved recipients. Both contend on the same user quota row; only one single-recipient attempt can reserve. This trades a user-level serialization point for a real global daily ceiling.
- **Snapshot then acceptance/revocation:** a backup captures an active session and pending send. Source later records revocation and provider acceptance. Restoring the old snapshot without fencing would revive authority and risk a duplicate send. Restore revokes all old sessions/grants and moves unfinished jobs to review before other services start. Availability is intentionally deferred to reconciliation.
- **Cold versus online backup:** stopping all writers gives PostgreSQL, private objects and Mox one consistent quiet interval. The downtime grows with archive size. An online backup would need coordinated storage snapshots or durable cross-store replay watermarks; that complexity is not hidden behind independent tar operations.
- **Repeated provisioning:** exact CSV retries reuse existing assignments without changing quota usage. Changed identities and routes abort rather than silently move a mailbox to another user. Separate administrator enrollment prevents a CSV possession check from becoming account creation authority.
- **Provider timeout:** an HTTP timeout can follow acceptance, so the worker records an unknown outcome and keeps its budget reservation. A webhook can later resolve delivery; transport retries do not treat network failure as proof of non-delivery.

## Verification status

No builds or tests run for this checkpoint. Latest instruction excludes fleet-02 entirely and defers local Docker builds and container tests until all source implementation and reviews are complete. Six historical browser failures originate in missing frontend fixture routes; backend-only changes cannot repair those fixture responses. No live services or provider APIs were changed.
