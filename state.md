# Project state

Status: backend foundation implemented on feature/backend-foundation under explicit 2026-10-05 authorisation. Frontend work belongs to the separate Fable worktree; desktop and live integration remain pending.

## Repository
- Local: C:\Users\Tanzeel\Code and projects\Elevateo Mail
- Private GitHub: https://github.com/tanzeel-roseyco/elevateo-mail
- Product and repository branding renamed. Existing mailroom:* browser-storage keys are preserved to avoid losing prototype data.

## Completed
- Approved frontend standards and interactive browser prototype: inbox, compose, campaigns, contacts, activity, settings and search.
- Six initial research assignments (three Codex, three actual Claude CLI sessions), followed by ten connection/efficiency assignments; reports and synthesis in docs/research/2026-10-04/.
- The ten follow-up assignments ran in waves because the environment permits three concurrent child agents; ten simultaneous agents were not available.
- Product master plan, backend blueprint, efficiency plan, connection/provider/MCP/DNS contracts and draft backend standards.
- Scoped branding review: 168 lines, six changed lines, zero confirmed defects. Four planning findings incorporated into the synthesis or retained as explicit launch decisions.
- Historical frontend review: 57 defects found, 56 fixed, one deferred. Fresh Docker validation on 2026-10-04: lint/typecheck/build passed; 101 unit/component tests and 27 browser tests passed, with one intentional mobile skip. Desktop/mobile branding visually inspected. See docs/validation/2026-10-04.md for evidence and cleanup.

## Confirmed pilot
Ten completely separate users, up to ten mailboxes each (100 total). Maximum 30 outgoing emails per connected mailbox per day: effective maximum 300/user/day and 3,000 total/day. The earlier 600/user/day figure is an expansion scenario, not a pilot allowance.

Existing Google inboxes from separate organisations/personal Gmail; Resend for eligible opted-in campaigns; staged self-hosted support. Users bring their own provider keys and local Codex/Claude accounts. AI can read selected mailboxes and draft by default; sending is separately enabled and approved. Approved campaigns run in the cloud when the PC is off.

Private Connections can manage explicitly approved subdomains through a narrowly authorised broker. Preserve company root MX and existing inbound consumers. No DNS or provider credentials were changed. Hunter remains optional personalisation.

Hosting target: under A$15/month, excluding mailbox/provider/AI subscriptions, external verification and signing. Proposed 50 GB cloud file allowance and history/import limits remain subject to review; cost examples are conditional.

## Approval and launch decisions
- Backend foundation implementation authorised explicitly on 2026-10-05, credentials last. Production/desktop standards and policy decisions remain open; the foundation uses conservative simulation defaults.
- Review master plan sections individually: rolling 24-hour/per-recipient quota semantics; history, imports and storage; authentication/MFA and regions; one named self-hosted adapter and AMF identity; Google external OAuth and AI data-policy compliance; independent backup/key recovery and outage alerts.
- Frontend STANDARDS section 3 private-helper amendment still needs confirmation.
- Dependency maintenance: three moderate development-tool audit entries share one Vitest advisory. No production dependency entry was reported; upgrade and revalidation remain outstanding.
- Deferred prototype review finding: some mutations bypass MailroomGateway. Route them through the API seam with pending/error/conflict handling during backend integration.

## Next live integration sequence, after release decisions
1. Authentication and two-user isolation; one real Gmail connection and incremental sync.
2. Durable sending ledger, quota reservation, consent/suppression, recovery and cloud scheduling.
3. Resend and a named self-hosted adapter; controlled history imports.
4. Windows shell and restricted local AI bridge; Connections permissions.
5. Scoped DNS changes only after record-level authorisation is proven; restore/load/security/Windows launch checks.

Read docs/product-master-plan.md first, then docs/backend-blueprint.md. Research reports are evidence; older capacity scenarios do not override the pilot above.

## Backend foundation handover (2026-10-05)
Interrupted CLI backend files were preserved and extended. No frontend source or Fable worktree was changed. See docs/backend-foundation.md, code-reviews.md and output/backend-agent-result.md for contracts, verification, review dispositions and credentials-last gates. Real sending, DNS writes, deployment and pushing remain disabled.

Backend completion verification (2026-10-05): final Docker types/lint/typecheck/dry-run bundle and 24 tests passed. Twelve adversarial/design defects fixed. Task-owned Docker image/cache removed; persistent volumes retained. See docs/validation/2026-10-05-backend.md. Committed implementation retains disabled real sending, DNS and deployment; original CLI artifacts remain uncommitted.


## Credential-free HTTP integration milestone (2026-10-05)

Backend-owned first journey implemented: capability discovery, stable mailbox inventory/independent AI read-draft flags, bounded summaries/lazy plaintext bodies, authoritative mailbox/owner quota and immutable create-approve-inspect-cancel. Portable runtime DTOs and HTTP client are the frontend seam: [integration v1](docs/contracts/integration-v1.md). [Docker-only synthetic fixture instructions](docs/integration-fixtures.md). Actual Fable gateway/UI wiring is still owned by Fable and has not been claimed complete here.

Due approval enqueues immediately; one-minute relay performs bounded reconciliation. Unknown outcomes never release quota or trigger blind resend. Independent persisted-envelope digest rejects corruption before invocation; legacy undigested requests fail closed. Only connected records count toward ten connection slots, while historical charges survive replacement under the provisional 300 owner/30 mailbox rolling 24-hour recipient policy. Ten users therefore permit at most 3,000 recipient sends/day under this rule; production policy approval remains open.

No credentials, DNS writes, real providers, external email, deployment or push. Original interrupted CLI artifacts remain preserved. Docker types/lint/typecheck/dry-run bundle, all 38 tests and the separate HTTP demo passed. Six review defects were fixed. [Validation and cleanup](docs/validation/2026-10-05-integration.md) records scoped image/cache removal, retained persistent volumes and the host-space/compaction limitation. Credentials-last production gates remain in fixture instructions.
