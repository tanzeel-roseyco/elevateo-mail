# Planning state

Canonical session state: [state.md](../state.md). Product decisions: [master plan](../docs/product-master-plan.md). Detailed implementation direction: [blueprint](../docs/backend-blueprint.md).

4 October 2026: six initial research assignments plus ten connection/efficiency assignments and synthesis complete. Confirmed pilot: ten private users, up to ten mailboxes each, 30 sends/mailbox/day; effective maximum 300/user/day and 3,000 total. History/import allowances remain open. Local directory and private GitHub repository renamed to Elevateo Mail / elevateo-mail.

Frontend-only prototype exists; branding updated and scoped adversarial review completed. Fresh Docker checks passed: lint, typecheck, build, 101 unit/component tests and 27 browser tests, with one intentional mobile skip. Desktop/mobile branding was visually inspected. Task-owned Docker resources were removed; see [validation](../docs/validation/2026-10-04.md). Three moderate development-tool audit entries for one Vitest advisory remain outstanding.

2026-10-05: backend foundation authorised and implemented on feature/backend-foundation, credentials last. Owner-scoped simulated API/ledger, provider contracts, signed fake events, suppression, AI scopes and manual DNS policy exist. No installed desktop, real provider integration, DNS writer or local CLI bridge exists. [Backend standards](BACKEND-STANDARDS.md) distinguish implementation authorisation from unresolved production decisions. See canonical state for historical prototype deviations and launch/storage decisions. Research contracts do not substitute for implemented features.

Backend completion verification (2026-10-05): final Docker types/lint/typecheck/dry-run bundle and 24 tests passed. Twelve adversarial/design defects fixed. Task-owned Docker image/cache removed; persistent volumes retained. See docs/validation/2026-10-05-backend.md. Committed implementation retains disabled real sending, DNS and deployment; original CLI artifacts remain uncommitted.


## Credential-free HTTP integration milestone (2026-10-05)

Backend-owned first journey implemented: capability discovery, stable mailbox inventory/independent AI read-draft flags, bounded summaries/lazy plaintext bodies, authoritative mailbox/owner quota and immutable create-approve-inspect-cancel. Portable runtime DTOs and HTTP client are the frontend seam: [integration v1](../docs/contracts/integration-v1.md). [Docker-only synthetic fixture instructions](../docs/integration-fixtures.md). Actual Fable gateway/UI wiring is still owned by Fable and has not been claimed complete here.

Due approval enqueues immediately; one-minute relay performs bounded reconciliation. Unknown outcomes never release quota or trigger blind resend. Independent persisted-envelope digest rejects corruption before invocation; legacy undigested requests fail closed. Only connected records count toward ten connection slots, while historical charges survive replacement under the provisional 300 owner/30 mailbox rolling 24-hour recipient policy. Ten users therefore permit at most 3,000 recipient sends/day under this rule; production policy approval remains open.

No credentials, DNS writes, real providers, external email, deployment or push. Original interrupted CLI artifacts remain preserved. Docker types/lint/typecheck/dry-run bundle, all 38 tests and the separate HTTP demo passed. Six review defects were fixed. [Validation and cleanup](../docs/validation/2026-10-05-integration.md) records scoped image/cache removal, retained persistent volumes and the host-space/compaction limitation. Credentials-last production gates remain in fixture instructions.

## Server-owned recovery and browser boundary (2026-10-05)

Continued feature/backend-foundation from 5fe7193. Read Fable integration 5973eb4 and handover a5aa594; its worktree was not edited. Contract was extended before implementation: opaque GET /v1/me, bounded owner GET /v1/send-intents, lazy GET /:id/content, atomic POST /:id/replace, and bodyless POST /v1/session/logout. Identical replacements converge; conflicts never approve or send automatically. Docker-only cookie provisioning is separate from the Worker. HttpOnly/Secure/SameSite cookies, exact Origin plus CSRF marker, D1 expiry and revocation protect the browser boundary. Non-browser bearer compatibility remains.

Canonical handoff: docs/handover/2026-10-05-server-recovery.md. Fixture instructions: docs/integration-fixtures.md. Recovery content lives in D1, not frontend localStorage. Separate AI permissions and all existing conservative send/quota/unknown recovery protections remain. Production IdP, actual combined browser cookie/visual verification and live integrations are incomplete. No credentials, external sending, DNS, deployment or push; original uncommitted CLI artifacts preserved.
Final Docker verification: generated types, lint, strict typecheck, dry-run bundle and 45/45 tests passed; separate HTTP simulated acceptance demo passed. Adversarial/design review complete, three source/test and one documentation finding fixed. Task image and 24 exact build-cache records removed (1.203 GB reported); persistent volumes retained. Validation: docs/validation/2026-10-05-server-recovery.md.
