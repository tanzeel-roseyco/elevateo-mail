# Project state

Updated: 2026-10-12.
Status: **autonomous local completion in progress; initial architecture and BE-01 task design accepted; Devin partial draft preserved and suspended; FE-01 read checkpoint accepted**.

## Current execution evidence

- Active clean checkout: `Elevateo Mail - Local Completion`, branch `feature/local-completion`, base `103baeb042925badbbc50dc0d3d3bfbf09ce8344`. Original and sibling frontend/backend/integration workspaces are preserved.
- Claude CLI 2.1.296 returned successful independent `claude-fable-5`, `claude-opus-5-5` and `claude-fable-5-1` opinions with matching runtime model identities. See `.planning/consultations/results/initial-plan/metadata.json`. Earlier failures below describe historical attempts.
- Actual `gpt-6-astra` MAX initial synthesis completed as `/root/plan_synthesis`; see `docs/decisions/0002-local-architecture.md`. Every later bounded implementation task still needs its own three opinions and synthesis.
- Official Devin MCP authenticated; read-only session `b111d44287f34ba4be9f62961e5b6424` verified repository main/base and Docker 29.7.2/Compose 5.4.0. The subsequent BE-01 session produced incomplete draft PR #5 at 5a9d83a and is verified suspended; code and reported checks remain unaccepted. Current-user DPAPI protects the organization Member credential outside Git.
- Fable 5.1 completed a read-only inventory of first-party Ledger frontend primitives and API components at integration commit `4322cfb`; the read checkpoint contract is accepted and implementation dispatch is next.
- Full user review rubric is available in the current conversation. Obsidian has no callable connection in this environment; analytical tradeoff scenarios cannot be claimed as Obsidian execution.
- No application tests or visual QA have run. No mail, purchases, production changes or signing actions occurred.

## Historical preparation and completed work

- Saved the shared Claude consultation brief, three model-specific prompts, next-agent launch procedure and Astra MAX synthesis template in `.planning/consultations`. At that historical handoff, execution was left to the next agent; the current execution evidence above supersedes that status.

- Assigned the user's Codex CLI the first research task: completed an initial 25-repository/eight-Reddit-thread scan (six public opens, two snippets); no new commit pins or runtime audits claimed.
- Actually assigned GPT-6 Astra at MAX effort the polyglot system/backend proposal. Added agent roles, task/PR/issue lifecycle, language boundaries, client/CLI connector design, nine-address/no-live-send activation plan and bounded backlog.
- Attempted three independent exact-model Claude consultations. All failed before inference because OAuth had expired and could not refresh; zero opinions were produced. Recorded capability evidence without secrets. Devin is documented through its official MCP route but is not configured here and performed no backend work.

- Prepared a clean feature/local-completion checkout from main cc02616. Downloaded Devin CLI documentation, installed native CLI 3000.11.3, verified browser authentication, and completed two bounded read-only Devin assessments through Codex shell invocation. Fable retains frontend ownership. See docs/research/devin-cli/README.md for verified connection details and assessment limitations.

- Inspected the original planning-only repository and recorded its standards gate; the later local-completion brief now defines a scoped execution path.
- Recorded the user-selected Resend and self-hosted Supabase stack and current approximately 10-person company-mailbox scope.
- Produced architecture, requirements, database/backend/CAP tutorial, delivery/DNS/hosting guide, desktop/MCP design, reliability contracts, reuse plan and implementation milestones.
- Added an end-state vision describing the daily team workflow, finished product deliverables and observable completion criteria in docs/end-goal.md.
- Added LOCAL_BUILD_PROMPT.md and docs/local-completion-plan.md for the next agent: reuse local frontend components, complete real local services and simulated end-to-end mail, verify connectors/desktop/operations, and leave actual credentials to final activation.
- Used the user's installed Codex CLI 0.159.3 (`codex exec`, exit 0) to author the database/backend tutorial, then reviewed and harmonized it with verified provider facts.
- Imported 2,764 exact tracked files from all six pinned upstream repositories, with full per-file manifests and preserved notices. BillionMail AGPL source is included as reference material, not linked into an Elevateo runtime. One published sample TLS private-key file is explicitly omitted.
- Added six independent dossiers, component adoption decisions, goal traceability and reproducible importer/verifier tooling. Used Codex CLI again for bounded tooling review and fixture tests; two tooling defects were fixed with regressions.
- Performed bounded independent documentation reviews plus a design-tradeoff review; findings and verification are recorded in code-reviews.md.

## Not implemented or deployed

Upstream application source is now present as an inert reference collection. No integrated Elevateo application, installed runtime dependencies, SQL migrations, working provider adapter, web UI, native installer, MCP server, infrastructure or production mailbox has been created. No credentials, DNS records, purchases or email sending were needed for this update. Documentation examples are not functioning integrations.

## Selected versus proposed

Selected by user: Resend, self-hosted Supabase; ten staff/nine addresses across one or two domains; web, Mac/Windows, Java Android and SwiftUI iOS; Claude/Codex mailbox and in-app connectors; expanded language/agent workflow.
Accepted local architecture (ADR 0002): Rails API/worker, React/TypeScript, PostgreSQL durable jobs, Rust/Tauri Mac and C# Windows, bounded PHP/Go/Python tools, conditional other languages, local read/search/draft MCP and separate in-app process adapters. This supersedes the earlier Node/Tauri-for-both proposal. Initial named Claude opinions and Astra MAX synthesis are complete; every implementation task retains its own consultation gate. Reuse suitable existing first-party frontend work if it appears before implementation. VPS/Compose hosting remains a recommendation for later production decisions. The local brief supersedes the earlier blanket standards gate for its bounded scope; it does not claim blanket approval or live activation authority.

## Next steps

1. Monitor the bounded BE-01 Devin implementation for issue #3, review its actual diff and Docker evidence, and pause at its checkpoint. Complete fresh FE-01 opinions and Astra synthesis before assigning the frontend writer.
2. Complete the entire locally testable journey with real database/auth/storage, fake mail transport, actual browser validation, scoped connectors, available-platform desktop checks and restore evidence before asking for live credentials.
3. Use the full user review rubric, at-most-200-line adversarial assignments and a dedicated design reviewer. Record actual coverage, defects and density. Obsidian execution remains unavailable.
4. Before deployment, confirm domain/MX ownership, mailbox/alias count, migration/history needs, message purposes/volume, region, retention, operating owner and recovery tier. Do not replace existing MX by assumption.
5. Only after the local acceptance report, configure real credentials, production hosting and signed distribution through the documented activation gates. Controlled Resend sends and Instantly warmup additionally require an explicit change to the no-live-send constraint. Report untested target platforms or clients explicitly.

Single-VPS operation is not high availability. Resend's private-beta Inboxes is not a launch dependency, and Resend does not permit unsolicited cold outreach. The application owns durable history and permissions while Resend remains an external processor.

### Devin credit authorization (2026-10-12)

The user explicitly approved use of existing $10 Devin credit; no purchases or top-ups. BE-01 task design is accepted. Implementation was dispatched from frozen planning commit `5ae9771`. Codex polls at two-minute intervals and pauses at the 30-minute checkpoint or credit/capability loss. Official MCP sleep is verified; the Free account API omits dollar usage and offers no dollar-cap field, so no enforced task dollar cap is claimed.

BE-01 dispatched through official Devin MCP at 2026-10-11T16:34:21Z: session `257567ddf6b743c8b9dad365f52e3f99`, implementation base `5ae9771ad30923a66a2a5ed6aa5d6902d3e439d2`, branch `devin/backend/be-01`. Existing-credit-only $10 approval; no topups. First 30-minute checkpoint at 17:04:21Z. Partial commit 5a9d83ad4de7403f349131bf0c3e45df7fd97c28 is preserved in draft PR #5; no acceptance is claimed. Session suspension verified at 2026-10-11T16:50:37Z; dollar usage remains unavailable.

FE-01 read contract and exact-model synthesis are frozen in .planning/consultations/results/fe-01 and contracts/v1. Docker generation with openapi-typescript 7.13.0 reproduced identical API types; tooling audit reported zero vulnerabilities across 34 packages. This is tooling evidence, not application acceptance. Full frontend/backend integration remains open.


### FE-01 authored checkpoint (2026-10-12)

Fable 5 authored the read-only React client under apps/web. This is an **unaccepted draft checkpoint**, not a completed or deployable application. Session/mailbox/inbox/plaintext-reader code, fixture/HTTP adapters, tests and Docker/browser configurations are present. The core API contract is unchanged. Docker API type regeneration passed, but strict compilation failed on the fixture resolver return union and missing Node declarations; unit diagnostics have three failures; the isolated Vite bundler succeeds. Mandatory lint and actual visual QA have not passed.

Adversarial review covered all non-generated authored files (2,133 unique lines) plus a dedicated design review. Sixteen localized code/test defects, two documentation defects and one lint acceptance gap remain open; see code-reviews.md and docs/evidence/fe01-initial-review. Source/API design is not runtime integration: real Rails session/storage/mailbox behavior and all mutation flows remain pending. Fresh FE-01-R1 consultation and Astra synthesis must precede repair implementation. No mail, live deployment or purchase occurred.


### FE-01 Docker diagnostic results

API regeneration passed. Strict compilation failed on FE-R12 and FE-R15. Unit tests: 63 passed, 3 failed out of 66; all failures are retained DOM from previous SessionProvider tests (FE-R17, missing Testing Library cleanup with Vitest globals disabled and no setup hook). These failures prevent validation of the affected session assertions. The separate diagnostic Vite bundle succeeded (148 modules; JS 373.92 kB / gzip 115.76 kB), but does not constitute a passing production build because typechecking failed. Lint, browser/visual checks and real backend integration remain outstanding. See `docs/evidence/fe01-initial-review/unit-bundle.txt`.

All task test containers were automatically removed. The task-owned Node image (332 MB reported image size) was removed; Docker reports zero containers and zero build cache. Pre-existing Playwright/Python images and nine persistent volumes were preserved. Host free space was only 1.42 GB after cleanup; virtual-disk reclaim remains under investigation, so no host-space recovery is claimed.


### FE-01-R1 data checkpoint (2026-10-12)

Bounded Astra LOW data repair is ready for the serialized Fable UI handoff, not overall acceptance. Pinned Docker Node 24.21.0/npm 11.19.0 passes strict types, 113 data tests, then API regeneration, all 123 unit tests with coverage and production build. Bundle inspection found none of three fixture markers; browser runtime isolation remains open. Lint fails only on the existing unused session-test waitFor import, owned by the forthcoming Fable repair. Historical broken transport baseline: 10/21 failures. Additional cancellation baseline: 2/7 failures; repaired all seven pass. The first regeneration failure was working-tree CRLF conversion; restoring canonical Git bytes recovered the exact frozen schema and generated hashes without contract changes.

Logs and source hashes: docs/evidence/fe-01-r1-data. npm audited 325 packages with zero reported vulnerabilities. Full suite coverage: statements83.28%, branches68.54%, functions81.81%, lines89.09%; no coverage-completeness claim. No UI/browser, real Rails or publication acceptance. Disposable containers auto-removed; task Node image removed; zero containers/cache. Pre-existing Playwright/Python images and nine persistent volumes retained. Host free space1,030,987,776bytes; no VHD compaction/reclaimed-host-byte claim.

Stage A source checkpoint: 3ab182fd7100628758165111ba3bf32054ae7045. This follow-up preserves the four sanitized Docker transcripts explicitly despite the global log ignore. No application bytes changed; the recorded tests still apply.
