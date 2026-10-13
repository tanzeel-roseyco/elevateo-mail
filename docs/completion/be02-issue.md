# BE-02: Current sessions, mailbox reads and durable drafts

The current Rails service exposes health/readiness and tenant isolation foundations, while the React reader uses a frozen HTTP contract. Real browser sign-in, the four read endpoints and durable draft storage are missing. Implement the accepted BE-02 scope through bounded checkpoints on `feature/codex-be02-integration`.

## Execution and design

The user's latest instruction assigns local backend execution to Codex through Orca. Fable retains frontend implementation. Three independent BE-02 opinions are recorded; the Astra MAX synthesis and implementation brief govern final decisions. Do not start application changes before that synthesis is complete. No additional ultrareviews, purchases, production activation or real email sending are authorized by this issue.

## Checkpoints

- **A — identity and mailboxes:** invite-only real local Auth; opaque durable cookie sessions; current identity and expiry enforcement; CSRF/Origin validation; refresh/logout/organization-switch ordering; `GET /v1/session` and `GET /v1/mailboxes`.
- **B — thread reads:** persisted synthetic threads/messages, the two remaining frozen read endpoints, tenant/mailbox isolation, bounded cursor pagination and serialized byte limits.
- **C — durable drafts:** create/read/save, JSON `expected_version`, 409 conflicts, and durable operation-result reconciliation after a lost response and later save.
- **D — collaboration and search:** assignment, notes, read state, bounded search and the membership administration required by the accepted product scope.

Keep one owner for shared routes, migrations and configuration. Preserve existing read contract semantics; freeze additions before frontend integration. No privileged Auth key in Rails or browser, no external provider transport, no HTML message rendering and no fixture identity fallback in production code.

## Acceptance

- Tests run in Docker against real local Auth and PostgreSQL using restricted application roles. Real issuance, invite delivery into Mailpit, public-signup denial and real-identity RLS are part of A acceptance. BE-01's separate Storage/native/provenance obligations remain open.
- Cover revoked/expired/missing sessions, Auth outage, refresh/logout races, context changes, private/foreign mailbox denial, invalid cursors and response limits.
- Prove draft persistence across restart, stale-version conflict and replay/lookup of an earlier save after a later save. Include authorized and unauthorized result lookup.
- Run lint, strict type checks, relevant unit/integration tests and actual integrated browser/visual checks before acceptance. Fixture-only frontend results do not establish backend integration.
- Complete bounded adversarial code reviews and a dedicated design review; record coverage, defect count and density. Keep README Current state, state and documentation synchronized with implementation commits.
- Clean only task-owned disposable Docker resources and report what was retained. Never prune unrelated workloads or persistent data.

This issue establishes the implementation work; it does not claim any checkpoint is complete.
