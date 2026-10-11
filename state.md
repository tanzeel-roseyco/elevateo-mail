# Project state

Updated: 2026-10-12.
Status: **autonomous local completion in progress; BE-01 design accepted; BE-01 implementation checkpoint A partial on draft branch `devin/backend/be-01`; BE-01 incomplete**.

## Current execution evidence

- BE-01 (Devin session 257567ddf6b743c8b9dad365f52e3f99, base `5ae9771`): checkpoint A partially implemented and committed to a draft PR. A01, A05, A11 and A13 are partial; A02 and A04 passed their listed cases; A03, A06-A10, A12 and A14 were not run; A15 ran on Linux only, with no Windows run; A16 is partial. Blockers: the `seed`/`check` Compose services, fixture role, Auth admin seed, Storage adapter, RBS/Steep/lint/tests, SBOM/advisories and a `pg_dump` structure-dump tool do not exist yet. Persistent local volumes, ignored credentials, pinned pulled images and 118.5 MB of build cache that ID-filtered prune would not remove are retained. Disposable containers, the runtime network, the built server image and most of the build cache were removed. See the cleanup section of docs/evidence/be-01.md. The coordinator observed no Devin credit/usage figure.
- Active clean checkout: `Elevateo Mail - Local Completion`, branch `feature/local-completion`, base `103baeb042925badbbc50dc0d3d3bfbf09ce8344`. Original and sibling frontend/backend/integration workspaces are preserved.
- Claude CLI 2.1.296 returned successful independent `claude-fable-5`, `claude-opus-5-5` and `claude-fable-5-1` opinions with matching runtime model identities. See `.planning/consultations/results/initial-plan/metadata.json`. Earlier failures below describe historical attempts.
- Actual `gpt-6-astra` MAX initial synthesis completed as `/root/plan_synthesis`; see `docs/decisions/0002-local-architecture.md`. Every later bounded implementation task still needs its own three opinions and synthesis.
- Official Devin MCP authenticated; read-only session `b111d44287f34ba4be9f62961e5b6424` verified repository main/base and Docker 29.7.2/Compose 5.4.0. No backend implementation yet. Current-user DPAPI protects the organization Member credential outside Git.
- Fable 5.1 completed a read-only inventory of first-party Ledger frontend primitives and API components at integration commit `4322cfb`; implementation remains pending accepted task contracts.
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

1. Finalize the fresh BE-01 synthesis and bounded official Devin dispatch for issue #3. Exact runtime pins and the five-service Supabase foundation are researched; application implementation remains pending.
2. Complete the entire locally testable journey with real database/auth/storage, fake mail transport, actual browser validation, scoped connectors, available-platform desktop checks and restore evidence before asking for live credentials.
3. Use the full user review rubric, at-most-200-line adversarial assignments and a dedicated design reviewer. Record actual coverage, defects and density. Obsidian execution remains unavailable.
4. Before deployment, confirm domain/MX ownership, mailbox/alias count, migration/history needs, message purposes/volume, region, retention, operating owner and recovery tier. Do not replace existing MX by assumption.
5. Only after the local acceptance report, configure real credentials, production hosting and signed distribution through the documented activation gates. Controlled Resend sends and Instantly warmup additionally require an explicit change to the no-live-send constraint. Report untested target platforms or clients explicitly.

Single-VPS operation is not high availability. Resend's private-beta Inboxes is not a launch dependency, and Resend does not permit unsolicited cold outreach. The application owns durable history and permissions while Resend remains an external processor.

### Devin credit authorization (2026-10-12)

The user explicitly approved use of existing $10 Devin credit; no purchases or top-ups. BE-01 task design is accepted. Implementation dispatch is being frozen to the planning commit. Codex polls at two-minute intervals and pauses at the 30-minute checkpoint or credit/capability loss. Official MCP sleep is verified; the Free account API omits dollar usage and offers no dollar-cap field, so no enforced task dollar cap is claimed.
