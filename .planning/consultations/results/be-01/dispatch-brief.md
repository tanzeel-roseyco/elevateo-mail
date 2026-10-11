# BE-01 — implementation dispatch brief

**Design ready; coordinator must attach the frozen base and session/control record at dispatch.** The user has authorized the existing $10 Devin credit without purchases/top-ups, and the coordinator reports a verified MCP sleep action. There is no per-session dollar cap or available Free-plan dollar telemetry. Read [decisions.md](decisions.md), [synthesis.md](synthesis.md), and [foundation-dependencies.snapshot.md](foundation-dependencies.snapshot.md) together. This brief supersedes the consultation draft's unresolved choices, not the immutable draft or opinions.

## Task and handoff

| Field | Value |
| --- | --- |
| Task / issue | BE-01 / https://github.com/tanzeel-roseyco/elevateo-mail/issues/3 |
| Repository | `https://github.com/tanzeel-roseyco/elevateo-mail.git` |
| Consultation base | `103baeb042925badbbc50dc0d3d3bfbf09ce8344` |
| Common packet SHA-256 | `0d78de54f791778b5528192775cdc4ec7f507cc4a0afd72e932f3a7ebe3ab335` |
| Design owner | Actual `gpt-6-astra`, effort `max`, `/root/plan_synthesis`; evidence in metadata |
| Implementation owner | One authenticated Devin session, dispatched by Codex via official Devin MCP |
| Reserved branch | `devin/backend/be-01`; verify no conflicting writer before creation |
| Intended output | One bounded draft PR and reproducible Docker evidence; no auto-merge |
| Credit / time / stop boundary | User-approved existing $10 only; no purchases/top-ups; maximum 30-minute work checkpoint; coordinator polls available state/usage every two minutes and uses verified MCP sleep on exhaustion or uncertainty; no per-session dollar-cap claim |
| Implementation base, session, monitoring record | Coordinator attaches at dispatch; not established by this synthesis |

Deliver an engineer-runnable local foundation: real Supabase identity/database/private Storage, Rails API and idle worker, deterministic fixtures, isolated application reads, local Auth mail capture and no live outbound path. No business mailbox UI/API or provider dispatch is enabled.

## Implementation order

**Checkpoint A:** Pin the audited toolchain and five backing services; adapt the pinned upstream initialization with provenance; generate ignored local credentials idempotently; establish separate bootstrap/migrator/API/worker roles and one application migration command. Add lifecycle wrappers, meaningful liveness/readiness, default external-to-database hold and runtime egress confinement. Run initial startup/config/hold/network/persistence checks. Report checkpoint evidence and usage; do not call BE-01 complete.

**Checkpoint B:** Add the four application tables and composite keys in dedicated hidden `app`; force/default-deny RLS; implement parameterized transaction-local `app.user_id` / `app.org_id` context and restricted-role tests. Provision two synthetic Auth users through its actual admin API; seed two organizations, shared/private mailboxes and explicit access. Add real private Storage fixture adapter and denied foreign/anonymous access. Finish failure, pool isolation, lifecycle, typing and service smoke checks.

Use Ruby 3.4.11, Rails 8.1.4, Steep 2.1.0; exact image digests and source commit are in the accepted audit snapshot. Do not substitute versions, add Redis/Sidekiq, implement a provider, add a second schema tool, enable a public Supabase SDK route or expose the private services to make a test pass. Escalate incompatible pins instead.

## File ownership and required evidence

Devin may implement `apps/server/**`, `ops/**`, necessary root Docker/Compose configuration, `.dockerignore`, `.gitignore`, `.gitattributes`, `.env.example`, `scripts/dev` and `scripts/dev.ps1`, and only the minimal `contracts/openapi.yaml` health/readiness/error foundation. Add `docs/evidence/be-01.md` with exact commands, commit, results, measured resources and cleanup. Do not edit frozen consultation evidence or unrelated frontend/native code.

The coordinator owns shared `README.md`, `state.md`, `documentation.md`, `.planning/STATE.md`, standards/architecture/contract reconciliation and `code-reviews.md`. Supply an exact documentation change list with the PR; the coordinator applies those updates in the same final integration commit as implementation. Before any worker commit, synchronize its README Current state and required state/documentation through a coordinator-approved documentation patch; if concurrent edits make that unsafe, leave the working diff for the coordinator to commit rather than producing a knowingly stale commit. Ownership does not waive the repository's same-commit documentation rule.

Preserve generated local credentials and persistent named database/Storage volumes. No secrets in logs, images, tests, output artifacts or Git. Fixture identities/objects are synthetic. Do not edit Supabase internal schemas directly or use service credentials as the Rails runtime database login.

## Concrete acceptance matrix — all currently not run

| ID | Docker check and required observation |
| --- | --- |
| A01 | Bootstrap a fresh disposable profile using pinned images. Actual dependency readiness succeeds; API/worker share the built image; worker is idle and held. Record platform/image digests, lockfiles, build command and source/SBOM/advisory evidence. |
| A02 | Missing secrets/invalid UUID config/nonallowlisted SMTP/provider settings fail clearly with redacted errors. No silent development fallback. |
| A03 | Invoke real Auth admin provisioning and token issuance for two synthetic users. Invite/recovery reaches Mailpit; public signup is rejected. No direct insertion into Auth internals. |
| A04 | Inspect runtime network attachments and Mailpit relay/forward/webhook settings. An isolated external-network fixture is reachable by a control container and unreachable from API/worker/Auth/catcher. No real provider contacted. |
| A05 | Assert runtime database login identities, no superuser/BYPASSRLS/table ownership/privileged role membership, and inability to SET ROLE into migrator. API reads only; worker has no business access. Fail tests if the harness is privileged. |
| A06 | Read all four protected tables with absent/empty/malformed context, foreign organization, no organization membership and private-mailbox nonmembership. Each denies or deliberately errors. Authorized shared/private reads succeed. Mutation attempts fail under current grants. |
| A07 | A fixture writer with legitimate membership in both organizations attempts forged cross-organization mailbox and membership links; composite foreign keys reject them independently of RLS. Removing organization membership cannot leave effective private access. |
| A08 | Real direct Rails pool size one: A/commit then B, A/exception+rollback then B, and a query without the wrapper. No stale claims authorize rows. Check settings after transaction; test conflicting nested context rejection and a small concurrent pool. |
| A09 | `app`/metadata schema is absent from exposed PostgREST schemas; PUBLIC/anon/authenticated/service_role cannot access its data through schema/table grants. Anonymous and real user-JWT PostgREST requests cannot access it. |
| A10 | A private Storage fixture object uploads/downloads through authorized internal adapter; wrong principal is denied; direct anonymous and user-JWT object access is denied. Inspect private bucket/policies, secret redaction and exact content hash. No public route or bucket. |
| A11 | Repeat bootstrap/migrate/seed without duplicate rows, identity changes, replaced generated secrets or lost object bytes. Stop/start preserves application rows, Auth identity and Storage content. |
| A12 | Deliberately failing migration in a disposable database leaves no effects/version entry for that migration. Document already-completed migration behavior and recovery. Application migrations do not alter Auth/Storage internals. |
| A13 | Hold remains true after application database mutation/restore; there is no release or dispatch path. Readiness truthfully reflects dependencies/hold without issuing emails or creating objects per probe. |
| A14 | Nonempty Steep/RBS application targets, required lint, unit/integration and config/contract checks pass inside Docker at the reviewed commit. Keep framework typing limitations explicit. |
| A15 | Linux/Compose and actual Windows thin-wrapper invocations exercise the same lifecycle. Coordinator runs Windows-only host invocation if Devin is Linux; application tests remain in containers. Record idle memory/CPU, Docker usage and host free space, not an invented sizing estimate. |
| A16 | Inspect mounts then stop/remove task-owned disposable containers/images/build caches after tests or failure. Retain named persistent DB/Storage volumes and credentials; record exact resources, reclaimed space and safe-compaction limits. No global prune or `down -v`. |

Require test regressions for defects and direct happy/failure coverage for each new boundary. A test that denies everything does not prove authorized behavior. Neither a fake JWT nor a privileged database harness proves real Auth/RLS. No browser visual-completion claim belongs to this foundation task.

## Before creation and before merge

The coordinator records the frozen implementation base and accepted brief hash, write/PR scope, a deduplication/task tag and supported state/usage/stop controls before creating the writer. Record the existing-credit-only authorization, maximum 30-minute work checkpoint, Codex polling every two minutes, verified MCP sleep action and reconciliation after uncertain operations. Free-plan dollar telemetry is absent: monitor the counters/state actually available and stop when credit or execution state is uncertain. Do not confuse list-cost consultation metadata, account balance, natural-language targets or a message limit with an enforced Devin task cap. Do not purchase credit, enable a top-up or exceed the user's existing-credit authorization.

On completion report changed paths, commit/PR, each A01–A16 result with evidence, unresolved risks, actual usage and cleanup. The coordinator supplies fresh adversarial review slices of at most 200 changed lines covering all affected code with the user's full rubric verbatim, a separate deep-design reviewer, and issue-linked defects/density. Repairs need their own applicable task consultation/review gate; two failed repairs escalate. Review and tests must address the final fixed commit.

No merge until required checks and reviews pass and shared documents reflect reality. Obsidian connection simulation remains unavailable; analytical reasoning is not evidence that it happened. No purchase, production activation, live send, DNS change, remote deployment or future task implementation is authorized.
