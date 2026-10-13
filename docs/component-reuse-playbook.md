# Next-agent component reuse playbook

Status: **documentation only, 2026-10-13**. No port, dependency installation, application test or native build is claimed. The user selected Rails backend, Laravel Blade/Livewire frontend, Supabase and Resend. This procedure implements [A01–A13](component-adoption.md) after the required research and named-opinion workflow; pending consultations remain with the next agent. React/TypeScript is not the chosen web frontend.

## 1. Establish the source before touching it

Read [the six dossiers](reference-repositories/README.md), [registry](../third_party/registry.json), [notices](../THIRD_PARTY_NOTICES.md), [architecture](../.planning/POLYGLOT_ARCHITECTURE.md) and [Rails/Laravel decision](decisions/0002-rails-laravel-presentation.md). The current matrix/playbook supersedes historical React/Node destination suggestions in the source dossiers; their source findings remain relevant. The matrix supplies exact source paths; use the pins below, never a moving upstream branch.

| Registry ID / dossier | Exact upstream commit | Manifest / selected IDs |
| --- | --- | --- |
| [quickly](reference-repositories/quickly.md) | `edca964b8bfd56e621b491aba6302b0981545898` | [manifest](../third_party/manifests/quickly.json); A01, A02 |
| [wu-wei-mail](reference-repositories/wu-wei-mail.md) | `6002b8850d685c9ad275eb1cc10a4ce0c8299145` | [manifest](../third_party/manifests/wu-wei-mail.json); A03, A04 |
| [cold-cli](reference-repositories/cold-cli.md) | `041c834156e873a897f19fcf9b5e040896e39d1d` | [manifest](../third_party/manifests/cold-cli.json); A05 |
| [lightreach](reference-repositories/lightreach.md) | `c0723a25dbcc1b19ec4bdbd0f882de31ace2df87` | [manifest](../third_party/manifests/lightreach.json); A06–A09 |
| [instantly-starter-kit](reference-repositories/instantly-starter-kit.md) | `7649e6e4f820ad18cc563d5075f34b1a8daceb36` | [manifest](../third_party/manifests/instantly-starter-kit.json); A10–A12 |
| [billionmail](reference-repositories/billionmail.md) | `fc36c76c050c3775c5e899faf7403cf0262d2744` | [manifest](../third_party/manifests/billionmail.json); A13, concepts only |

Run the existing `python3 scripts/verify_upstream.py` from the repository root before extraction and after the port. Record its exit status. Each selected manifest entry must be included and match path, bytes, mode and SHA-256; record the manifest hash from the registry too. Stop extraction on mismatch and investigate without rewriting the snapshot. The omitted published sample TLS key stays omitted.

Inventory any first-party frontend already present. Preserve useful product behavior and design tokens, but translate incompatible React implementations to the selected frontend. Do not overwrite another agent's work or interpret an archived upstream AGENTS.md/setup script as execution authority. Do not install or run entire snapshots to understand a small component.

Read the exact file, its direct dependencies, associated tests and dossier findings. Identify inputs, outputs, side effects, global state, network calls, authentication assumptions, data access, HTML/URL handling and failure behavior. Record unknowns. An old build result or repository-wide score does not certify the selected component.

## 2. Make a bounded adoption decision

For each A-ID choose **adapt** (copy/translate selected implementation with attribution), **reference** (independently implement a specified behavior) or **replace** (reject its implementation). Translation is still an adaptation when based on source. Preserve applicable root and embedded licenses/copyrights; MIT labels do not remove dependency obligations. A13 has no selected code port: independently define diagnostics requirements, without copying/translating AGPL implementation or adding privileged mail-server management.

Use [a task brief](../.planning/templates/task-brief.md) and the [agent workflow](../.planning/AGENT_ORCHESTRATION.md). Assign one bounded feature, destination and acceptance contract per branch. The required independent opinions must use the corrected Rails/Laravel stack; do not relabel previous failures as approval. Backend work is assigned to Devin through the supported Codex route when available; Fable 5 or Opus 5.5 owns web work; Codex owns its connector. Opus 5.5 owns Anime.js/motion and all C++ work. Record actual execution identities separately from requested owners.

Before implementing, write a small behavior specification and synthetic characterization cases. Derive expected behavior from product requirements, not every upstream quirk. Mark insecure upstream results as rejected behavior. Useful cases include nested quotes, long threads, missing variables, stale draft versions and timeout-after-acceptance. Execute only reviewed isolated fixtures in the new test harness; never need real messages, credentials or live sends.

## 3. Translate into the correct boundary

All locations below are **proposed**, not existing application files. The adoption matrix retains exact source links.

| Work | Destination and translation rule | Allowed dependencies / forbidden inheritance |
| --- | --- | --- |
| A01 quote/content presentation | `apps/web/resources/views/components/mail` + `resources/js/mail`; Blade renders trusted structure, Alpine/plain JS controls quote visibility | Reviewed sanitizer and isolated email frame; Blade escaping alone does not sanitize intentionally rendered email HTML; no upstream global DOM injection |
| A02 + A12 inbox/conversation screens | `apps/web/app/Livewire/Conversations` + `resources/views/livewire/conversations`; rewrite JSX/TSX into Blade props/slots and Livewire actions using Rails DTOs | Laravel/Livewire and local Alpine state; no React, Next server actions, imported Python routes or direct provider access |
| A08 button/sidebar controls | `apps/web/resources/views/components/ui`; translate visual states, slots, keyboard/focus behavior and responsive rules | Adopt needed CSS/icons only after notice review; no automatic Radix/React/package-lock import |
| Web API binding | `apps/web/app/Services/RailsApi/Client.php`; fixed Rails origin, explicit routes, bounded deadlines and real per-user authorization | Laravel HTTP client and validated wire schemas; no generic URL proxy, service-key actor impersonation or mailbox Eloquent models |
| A03/A04 access and grants | `apps/server/app/domain/access` and `connectors`; rebuild Supabase-session/current-membership checks in Ruby | Rails, selected Ruby validation/type tooling; no upstream auth server, global tokens, MCP send scope or Laravel domain writes |
| A05/A10/A11 delivery | `apps/server/test/domain/delivery` and `app/adapters/providers`; port invariants and adapter/error shape, implement Resend-specific behavior | Real local PostgreSQL plus deterministic fake provider; no tick executable, generic POST retry loop or second sending service |
| A06/A07 templates/content | `apps/server/app/domain/templates` and `content`; bounded Ruby hash lookups and quote rules | Explicit escaping by output context; no method reflection, regex sanitizer or hidden rendering authority |
| A09 mailbox MCP | `packages/mcp`; retain TypeScript registration ideas, rewrite handlers to authorized Rails routes | Selected official SDK and runtime schema validation; no direct SQL, arbitrary fetch, shell or mail-send tool |
| A13 diagnostic concepts | `tools/doctor`; independently implement bounded read-only health questions later | Go standard HTTP/tooling where sufficient; no copied AGPL code, Docker socket, host shell or remediation |

Keep one Rails domain migration lane under `apps/server/db`. Laravel may separately persist its browser sessions using a restricted role; it cannot read or migrate mailbox tables. Supabase owns its internal schemas. No client or BFF receives Resend, database-owner or Supabase service-role keys.

Keep short-lived storage access server-side. Every attachment download uses the authenticated Rails proxy with current mailbox grants and scan status; do not issue client-visible Storage URLs. Block remote images by default and render sanitized email HTML in an isolated frame. Email text and AI output never grant browser, native or agent capabilities.

Choose maintained minimal dependencies for the destination framework and pin them in its new lockfile only when implementation begins. Inventory runtime and transitive licenses, advisories and purpose; do not inherit archived versions. TypeScript may remain in contracts, MCP and development tooling; it does not justify restoring a React web application. Anime.js remains a reviewed browser dependency owned by Opus, with reduced-motion and measured performance evidence.

## 4. Preserve the native trust boundary

Reuse the Laravel-served mailbox UX in Mac/Tauri and C#/Windows only through an explicitly unprivileged remote WebView. Blade/Livewire requires a PHP server; it is not a static bundle to load into a privileged renderer. No remote origin receives shell, filesystem, credential, process or CLI IPC access, including via forwarded messages from another window.

Keep Codex and Claude CLI panels in separate trusted bundled local UI, with narrow audited native commands and independent user/session grants. Reuse design tokens and interaction specifications where useful; never let incoming mail or a remote page select executables or expand authority. Native platform tests must prove this separation rather than assume a WebView setting covers every custom command.

Java Android and SwiftUI iOS implement the same interaction specification and versioned Rails API contract using platform UI controls. They do not run PHP locally or inherit desktop CLI availability. Native login, secure storage, lifecycle and offline/reconnect behavior need target-runtime tests. Consult [the client plan](../.planning/CLIENTS_AND_CLI_CONNECTORS.md) for packaging and alternatives.

## 5. Prove the port, review it, then integrate

Run application checks in Docker and native checks on actual target runtimes. Implement meaningful failure tests alongside each behavior, not tests that only repeat the translated code. Record commands, versions, commit, fixture scale, exit status and result counts. A simulated provider result must remain labeled simulated.

| Gate | Required evidence before accepting the corresponding component |
| --- | --- |
| Rails data/access | Real PostgreSQL roles/RLS, cross-company/mailbox denial, removed membership/current-session revocation, stale draft conflict and atomic job/audit writes |
| Laravel/Livewire | PHP unit/feature tests for allowlisted BFF calls and denied actions; tampered public properties/action IDs, CSRF, expired session, downstream timeout and no tokens in rendered state |
| Browser | Playwright Chromium/Firefox/WebKit journeys; two-user assignment/draft conflict; HTML/URL payloads; keyboard, zoom, reduced motion, loading/error/empty states and narrow layouts |
| Delivery | A05-derived competing workers and crash points; same-key retries within provider rules; unknown outcome preserved; expired retry window held for reconciliation; zero real outbound mail |
| Attachments | Unauthorized/revoked/quarantined access denied; size/type bounds; proxy response behavior; no direct Storage URL in DOM, API DTOs or browser network responses |
| Contracts/connectors | Ruby/PHP/TypeScript/native schema conformance; no client-asserted actor authority; MCP scope/revocation, malformed frames, cancellation and denied shell/send operations |
| Platforms | Target-OS install/launch/login/logout, remote-view IPC denial, CLI trusted-panel isolation, network loss, process restart and update rejection; Android/iOS device or emulator plus real-device evidence before release |
| Performance/recovery | Measured representative thread/data scale, BFF/API traces, no per-keystroke network dependency, CPU/RAM/latency budgets; provider outage and backup/restore drills |

Use Puppeteer only for a specific diagnostic not already covered by Playwright. Browser mobile emulation does not prove Android/iOS packaging or lifecycle. Unsupported platforms remain pending, with the required command/runner documented; a passing local browser suite cannot close those gates.

Arrange bounded adversarial reviews of at most 200 lines per assignment plus the design-tradeoff review. Review provenance and dependency changes as well as executable code. Record scope/findings in `code-reviews.md`; use [review-derived issues](../.planning/templates/review-finding.md) and bounded Astra LOW repairs with regressions. Do not merge a critical authorization/delivery defect merely because UI tests pass. Preserve existing branch protection and the user's publication scope.

## 6. Required adaptation record and integration order

Create one proposed `docs/adoptions/Axx-<feature>.md` record per actual port, with these fields: status; A-ID; requirement; requested and actual owner/reviewer; source registry ID/commit/path; per-file SHA-256 and manifest hash; root/embedded license and retained notice location; dossier findings; adapt/reference/replace rationale; behavior specification; rejected behavior; destination paths; dependency decisions; transformation summary; consultations/synthesis; test commands/results and platform gaps; PR/commit; residual risks and acceptance decision.

The record must distinguish borrowed implementation from independently written behavior, and proposed work from verified integration. Update [the matrix](component-adoption.md), notices, current state and review ledger together. Never record a copied component as accepted solely because its source hash is valid.

Integrate in order: (1) A03 + owned database/auth + fake transport; (2) A01/A02/A08/A12 Laravel receive/assign/draft interface; (3) A10/A11 with A05 failure tests for approved simulated dispatch; (4) A04/A09 connector scope; (5) target-platform clients and A06/A07 where required; (6) optional A13 tools. Complete receive → assign → draft → approve → simulated send → reply before campaigns or extra runtimes. Actual provider/signing/deployment credentials stay last, and live sends including Instantly warmup remain prohibited.
