# Project state

Updated: 2026-10-12.
Status: **expanded plans and initial research ready; required opinion synthesis and application implementation pending**.

## Completed

- Saved the shared Claude consultation brief, three model-specific prompts, next-agent launch procedure and Astra MAX synthesis template in `.planning/consultations`. Per the latest user instruction, execution is left to the next agent; no consultation or authentication was retried while saving the handoff.

- Assigned the user's Codex CLI the first research task: completed an initial 25-repository/eight-Reddit-thread scan (six public opens, two snippets); no new commit pins or runtime audits claimed.
- Actually assigned GPT-6 Astra at MAX effort the polyglot system/backend proposal. Added agent roles, task/PR/issue lifecycle, language boundaries, client/CLI connector design, nine-address/no-live-send activation plan and bounded backlog.
- Attempted three independent exact-model Claude consultations. All failed before inference because OAuth had expired and could not refresh; zero opinions were produced. Recorded capability evidence without secrets. Devin is documented through its official MCP route but is not configured here and performed no backend work.

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
Current provisional Astra MAX proposal: Rails API/worker, React/TypeScript, PostgreSQL durable jobs, Rust/Tauri Mac and C# Windows, bounded PHP/Go/Python tools, conditional other languages, local read/search/draft MCP and separate in-app process adapters. This supersedes the earlier Node/Tauri-for-both proposal. Named Claude opinions and synthesis remain pending. Reuse suitable existing first-party frontend work if it appears before implementation. VPS/Compose hosting remains a recommendation for later production decisions. The local brief supersedes the earlier blanket standards gate for its bounded scope; it does not claim blanket approval or live activation authority.

## Next steps

1. Read .planning/README.md; deepen pinned shortlist audits and obtain/synthesize the three required model opinions through supported authenticated runners. Then execute LOCAL_BUILD_PROMPT.md and docs/local-completion-plan.md. No application was built by this handoff edit.
2. Complete the entire locally testable journey with real database/auth/storage, fake mail transport, actual browser validation, scoped connectors, available-platform desktop checks and restore evidence before asking for live credentials.
3. Use current written requirements for review; the full historical rubric is absent, so do not claim conformance to it or let its absence block independent local work.
4. Before deployment, confirm domain/MX ownership, mailbox/alias count, migration/history needs, message purposes/volume, region, retention, operating owner and recovery tier. Do not replace existing MX by assumption.
5. Only after the local acceptance report, configure real credentials, production hosting and signed distribution through the documented activation gates. Controlled Resend sends and Instantly warmup additionally require an explicit change to the no-live-send constraint. Report untested target platforms or clients explicitly.

Single-VPS operation is not high availability. Resend's private-beta Inboxes is not a launch dependency, and Resend does not permit unsolicited cold outreach. The application owns durable history and permissions while Resend remains an external processor.
