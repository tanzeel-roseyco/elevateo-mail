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

## Verification status

No builds or tests run for this checkpoint. Latest instruction excludes fleet-02 entirely and defers local Docker builds and container tests until all source implementation and reviews are complete. Six historical browser failures originate in missing frontend fixture routes; backend-only changes cannot repair those fixture responses. No live services or provider APIs were changed.
