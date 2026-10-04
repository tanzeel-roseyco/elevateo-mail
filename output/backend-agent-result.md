# Backend foundation handover

Completed on `feature/backend-foundation` in the existing backend worktree. Preserved the interrupted CLI's backend work and output artifacts; the Fable frontend worktree was used only as a read-only reference. No push or production deployment occurred.

## Implemented

Credential-free modular Worker, five additive D1 migrations, owner-scoped hashed-session API, ten-user/ten-mailbox caps, immutable send intents and atomic 30-recipient rolling-24-hour quotas across manual/campaign/AI paths. Approval binds the exact content hash; dispatch rechecks permissions, consent, suppression and campaign state. Durable simulated receipts survive restart; uncertain outcomes stay unknown without blind replay. Database/config pauses fail closed and restore forces pause.

Authenticated deduplicated fake inbound/bounce/complaint/reply events; unsubscribe confirmation and opt-out; plaintext lazy messages with stable pagination; contacts/consent import and campaign state; scoped AI context/drafts with separate approved sends. Gmail and Resend adapters are dormant, bounded and contract-tested with truthful capabilities. Optional enrichment is explicitly disabled. DNS is an exact approved-subdomain preview policy with root MX/inbound protection and no writer. R2 is a reserved binding; attachment sync/storage is not implemented.

The frontend gateway remains unchanged. [API, setup, conservative defaults and integration limitations](../docs/backend-foundation.md) explain its future mapping to send intents and truthful status. This foundation does not claim a complete inbox, desktop product or production readiness.

## Verification and reviews

Final clean Docker image passed generated types, lint, strict typecheck, dry-run Worker bundle and **24 tests** including local D1 integration, concurrency, restore and HTTP-to-queue workflow. Three adversarial/design reviewers reported **12 defects, all fixed**; review exposure 1,657 lines and density 7.24/1,000. [Review record](../code-reviews.md), [validation and Docker cleanup](../docs/validation/2026-10-05-backend.md), [test log](backend-check.log).

Task-owned image and 1.699 GB BuildKit cache removed; zero images/containers/cache remain. Two pre-existing persistent volumes retained. Host free-space snapshots increased approximately 1.28 GiB. Supported trim completed; further offline compaction requires unavailable elevation/tooling. Docker Desktop stopped. Original CLI logs, prompt and launch script remain untouched and uncommitted; they are not backend deliverables.

## Minimal credentials checklist — future integration only

No secrets are needed now. Enter future secrets through provider login or protected Workers secret storage; never chat, git, browser bundles or logs.

1. Cloudflare least-privilege Worker/D1/R2/Queues provisioning identity and resource IDs; no DNS permission. Agree independent backup/key ownership.
2. Google OAuth client/secret, approved scopes and redirect URI; per-user consent and encrypted refresh-token storage after authentication/refresh implementation.
3. Optional per-user Resend key, verified campaign identity and authentic webhook verification key after its live protocol is implemented.
4. Local Codex login only after the restricted bridge exists; Claude and identified enrichment service keys are optional later. DNS remains manual and requires no key.

Credentials alone cannot activate live sending: production dispatch, OAuth/sync, webhook authenticity, alias identity governance, frontend integration, cloud scheduling, recovery/load/cost checks and final live-policy approval remain explicit gates. Real sending, DNS writes and production deployment are disabled.
