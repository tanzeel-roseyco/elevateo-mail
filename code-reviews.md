# Code reviews

## Initialization
Scope: planning documents and repository configuration only. Application source lines: 0. Application review has not started; no application was built.
Defects identified: 0. Defect density: N/A (0 application source lines; not an application quality assessment).

Future reviews must record reviewed files/line ranges, standards conformance, findings, defect count, defects per 1,000 reviewed lines, fixes, and verification. Review assignments must be at most 200 lines and include a dedicated design reviewer.

## 2026-10-11 company-mailbox design update

Scope: documentation only. Application source lines: **0**. No executable application, provider adapter, SQL migration, UI or installer was built. The standards gate remains unapproved. These reviews are design feedback, not a production security assessment or application review certification.

### Independent review coverage

Ranges below identify the design snapshot reviewed before the fixes; small edits subsequently changed a few line positions. Each assignment was at most 200 primary lines. The dedicated design-tradeoff reviewer was separate from the chapter authors. The full originating user rubric is unavailable in this checkout, so no conformance claim is made.

| Assignment | Primary ranges | Lines |
| --- | --- | ---: |
| Adversarial architecture/reliability | architecture.md 1–90; contracts-and-reliability.md 1–101 | 191 |
| Adversarial schema/tutorial A | backend-database-tutorial.md 1–180 | 180 |
| Adversarial schema/tutorial B | backend-database-tutorial.md 181–257 | 77 |
| Dedicated design-tradeoff review | architecture.md 1–90; implementation-plan.md 1–55; documentation.md 1–54 | 199 |
| Desktop/connector review | desktop-and-connectors.md 1–145 | 145 |
| Delivery/hosting review | mail-delivery-and-hosting.md 1–140 | 140 |

Total primary review visits: 932 lines; unique primary coverage: 842 lines. Eight findings arose within that coverage; one additional stale-state finding arose from contextual reading. Approximate design-document finding density is 8 / 842 × 1,000 = **9.5 per 1,000 reviewed lines**. This is not application defect density. Application defect density remains **N/A**, because application source lines are zero. The remaining root/reuse/ADR documents and machine-readable audit evidence received author consistency checks, not a claim of complete adversarial coverage.

### Findings and resolution

| ID | Priority | Finding | Resolution |
| --- | --- | --- | --- |
| D01 | P1 | Lost send response had no explicit event-to-job correlation contract | Immutable `elevateo_send_id` provider tag; verified signed account/job mapping; preserve unknown when evidence missing |
| D02 | P2 | Different request IDs could bypass logical draft-send deduplication | DB uniqueness on organization/mailbox/draft/approved version; explicit new intent for intentional resend |
| D03 | P2 | One restricted provider event could not model routing into multiple mailboxes | Provider-scoped receipt plus separate `event_mailbox_routes` and authorized projections |
| D04 | P2 | Tutorial broadly permitted privileged roles, conflicting with restricted API design | Restricted API role and transaction-local verified claims; narrow worker role and scoped privileged exceptions |
| D05 | P2 | Approval walkthrough omitted atomic audit insertion | Draft approval, send job and audit now commit in one transaction |
| D06 | P2 | Session revocation promise lacked invalidation of unexpired JWTs | Authoritative server session check on every API call, fail closed, and replay regression requirement |
| D07 | P1 | Restore runbook could restart already-accepted jobs with a fresh retry clock | Outbound barrier for drills and real recovery; reconcile backup-loss interval; no clock reset |
| D08 | P2 | Unknown-address catch-all traffic could bypass mailbox quotas | Aggregate quarantine byte/job limits, retention, bounded concurrency and alerts |
| D09 | P2 | state.md still described initial outreach planning | Synchronized current scope, selected/proposed stack, completed docs and unimplemented work |

All nine were independently rechecked at the documentation level. Fix-verification assignments covered 88, 75 and 50 primary lines respectively, each within the 200-line limit. No runtime behavior has been demonstrated by these fixes.

### Verification performed

- User's Codex CLI 0.159.3 authored the backend/database tutorial through `codex exec`; exit status 0. The tutorial was reviewed and harmonized with current provider facts. No raw CLI configuration/logs or credentials are committed.
- `git diff --check`: passed.
- Gitleaks directory scan with redaction: no findings in the documentation checkout (not proof of an exhaustive security audit).
- Documentation validator: Markdown fences balanced; local Markdown links resolve; research JSON parses; six pinned revisions match the earlier local clones; six score totals recompute correctly. These are static documentation checks, not application tests.
- Official primary sources checked for Resend sending/receiving, idempotency/tags, private-beta Inboxes, policy and pricing; Supabase self-hosting/RLS/session semantics; Tauri packaging; Codex/Claude/MCP integration; Railway pricing; and the CAP paper. Citations are located beside claims in the chapters.
- No Docker application tests or actual UI checks apply to this documentation-only update. The current Docker daemon was not running when checked; there is no implemented application to test. Future application publication still requires the repository's Docker and UI gates.
- No deployment, DNS migration, purchase, email sending, credentials setup or installer release occurred.

### Design tradeoffs retained

The reviewers found the modular API/worker, PostgreSQL queue and shared frontend proportionate to a ten-person pilot. Native login/secure storage requires early platform validation. Attachment scanning, unknown-address mail and retention can dominate capacity. Single-VPS operation remains one failure domain; recovery objectives need owner acceptance and measured restore evidence before primary-mailbox use.

## 2026-10-11 upstream source intake

Scope: the user explicitly requested uploading all six previously audited repositories, or selecting their best components, with detailed documentation. This change takes the full pinned-source option: 2,764 included files, 81,939,734 bytes, six independent dossiers, 54 scored component assessments and 13 proposed adoption candidates. It does not implement or deploy the combined Elevateo application. Archived upstream source is not counted as reviewed Elevateo application code.

### Tooling review and fixes

The user's Codex CLI 0.159.3 reviewed the initial importer (lines 1–101) and verifier (lines 1–108) as separate assignments and created isolated regression tests. It completed successfully. Two actionable defects were reproduced in disposable fixtures and fixed:

| ID | Finding | Fix and regression |
| --- | --- | --- |
| I01 | A pre-existing symlink in an intake destination could redirect writes outside the intended collection | Reject symlinked destination paths and ancestors before writing snapshots, registry or manifests; test rejects a redirected destination without writing into its target |
| I02 | A coherent manifest/registry rewrite could reintroduce the deliberately omitted sample private key and still pass internal integrity checks | Independently enforce the required omission policy and canonical paths; regression rebuilds internally consistent hashes/counts and confirms rejection |

Initial tooling finding density: 2 / 209 × 1,000 = **9.57 per 1,000 reviewed lines**. This describes these two small tools at the initial review, not the six applications or the final product. The omission rule and symlink checks are explicit scope protections, not a claim of a race-proof filesystem or authenticated upstream identity.

Three separate follow-up reviewers inspected the final importer (1–113), verifier (1–115) and tests (1–193), respectively. Each assignment stayed within 200 lines; unique final tooling coverage was 421 lines. They reported no material remaining findings within this scope. The parent reviewed the reference/adoption boundary against the existing architecture and license decisions. The earlier dedicated architecture tradeoff review remains above; no application was built during intake.

### Verification evidence

- `python3 -B scripts/test_snapshot_tools.py -v`: **12 tests passed**. These cover pin fidelity despite dirty/newer local state, license/mode preservation, omission accounting, refusal to overwrite, byte/file-set/manifest/mode tampering, symlinks, coherent inventory deletion detected against original Git trees and both review regressions. Tests use temporary local repositories and do not execute upstream applications.
- `python3 -B scripts/verify_upstream.py --upstream-root ../repos`: **passed** for all six pinned trees, 2,764 included files, one declared omission and 81,939,734 included bytes. The single omitted file is BillionMail's published sample `ssl-self-signed/key.pem`; its metadata remains recorded without its contents.
- First-party documentation validation: **25 Markdown files**, **325 local links**, **111 pinned source links/line anchors** and **17 secret-triage file hashes** checked; no errors. This does not validate every upstream document or external website.
- Gitleaks source scan returned **17 findings**, not a clean scan: 11 published test/CI fixtures, four nonsecret pattern matches and two published insecure installer fallback password hashes. Sanitized, path-specific triage is committed in `third_party/security-scan.json`; no secret values or raw scan output are added to Elevateo documentation. Original fixture/default source remains visible in the snapshots and must never be treated as production configuration.
- Source manifests record every original tracked path, exact Git blob, SHA-256, size, mode and inclusion decision. Root and embedded licenses/notices are retained. Upstream dependencies, local audit outputs, installed packages, nested Git metadata and untracked files are excluded.
- Git index verification: all **2,764 staged upstream blob IDs and modes** exactly match the manifests, with no extra file or omitted key present. First-party staged whitespace checks passed; unchanged upstream whitespace is preserved with the original source.
- Upstream application tests were **not rerun** during intake. Each dossier distinguishes historical audit execution, source observations and proposed acceptance tests. No six-repository line-by-line review, complete dependency vulnerability audit, runtime integration, signed installer or production readiness claim is made.
- Docker application/UI checks do not apply to this inert source intake and stdlib tooling. Future Elevateo application changes retain their documented verification gates. No deployment, DNS change, provider request, email send or credentials setup occurred.

## 2026-10-11 end-state vision

Added `docs/end-goal.md` and linked it from the README and acceptance map; synchronized state.md. The document describes the intended daily experience, team workflow, AI authority, selected/proposed architecture, operational qualities and observable release evidence. It does not change implementation or approval status.

An independent reviewer checked lines 1–76 against the current requirements and reliability contracts and reported no material findings. Two optional clarity improvements were adopted: explicit default blocking of remote content and explicit exclusion of unsolicited cold outreach from this release. The Mac deliverable now names the requested `.dmg` format. Reviewed application lines: 0; application defect density: N/A. No application behavior was tested.

First-party documentation validation passed for 26 Markdown files, 333 local links, 111 pinned-source links/line anchors and the 17 existing scan-triage hashes. Whitespace checks passed. No runtime code or upstream snapshot changed, so application/source-tool test suites were not rerun for this prose-only change.

## 2026-10-12 local-completion handoff

Scope: documentation and future-agent instructions only. Added LOCAL_BUILD_PROMPT.md and docs/local-completion-plan.md; synchronized root instructions, status, requirements and affected design documents. Recorded the user's bounded local-completion direction, existing-frontend reuse and credentials-last ordering without claiming blanket production approval or executing implementation. No runtime code, dependencies, provider credentials or upstream snapshots were changed.

### Independent review

- Local frontend inventory: verified concrete lightreach, Quickly, Instantly and Wu-Wei-Mail source paths without executing upstream code. No first-party Elevateo frontend existed at inspection. Asset-rights cautions distinguish source reuse from permission to reuse upstream branding/fonts.
- Prompt/scope review: LOCAL_BUILD_PROMPT.md 1–60, AGENTS.md 1–17 and .planning/STANDARDS.md 1–49; 126 primary lines. No material findings. The subsequent two-line asset-rights addition received parent consistency review.
- Independent design review: docs/local-completion-plan.md 1–136. One material documentation issue and one proof clarification; both addressed below. Material finding density in this plan was 1 / 136 × 1,000 = **7.35 per 1,000 reviewed document lines**, not application defect density.

| ID | Finding | Resolution |
| --- | --- | --- |
| L01 | Client-held Storage signed URLs could outlive membership/session revocation | Authenticated download API/proxy rechecks current authority for every new request; Storage signed URLs remain server-side; test old application links after revocation; align architecture/tutorial |
| L02 | Restore proof could accidentally roll back the simulated provider's external acceptance history | Keep the provider ledger outside the app restore target; restore a pre-acceptance backup while retaining later provider acceptance, then prove reconciliation without fresh submission |

These are instructions and future acceptance tests, not demonstrated application fixes. Application lines reviewed: 0; application defect density: N/A. Existing Docker/browser/native checks remain required when the next agent actually implements the product.

The independent design reviewer rechecked 49 primary lines across the plan, prompt, architecture and tutorial and confirmed both resolutions with no remaining actionable findings in that bounded review. No runtime verification was performed.

### Validation

- First-party documentation validation: 28 Markdown files, 360 local links, 111 pinned-source links/line anchors and 17 unchanged secret-triage hashes passed.
- Whitespace checks passed. The proposed local development commands are explicitly marked as interfaces the implementing agent must create and verify; no nonexistent script is reported as working.
- No app, provider, native packaging or source-tool test suite was rerun for this documentation-only change. The scope of completion here is the saved handoff, not local or production software acceptance.

## 2026-10-12 expanded agent, language and client planning

Scope: requested planning expansion and public research only. No first-party application, dependencies, live mailbox/Instantly connection, new source snapshot or production deployment was created. The original six source trees remain unchanged. New research is a discovery scan, not 25 new security audits.

### Actual execution and consultation evidence

- The user's Codex CLI 0.159.3 completed the first research assignment with exit 0. Output records 25 repository candidates and eight Reddit discussions: six public-thread opens, two search-excerpt-only. New revision pins, runtime tests and deep adoption audits remain pending.
- A native `gpt-6-astra` subagent at `max` effort authored the polyglot system/backend proposal. The language/platform decisions are provisional until the requested opinion synthesis is completed.
- Three independent installed Claude CLI 2.1.241 invocations targeted `claude-fable-5`, `claude-opus-5-5` and `claude-fable-5-1`, with safe mode, tools disabled and session persistence disabled. All exited 1 before inference: OAuth session expired and could not refresh. No opinion or model usage was returned. Sanitized status is in `.planning/capability-status.json`; raw runtime/auth logs are not committed.
- Devin's official MCP route is documented but was not configured or invoked. No Devin plugin/tool/server was observed in this session. `resend` and `devin` were not on PATH; installations elsewhere are unknown. No provider or agent credentials were added.

### Supplementary independent review

This available-agent review improves the documentation; it does not substitute for the three required Claude opinions. Reviewed scopes, each at most 200 lines: AGENT_ORCHESTRATION 1–76; POLYGLOT_ARCHITECTURE 1–122; CLIENTS_AND_CLI_CONNECTORS 1–115; research report 1–190; research JSON 1–190, 191–380, 381–570, 571–760 and 761–941; planning README 1–20; mail activation 1–47; backlog 1–35; capability JSON 1–78 (final recheck 58–78); research prompt 1–11; mailbox CSV 1–10; LOCAL_BUILD_PROMPT 1–66. Paths without a prefix in this list refer to `.planning` and its named subfolders.

| ID | Finding | Resolution |
| --- | --- | --- |
| P01 | Initial research still recommended Node domain defaults and treated requested mobile clients as undecided scope | Label the initial base and align recommendations with provisional Rails, Mac/Tauri, C# Windows and requested later Java/SwiftUI milestones |
| P02 | Deferring all model authentication to activation could block mandatory pre-design consultations | Separate user-controlled implementation-agent authentication from final application/provider/signing credentials |
| P03 | Accepted architecture required measured hosting before the application needed to produce those measurements | Accept provisional topology plus a measurement plan; OPS-01 confirms/revises sizing and supplies evidence before activation |
| P04 | Account/warmup booleans could imply inspected external account state | Rename them to actions performed by this task and explicitly record external account state as unknown/not inspected |

The reviewer confirmed all four resolved. Three material planning findings across 682 reviewed Markdown lines give **4.40 per 1,000 reviewed document lines**; P04 is an evidence-clarity correction. JSON/CSV were additionally reviewed but excluded from that denominator. This metric is not application quality or vulnerability density. Application lines reviewed: 0; application defect density: N/A.

Separate architecture/client specialists reconciled the existing architecture, implementation, adoption, desktop, end-state and local-completion documents. The coordinator aligned root instructions, requirements R12–R17, status and historical dossier destination notices, preserving reliability invariants and the 13 adoption IDs. Existing upstream findings were not recast as new audits.

### Validation and limits

- Static documentation validation: 38 first-party Markdown files, 433 local links, 111 pinned-source links/line anchors and 17 existing triage-file hashes passed before this ledger entry; the final check is repeated at publication.
- Research JSON parses, has 25 unique candidates and eight thread records, and distinguishes six public opens/two snippets with all new pins pending. Capability JSON parses. The inventory CSV has nine unique placeholder slots with warmup disabled; it contains no actual account secrets.
- `python3 scripts/verify_upstream.py`: passed for six repositories, 2,764 files, one omission and 81,939,734 bytes. This run checks the committed inventory/manifests, not original external Git trees. Previous original-tree verification remains historical evidence above.
- Whitespace checks passed. No application/Docker/browser/native tests were run because this change contains plans and research, not an implemented application. Source-tool unit tests were not rerun because the tools did not change.
- Planned commands, integration configuration, platform packages, backend capabilities and live-send acceptance tests are not reported as working. Instantly warmup remains prohibited under the current no-live-send instruction. Actual addresses/MX ownership, production setup and platform/provider activation remain pending.

## 2026-10-12 Claude consultation launch handoff

The user asked to leave the Claude consultations for the next AI agent to spawn. Added six files under `.planning/consultations`: shared brief, three independent exact-model focus prompts, launch/evidence procedure and Astra MAX synthesis template. Linked the package from the agent prompt, planning index/orchestration and README; recorded pending-next-agent status without overwriting historical failed attempts. No consultation, login or inference was retried.

An independent editorial reviewer covered README 1–41, shared brief 1–40, each focus prompt 1–9 and synthesis template 1–18 (126 document lines, each scope below 200). One P3 clarity defect was fixed: the reusable brief now date-scopes its initial no-application statement and requires current implementation/decision/evidence facts for each later packet. No material findings; application lines reviewed: 0 and application defect density: N/A. This review is not one of the pending named Claude opinions.

Validation: 44 first-party Markdown files, 446 local links, 111 existing pinned-source links/line anchors and 17 triage-file hashes passed. The illustrative launch block passes `sh -n` and `zsh -n` without executing it. Capability JSON parses and all three exact model IDs match their prompt files. Whitespace checks pass. No runtime code or upstream snapshot changed, so application/source-tool test suites were not rerun.

## 2026-10-12 ? execution planning and independent consultations

Initial PLAN and BE-01 design opinions were independently executed on the three exact requested Claude models, then synthesized by actual Astra MAX. Evidence, dissent, accepted decisions and analytical tradeoffs are retained under `.planning/consultations/results/`. Root reconciled active architecture and status documents. Obsidian connection remains unavailable; no connection-based simulation is claimed.

Application code changed/reviewed: 0 lines. Application defects and defect density: N/A; no application review or passing build is claimed. Documentation consistency corrections reconcile historical pending architecture/authentication statements with current evidence; they are not counted as runtime defects. JSON parsing and whitespace validation performed; full adversarial application review remains required after implementation.

## 2026-10-12 BE-01 incomplete draft review

Revision: `5a9d83ad4de7403f349131bf0c3e45df7fd97c28`, draft PR #5. Full user rubric supplied to adversarial reviewers; formatting delegated to tooling. Static findings only; no runtime acceptance.

Coverage, each assignment at most 200 lines:
- Foundation: config.rb 65, tenancy.rb 40, health_controller.rb 36, application_controller.rb 8, bin/worker 14, config/application.rb 28: 191 lines.
- Dedicated Astra MAX design: migration 85, tenancy.rb 40, bootstrap.sql 31, database.yml 14: 170 lines, including 40 overlapping tenancy lines.
- Compose: compose.yaml 1-190: 190 lines.
- Secret lifecycle/image: generate-secrets.rb 49, Dockerfile 13, compose.yaml 191-208: 80 lines.

Additional wrapper/network-test assignment: scripts/dev, scripts/dev.ps1, ops/compose.secrets.yaml, ops/supabase/db/99-jwt.sql, ops/supabase/db/99-roles.sql and ops/tests/egress-check.sh: 74 lines.

Unique coverage: **712 lines**. Unique findings: **10** (nine code defects and one worker-health standards/acceptance gap); code-defect density **12.64 per 1,000 reviewed lines**, combined finding density **14.04 per 1,000 reviewed lines**. This is partial coverage, not whole-application quality evidence.

| ID | Severity | Finding | Required regression / resolution |
| --- | --- | --- | --- |
| B01-R01 | P1 | Tenant claims survive wrapper exit within an ambient transaction | Reject unrelated ambient transactions; prove subsequent unwrapped reads cannot inherit authority |
| B01-R02 | P1 | Rails query cache can bypass RLS across tenant contexts | Uncached authorization boundary with deliberate cache clearing; cache-enabled A-to-B and A-to-unwrapped tests |
| B01-R03 | P2 | Same-principal nesting accepts a different unconfigured connection | Track connection identity and reject mismatches; real two-connection test |
| B01-R04 | P2 | Bootstrap grants runtime membership outside versioned migration ownership | Move application membership into narrowly privileged migration lane; rerun bootstrap cannot restore revoked membership |
| B01-R05 | P1 | Shared env_file gives API/worker admin, migrator, JWT and service-role credentials | Explicit per-process environment; assert forbidden key names absent, then restricted-role integration tests |
| B01-R06 | P2 | Credential generator truncates existing secrets before successful rewrite | Atomic same-directory replacement; failed-write/interruption preserves original credentials |
| B01-R07 | P2 | Worker has no Compose or image healthcheck | Meaningful worker health signal and failure-detection test |

| B01-R08 | P1 | Egress probe treats missing containers/executables and Docker errors as successful confinement | Require running services and working internal probes; missing/stopped/tool-failure regressions |
| B01-R09 | P1 | Separate-bridge fixture proves bridge isolation, not external egress confinement | Equivalent unrestricted network must reach the same controlled external route and fail confinement |
| B01-R10 | P2 | Static fixture names and unconditional cleanup can remove another invocation resources | Unique invocation names and cleanup only successfully created IDs; collision/concurrent regression |

All ten remain open. Tenancy findings were deduplicated across foundation and design reviews; secret exposure was confirmed by the generator review. Design simulations were analytical, not executed through Obsidian (connection unavailable). Exact Rails 8.1.4 query-cache source and PostgreSQL transaction semantics supported the design review. Required Docker regressions, complete Auth/Storage foundation tests, full remaining-code review and actual integrated UI checks are pending.
Final BE-01 configuration slice: independent reviewer covered 47 additional lines across `.dockerignore`, `Gemfile`, `Rakefile`, `Steepfile`, `bin/rails`, `config.ru`, `config/boot.rb`, `config/environment.rb`, `config/routes.rb` and `ops/local/.gitignore` at `5a9d83a`. Zero new confirmed defects (0 per 1,000 lines). Static only; dependency resolution, RBS completeness and executable permissions remain unverified.


## FE-01 initial authored checkpoint: adversarial review (2026-10-12)

Status: unaccepted source in `frontend/fable/fe-01`, based on ce95e89. Static review is not runtime or visual evidence. Each assignment uses the user's full review rubric and is <=200 lines. Formatting remains delegated to tooling. The coordinator retracted an unsupported navigation/session-generation finding after checking actual invalidate call sites.

| Slice | Unique lines | Code/test defects | Defects per 1,000 lines |
|---|---:|---:|---:|
| transport + HTTP gateway | 151 | 3 | 19.87 |
| session + scope | 159 | 1 | 6.29 |
| Shell + Sidebar | 197 | 3 | 15.23 |
| Inbox + App | 187 | 2 | 10.70 |
| Thread reader + formatting | 181 | 2 | 11.05 |
| runtime contract + gateway + errors | 169 | 0 | 0.00 |
| fixture gateway + entries + Async + Badge | 162 | 1 | 6.17 |
| conformance + browser tests | 175 | 0 | 0.00 |
| session + contract tests | 180 | 1 | 5.56 |

These completed slices total 1,561 unique lines and 13 localized defects (8.33/1,000 lines); the two cursor append findings share one root-cause pattern in different implementations. Additional slices and a dedicated design review remain pending. Findings are static until reproduced. Exact source hashes and final repair evidence will accompany acceptance.

### Open localized findings

- FE-R01 P2: transport ignores an already-aborted caller signal, allowing a request to start.
- FE-R02 P2: response-body stream failures/timeouts escape fetch-only normalization into GatewayError.
- FE-R03 P3: substring content-type matching accepts deceptive non-JSON MIME types.
- FE-R04 P2: session refresh depends on focus/visibility events; continuously visible use lacks the required <=30-second authorization refresh.
- FE-R05 P1: Shell retains mailbox state across session identity loss/replacement; an initial new-actor render can show old data before its effect clears state.
- FE-R06 P2: mobile modal lacks initial focus, a focus trap, background inertness and focus restoration.
- FE-R07 P2: mailbox pagination does not perform the required one-time expired-cursor reset.
- FE-R08 P2: Inbox cursor recovery retains append mode, merging the reset first page with stale rows.
- FE-R09 P2: empty Inbox pages hide continuation controls even when next_cursor exists.
- FE-R10 P2: Thread message cursor recovery likewise retains append mode and stale rows.
- FE-R11 P3: opening a thread and returning loses the unread filter in the URL.
- FE-R12 P1, compiler reproduction pending: fixture resolver returns a union of operation DTOs rather than preserving operation-specific return types.
- FE-R13 P2 test defect: session context_changed helper uses status 401 instead of canonical 409.

### Coverage gaps (not added to defect totals)

Conformance tests omit body-stream abort/timeouts, pre-aborted requests, deceptive MIME types, incremental/lying-length size cases and operation request options. Browser tests use programmatic focus rather than real keyboard traversal, do not wait for populated overflow targets, and omit cursor recovery, empty continuation, filter round-trip and session invalidation. Session tests call error handlers directly rather than proving delayed promises, actor replacement, DOM clearing and abortion. Boundary tests need exact-limit/limit-plus-one pairs and deeper malformed/null cases. These statements are scoped to the reviewed test files, not claims about every future test.

The fixture adapter ignores request arguments and cannot by itself prove pagination or authorization fidelity. Production graph exclusion and real Rails conformance remain required. Obsidian is unavailable; no connected tradeoff simulation is claimed.


### FE-01 additional slices

- ThreadPage tests (57), scope tests (13), CSS (126): 196 unique lines, one P2 defect, 5.10/1,000 lines. FE-R14: dark themes retain accent text #7a6218 against #25262a (calculated contrast 2.58:1); browser validation remains pending. Tests do not prove browser resource blocking, actual continuation behavior, or both unavailable cases separately.
- Button/icons/Vite/Playwright/Docker config: 186 unique lines, zero confirmed code defects, 0.00/1,000. Playwright does configure 390px and reduced motion. Unit Docker command omits browser checks, requiring separate execution. Dockerfile's claim that conformance.test.ts contains a production fixture-isolation runtime test is inaccurate and must be corrected; no such coverage is claimed.
- Running total: 1,943 unique reviewed lines, 14 localized code/test defects, 7.21/1,000. The inaccurate Dockerfile coverage comment is an additional documentation finding; 15 combined findings gives 7.72/1,000. Dedicated design review and remaining metadata/HTML review are still pending.

### Coordinator dependency tooling correction

PowerShell 5 ConvertFrom-Json rejected the npm lock's empty root key. The attempted coordinator pinning command consequently wrote invalid temporary package metadata. Before testing, the coordinator reconstructed the manifest using Python's JSON parser and researched exact dependency pins, then restarted npm lock generation in Docker. An early check container was stopped because it had copied the unfinished lock. It supplies no acceptance evidence. No application source was changed by this tooling correction.


Final HTML/metadata/documentation slice: 190 lines, two new findings (10.53/1,000): mandatory lint command/config absent (acceptance gap), and README dependency-range instructions stale after coordinator pinning (documentation defect). The repeated false production fixture-isolation test claim is deduplicated with the Dockerfile finding. All non-generated authored app files have now received a bounded review; generated API declarations rely on regeneration evidence, and the dependency lock on resolver/audit evidence. [Source manifest](docs/evidence/fe01-initial-review/source-manifest.json) records the exact checkpoint bytes. Total reviewed non-generated source/documentation: 2,133 unique lines, 14 localized code/test defects (6.56/1,000), two documentation defects, one lint acceptance gap (17 findings total, 7.97/1,000). Dedicated design review remains pending and does not inflate unique line coverage.


### FE-01 runtime and design follow-up

Docker Node 24.21.0/npm 11.19.0 installed 200 packages, audited 201 with zero reported vulnerabilities. `check:api` passed using openapi-typescript7.13.0. Strict typecheck failed: four TS2322 diagnostics in fixtureGateway.ts56-59 confirm FE-R12; TS2307 in vite.config.ts1 reveals missing Node declarations (FE-R15, P1 build defect). No `test` config-property compiler defect occurred. [Compiler transcript](docs/evidence/fe01-initial-review/compiler.log). Unit and bundler diagnostics are separately pending; the failed container was automatically removed.

Dedicated design reviewer inspected session/scope/gateway (181 lines already in the unique total), finding FE-R16 P2: focus refresh can bypass exhausted context recovery. A second context_changed enters explicit-retry error, but focus/visibility after30seconds can bootstrap and reset the guard without explicit retry. The minimal proposed repair makes automatic-refresh eligibility explicit and applies it to both focus and new active polling. Analytic scenarios cover exhausted recovery, explicit retry, unchanged-context refresh overlapping a read, changed-context late data and current401 during bootstrap. No Obsidian connection exists, so these are analytical tradeoffs, not executed connected simulations. Background refresh invalidates generations while retaining ready state; consumer restart for unchanged context requires regression proof, not an unverified additional defect.

Updated unique coverage stays2,133 lines. Confirmed localized code/test defects16 (7.50/1,000), documentation defects2, lint acceptance gap1:19 total findings (8.91/1,000). FE-R12 runtime reproduction adds confidence, not another defect.


### FE-01 Docker diagnostic results

API regeneration passed. Strict compilation failed on FE-R12 and FE-R15. Unit tests: 63 passed, 3 failed out of 66; all failures are retained DOM from previous SessionProvider tests (FE-R17, missing Testing Library cleanup with Vitest globals disabled and no setup hook). These failures prevent validation of the affected session assertions. The separate diagnostic Vite bundle succeeded (148 modules; JS 373.92 kB / gzip 115.76 kB), but does not constitute a passing production build because typechecking failed. Lint, browser/visual checks and real backend integration remain outstanding. See `docs/evidence/fe01-initial-review/unit-bundle.txt`.

All task test containers were automatically removed. The task-owned Node image (332 MB reported image size) was removed; Docker reports zero containers and zero build cache. Pre-existing Playwright/Python images and nine persistent volumes were preserved. Host free space was only 1.42 GB after cleanup; virtual-disk reclaim remains under investigation, so no host-space recovery is claimed.

FE-R17 P2: SessionProvider tests omit DOM cleanup; retained renders make three tests fail before their intended assertions. Final unique review coverage remains 2,133 lines: 17 code/test defects (7.97 per 1,000), two documentation defects and one lint acceptance gap, 20 combined findings (9.38 per 1,000). No failures have been repaired yet.


### FE-01-R1 stage A independent review

Final data source/test coverage: transport149, transport tests133, cancellation tests91, fixture57+49, setup5, conformance167, contract118 =769 unique final lines. One P2 synchronous-cancel cleanup defect was found, reproduced by two failing cases, fixed and re-reviewed (149lines, zero new defects); deduplicated discovery density1.30/1,000 final lines. Temporary compiler/test issues were caught during coordinator runs and corrected; they are not additional independent-review findings. All113 data tests now pass on pinned Node.

Coordinator config review113lines, zero defects (0/1,000); app README/provenance59lines, zero confirmed defects (0/1,000). Combined final scoped review941unique lines, one independently discovered defect (1.06/1,000), now regression-verified. Generated declarations are checked by regeneration and lock by resolver/audit, not line review. Full reviewer rubric applied; formatting delegated to lint. Dedicated accepted Astra MAX design remains under coordinator .planning/consultations/results/fe-01-r1; Obsidian unavailable, no connected simulation claimed.

Coverage gaps remain: exact supplementary-Unicode counting semantics, each adapter's caller-signal propagation, exact timer boundary, production runtime isolation, session/identity/cursor/UI repairs and visual QA. Contract tests use BMP characters for an unambiguous limit. No suite overclaim closes these gates. Config lint fails on the Fable-owned unused session import. Historical FE findings remain in prior ledger; this is a separate repair checkpoint rather than a reset of totals.

Final provenance wording re-review: 28 documentation lines, 0 defects, 0/KLOC; SHA256 2ff233b774f1d74048fc777fad7a5abbb07a9244827f0ef7f891aefc4a83cd9e. Prior 24-line provenance review is superseded; no additional code LOC counted.


## Claude CLI ultrareview checkpoint (2026-10-12)

The user authorized a maximum of two ultrareviews across frontend and backend. Frontend source will be frozen on review/ultra/frontend-reader, with ce95e89 as the explicit base. Review launch/results are pending at this checkpoint. New ultrareview defects: not yet known; reviewed-line count and defect density are unavailable until results. Earlier review counts remain historical evidence. Current UI tests and actual visual validation remain pending.


### FE-01-R1 regression-repair bounded review (2026-10-12)

Parent-run bounded adversarial review of the repair diff: `apps/web/src/app/session.tsx` (reported
181 reviewed lines, SHA `7d7b88d`), 0 defects (0/1,000); `apps/web/e2e/support.ts`, `read.spec.ts`
and `production.spec.ts` (reported 260 reviewed lines), 0 repair defects (0/1,000). Unit-test-only
repair files (`Shell.test.tsx`, `InboxPage.test.tsx`) await their own bounded assignments.

One pre-existing evidence gap (not a repair defect) was found in the contrast spec: on mobile the
`document.querySelector` sidebar-active measurement could read the `display:none` desktop rail
after the drawer closed — token-identical colors, but not evidence of what the viewer sees. Fixed
in `read.spec.ts`: below md the test reopens the drawer and measures the visible active link
(chosen by non-empty client rects; a missing rendered copy now fails the must-measure check), then
closes it via Escape. All four measured surfaces and the 4.5:1 threshold are unchanged; no UI
change was needed. Current working-tree git blob hashes: session.tsx `2b536f04`, support.ts
`a86459d3`, read.spec.ts `237cddad`, production.spec.ts `11047488`. Docker/browser re-validation
of the repaired tree remains pending and parent-owned.


### r7 fleet-02 Docker validation (2026-10-12)

Lint, strict typecheck, 209 unit tests with coverage, production build and all 48 browser checks
passed; exact task-owned Docker cleanup passed. This Docker-verifies the Stage-A micro-gap patches
(Unicode code-point contract semantics including cursors/request ids, per-adapter caller-signal
propagation, strict whole-seconds Retry-After parsing, 10s deadline boundaries) and keeps the
r5/r6 read-checkpoint evidence current. Still open: human visual acceptance of the actual UI,
automatic retry scheduler (absent; scheduling-horizon regression unresolved by design), real Rails
integration and mutation flows. No further ultrareviews are authorized; the ledger reconciles
against existing review output only. See docs/frontend-regression-repair-status.md for the
per-finding reconciliation.

### Bounded review of visual-states.spec.ts (2026-10-12, test-only; not executed)

Scope: `apps/web/e2e/visual-states.spec.ts`, 176 primary LOC at SHA-256
`803477aebce9d4474b85a5b6d744f76210be6781a7c371259aeac6db067fbbab` (bounded caller context read
additionally, not counted). Merged code + dedicated design review: 4 unique defects / 176 LOC =
22.73/KLOC (code 3/176 = 17.05/KLOC; design 2/176 = 11.36/KLOC; one finding overlapped). No
execution evidence exists yet for this spec.

1. (design) Missing matrix ready rows — shell-ready, inbox-ready, active unread filter,
   hostile-plaintext reader — and the reduced-motion representative set used session-loading where
   the matrix requests shell-ready. FIXED: four ready scenarios added (26 total), representative
   set now {shell-ready, inbox-loading, reader-ready-hostile}; matrix updated to match.
2. (design/code overlap) mailboxes-empty asserted only the general 'Simulated local mail' label.
   FIXED: now asserts the loaded empty sidebar directly — 'No mailboxes are visible to you.'
   inside the Mailboxes navigation, zero mailbox links, and absence of the loading status and any
   alert.
3. (code) Glob route `**/v1/mailboxes` does not match the continuation request
   `/v1/mailboxes?cursor=…`, silently un-routing the second page. FIXED: all four routes use URL
   pathname predicates, so query strings cannot defeat matching and `mailboxes` cannot shadow the
   threads path.
4. (code) Mobile readiness race at the sidebar-reveal step: an immediate `trigger.isVisible()`
   after navigation could run before the ProtectedShell rendered and skip the drawer forever.
   FIXED: the test awaits shell readiness, decides by the project's known viewport width (<768),
   and asserts the opened Mailboxes dialog.

Docs aligned in the same change: `docs/visual-qa-matrix.md` no longer claims a manual release step
for held requests (they stay unanswered until teardown). Frozen r7 product source untouched; no
Docker run (fleet-02 remains Codex-exclusive); repaired spec awaits the next parent snapshot.

### Visual spec re-review round 2 (2026-10-12, test-only; not executed)

Scope: repaired `apps/web/e2e/visual-states.spec.ts` at 229 LOC. Findings: code 2/229, design
1/229 (final design review pending). All three repaired:

1. (code) The pagination capture could race ahead of the first page's response: nothing proved
   the `cursor_visual_page_2` continuation request had been issued (and held) before the
   screenshot. FIXED: new `awaitRequest` support — a `page.waitForRequest` predicate registered
   BEFORE navigation and awaited before the capture.
2. (code) The unread-filter scenario served the same mixed list under a highlighted pill. FIXED:
   the threads route is now URL-aware — `filter=unread` receives an unread-only payload; the test
   awaits the `filter=unread` request, asserts the two unread rows visible and the read row
   (`Visual conversation 2`) excluded (count 0), plus `aria-current` on the pill.
3. (design) No populated ready drawer-open-over-content capture existed (only loading/error/empty
   drawer states). FIXED: `drawer-open-populated` scenario — mobile-only (skipped at ≥768px),
   ready inbox content behind an opened Mailboxes dialog containing the mailbox link; the theme
   loop covers the dark×390 cell.

Frozen r7 product source untouched; no Docker; spec awaits the next parent snapshot/validation.

### Visual spec final re-reviews — PASS, spec frozen (2026-10-12)

Both independent re-reviews passed the repaired spec at SHA-256
`2b0fedfbfdfd5a9a5b4ab93ba2916ff4a1ac164419d68b9c896da76e4f606eb5` (267 LOC, git blob
`47e34414`): the code review covered 267 LOC with zero defects; the dedicated design review
covered the same 267 LOC plus the 109-line `docs/visual-qa-matrix.md` with zero code defects.
Coverage accounting without double-counting: unique primary lines reviewed in this final round are
267 (spec) + 109 (matrix) = 376; the spec's 267 lines were covered by BOTH reviewers (overlapping
coverage recorded, counted once), and the earlier round-1/round-2 findings (4 + 3, all repaired
above) remain the cumulative defect history for this file. The spec is FROZEN at this hash; no
execution evidence exists yet — capture/inspection follows the next fleet-02 validation run.

### r8 fleet-02 validation + visual spec scoping defect and repair (2026-10-12)

r8 run (task `fe01r1-20261011-221953-633b2120`, archive `736bf531…e5e2d0`): unit stage PASS
(lint, typecheck, 209 units, coverage, build, marker scan); browser stage 156 passed / 4 failed /
50 skipped (skip pattern exactly as proposed); runner cleanup EXACT (`cleanup_failed=0`, all
task-named containers/images/builder/cache volume removed; remaining elevateo resources on
fleet-02 are pre-existing other-project stacks, none task-owned). 108 of 112 visual PNGs captured.

Defect (1 test-scoping defect / 267 LOC, found by execution): all 4 failures are narrow-390
`mailboxes-error`/`mailboxes-empty` (both themes) at the line-260 text expectation.
`Shell.tsx:184` permanently renders the desktop sidebar (`hidden md:block`) before the drawer's
copy, so a page-global `getByText(...).first()` selects the display:none aside duplicate and
fails `toBeVisible` although the drawer visibly shows the text — corroborated by the parent's
inspection of the copied `test-failed-1.png` (drawer open, "No mailboxes are visible to you."
rendered). Role-based locators were unaffected (display:none drops the aside from the
accessibility tree), which is why only text expectations failed. REPAIRED: sidebar-state text
expectations are scoped to the open Mailboxes dialog below md (`textScope`); `toBeVisible` stays
strict; drawer opening/proof at line ~247 was already correct. New spec: 275 LOC, SHA-256
`f84265524cf4ecfd7c8493a620073ac9576cb26be6f7277ea2a8af6818725de3`. A full visual rerun (r9)
remains REQUIRED — the 4 missing matrix cells have no passing capture; the 108 passing PNGs stand.

### Scoping repair re-reviews — PASS (2026-10-12, static only)

Both independent reviews passed the scoping repair: code review and dedicated design review, each
0 defects over the SAME 97 unique primary LOC (`visual-states.spec.ts:220-275` = 56 LOC at
SHA-256 `f84265524cf4ecfd7c8493a620073ac9576cb26be6f7277ea2a8af6818725de3`, unchanged by review;
`Shell.tsx:160-200` = 41 LOC read-only context at blob
`d54334af6ff92a0d5fb142a3a9e35512ac773b3df13021e76bc3c622978d6b0d`). Density 0/KLOC. Overlapping
coverage recorded as 97 unique lines, not 194. Design review confirms the repair stays strict: a
missing or hidden-only Mailboxes dialog still fails (`toBeVisible` on the dialog-scoped text), and
the <768 breakpoint coupling mirrors the existing Shell/support.ts convention rather than adding a
new one. Obsidian unavailable; analytical comparison only — this is static acceptance. The r9 full
Docker matrix (after the backend releases fleet-02) must eliminate the 4 failures with NO new
skips to close the evidence.

### r9 result, overbroad-scope defect, and r10 reviews — PASS (2026-10-12)

r9 (task `fe01r1-20261011-224141-7335f889`, archive `ffc7497a…962744`): unit PASS; browser
**158 passed / 2 failed / 50 skipped** (56.7 s); cleanup exact (`cleanup_failed=0`, all task
resources confirmed gone); 110 of 112 PNGs. The 4 r8 sidebar failures are ELIMINATED. The 2 new
failures are one defect introduced by the r8 scoping repair: the dialog `textScope` was applied to
EVERY revealSidebar narrow scenario, including `drawer-open-populated`, whose content proof
('Visual conversation 1') renders behind the overlay OUTSIDE the dialog — the dialog-scoped
lookup found nothing. REPAIRED: that scenario's text expectation now names dialog content
('Visual mailbox') and the behind-content row is proven page-scoped in its assert via rendered
text (Radix marks modal background aria-hidden, so role queries cannot see it). Also the r8
leftover volume `fe01r8-probes-stage` was inspected in a disposable container (empty, zero
mounts), removed and confirmed gone.

r10 bounded reviews: code and dedicated design both PASS at SHA-256
`4ed59502f3c27be95e95365fa77befabdfe82ae72af6c90333aa6b5989b5fd67` (281 LOC), 58 unique physical
LOC reviewed (128-147, 244-281; overlapping coverage counted once, not 116), zero confirmed
defects, 0/KLOC. Explicit mixed-scope assertions judged appropriate. Noted limitation:
`toBeVisible` proves layout visibility, not absence of overlay occlusion — actual screenshots
remain required evidence. Spec FROZEN at this hash as the sole r10 snapshot delta. r10 acceptance
(to be observed, not assumed): 209 units, 160 browser passed, 50 expected skips, 112 captures,
exact cleanup.

### r10 staging verification and probe-exit correction (2026-10-12)

Parent independently verified all 58 r10 archive entries against the manifest and the sole
r9→r10 delta (the reviewed spec hash). r10 archive `5a17b32b6346124f88d3e9662e74f1feee7e28c08aa90c1ecd2d20cdb044c4b1`;
runner byte-identical (`dcaa2bc9…`). Probe-exit defect in MY staging invocation (not the frozen
runner): `probes.sh | tail` reported tail's status, not Docker's. Re-ran with full output
preserved (`r10-fe01/probes-r10.log`, 16 lines, 15 PASS) and explicit capture:
docker-probes-exit=0. The earlier r8/r9 probe invocations used the same pipeline shape; their
PASS lines were printed by the probes themselves, but their recorded exits carry the same caveat.

Additional r8 visual sampling by the parent: desktop-light-reader-ready-hostile and
narrow-390-dark-reader-ready-hostile — literal hostile markup visible as inert text, no obvious
layout defects; sample observations only, not full acceptance.

### r10 fleet-02 validation — PASS; attested cleanup (2026-10-12)

r10 (task `fe01r1-20261011-225114-b4aee6cb`, archive `5a17b32b…44c4b1`, sole delta the reviewed
spec `4ed59502…`): runner exit 0, `cleanup_failed=0`. Unit: 209 tests / 14 files passed.
Browser: **160 passed / 0 failed / 50 expected skips** (54.4 s); **112/112 visual PNGs** captured.
The r9 drawer-open-populated failures and the r8 sidebar failures are all eliminated with no new
skips — acceptance bar met by observation. Guard probes: docker-probes-exit=0 with full log
preserved (`probes-r10.log`, 15/15 PASS). Cleanup attestation (read-only, per-command exits
captured; an earlier CR-terminated compound inventory and grep-pipeline forms are NOT claimed):
ssh exit 0; docker ps/images/volume-ls/buildx-ls each exit 0 with full inventories preserved
(`r10-fe01/inv-*.txt`: 303/67/246/3 lines); zero matches for task names, `fe01r10*`, or
`fe01r8-probes-stage`; no elevateo-bx builders, default buildx only. Parent independently read the
same PASS counts and visually inspected both narrow-390 drawer-open-populated themes (no layout
defects; two-state sample only, not full acceptance).

### Light-theme skeleton + badge-overflow repairs — FROZEN for bounded review (2026-10-12)

Visual QA findings (r10 captures; parent-confirmed root cause): (1) light `--surface-2` equals
`--bg` (#f4f4f5), so `bg-surface-2` skeleton bars were INVISIBLE on canvas screens —
session-loading/session-recovering entirely blank, inbox/reader loading content regions blank —
in desktop-light and narrow-light alike (this session's narrow-light inspection corroborates);
animate-pulse only modulates opacity of the invisible color. Dark theme unaffected. The
mailboxes skeleton was visible only because the sidebar sits on `--surface` #ffffff. (2) Both
reader footer badges overflow a 390px viewport (footer lacked flex-wrap).

Repairs (approved FE bug-fix scope; r7 source freeze superseded by this authorization):
- `apps/web/src/styles/index.css` — new `--skeleton` token (light #e4e4e7, distinct from canvas
  #f4f4f5 and panel #ffffff; dark #2f3035 unchanged behavior) mapped as `--color-skeleton`, in
  all three theme blocks; AIDEV note records the defect.
- `apps/web/src/ui/Async.tsx` — Skeleton uses `bg-skeleton`; AIDEV note; reduced-motion global
  rule untouched (animate-pulse still stilled under reduce).
- `apps/web/src/features/thread/ThreadPage.tsx` — footer `flex flex-wrap gap-2`.
- `apps/web/e2e/visual-states.spec.ts` — meaningful regressions, geometry/visibility not class
  equality: `assertSkeletonContrasts` proves the bar's COMPUTED background differs from the first
  painted background behind it, attached to all four skeleton scenarios (canvas AND panel
  surfaces, both themes via the theme loop); reader-truncated-badges asserts both badges'
  bounding boxes fit the viewport width.

Frozen for bounded adversarial + design review (no Docker until reviewed; no new runtime used):
| file | LOC | SHA-256 |
| --- | --- | --- |
| apps/web/src/styles/index.css | 147 | 5d00d5ae76e61e55525a120580d572df2865bab710ade2053cf44b167fa151a3 |
| apps/web/src/ui/Async.tsx | 45 | d6252d68e4b94ad22766e792a9cdf882391ccf22374478a91279110b08e47f5c |
| apps/web/src/features/thread/ThreadPage.tsx | 198 | e529eca8a77e34bc735ec707fe9da7900ff2731a48c03b9b57995c5c8a9715df |
| apps/web/e2e/visual-states.spec.ts | 320 | 160e321ed0df4ab83b89dea7126e31dc3682e8747857dc528e38604eb505301b |

r10 evidence preserved untouched; full visual acceptance is NOT claimed (parent-assigned all-27
narrow-light inspection proceeding independently; this session's own narrow-light observations:
session-loading/recovering blank (the defect), shell/inbox/unread/reader-hostile/mailboxes
loading-paginated-empty-error/inbox-empty all otherwise correct).

### Skeleton-repair bounded reviews + oracle P2 fix — test slice re-frozen (2026-10-12)

Review results: product review 174 LOC zero confirmed defects; dedicated design review the SAME
174 LOC (overlapping, counted once) zero confirmed defects; test review exactly 200 LOC
(visual-states 91-159, 190-320) found ONE P2. Unique reviewed coverage 374 LOC, 1 defect,
2.67/KLOC overall (test slice 5.0/KLOC). Product and design hashes matched the frozen table.

P2 (oracle): `assertSkeletonContrasts` compared raw color strings, so a fully transparent
`rgba(0,0,0,0)` fill would PASS (it differs textually from an opaque parent) while painting
nothing; `toBeVisible` does not prove a painted fill. FIXED narrowly: shared `CONTRAST_PROBE`
rejects alpha-0 fills outright, otherwise alpha-composites the fill over the first opaque
backdrop and requires a non-zero effective channel delta; unparseable colors fail closed. In-spec
oracle regression added: transparent fill fails, a 50%-white-over-white no-op composite fails, a
distinct opaque fill passes.

Recorded LIMITATION (not a defect): under the reduced-motion project the representative set
covers the inbox skeleton in both themes, but the reader skeleton and attachment-badge geometry
checks are skipped there; geometry checks prove viewport containment only (no overlap/ordering
claims).

Re-frozen test slice for re-review before r11: `apps/web/e2e/visual-states.spec.ts` 350 LOC,
SHA-256 `1c8f1f3ddd67b98f9b97b92ad498e7a43586d27156f0ba4bc0dda2eac876771a`. Product files unchanged from the reviewed freeze (index.css `5d00d5ae…`,
Async.tsx `d6252d68…`, ThreadPage.tsx `e529eca8…`). No Docker; r10 evidence preserved.

### Oracle P2 closure — final re-reviews PASS (2026-10-12)

Final 57-LOC adversarial and design re-reviews both PASS with zero confirmed defects at visual
spec SHA-256 `1c8f1f3ddd67b98f9b97b92ad498e7a43586d27156f0ba4bc0dda2eac876771a` (unchanged).
The original P2 is CLOSED STATICALLY within the current opaque-hex theme scope: no perceptual
(ΔE/WCAG) contrast claim and no fresh runtime evidence is implied. Wording correction to the
previous entry (ledger only; implementation and reviewed bytes untouched): the probe selects the
first NON-TRANSPARENT ancestor (computed alpha > 0), not strictly the first opaque one; with the
current themes every such ancestor is opaque hex, which is the scope the closure rests on.

### r11 fleet-02 validation — PASS; repairs visually verified; attested cleanup (2026-10-12)

r11 (task `fe01r1-20261011-232744-84542099`, archive `0eedf661…b0a350`, delta = the four reviewed
repair files): runner exit 0, `cleanup_failed=0`. Preflight verified daemon identity
(Ubuntu-noble…zst, 29.6.2) and task-name absence with per-command exits before any mutation.
Probes 15/15, docker-probes-exit=0, log preserved. Unit 209/14 PASS. Browser **163 passed / 0
failed / 50 expected skips** (55.7 s) — acceptance met by observation, including the new contrast
oracle regression ×3 projects. 112/112 PNGs retrieved locally.

Visual verification of the repairs (inspected captures, light theme): session-loading and
session-recovering now show skeleton bars on the canvas at desktop and narrow; inbox-loading and
reader-loading content skeletons visible; narrow truncated badges wrap within the viewport (both
themes, parent-inspected); dark theme unchanged and correct (spot-checked). The blank
reduced-motion session-loading `test-finished` frame is NOT a defect: `screenshot: 'on'` captures
even tests skipped before navigation, and session-loading is intentionally outside the
reduced-motion representative set — recorded as the existing coverage limitation. This remains
targeted verification of the repaired cells plus samples, not full 112-capture human acceptance.

Cleanup attestation (per-command exits): ssh 0; ps/images/volumes/buildx each 0; inventories
preserved (`r11-fe01/inv-*.txt`); zero matches for `fe01r11`, the task id, `elevateo-bx` or
`elevateo-web`; default buildx only. Fleet-02 released after retrieval.

### r11 full visual QA — all 112 captures individually inspected, 112/112 PASS (2026-10-12)

Authorized manual agent visual verification, local-only (no fleet/Docker use, no frontend code
change). Every r11 PNG under `Elevateo Mail - FE Validation 20261012-r11/results-fe01r11/
e2e-results/visual/` was opened individually at full resolution: desktop-light 26, desktop-dark
26, narrow-390-light 27, narrow-390-dark 27, reduced-motion 6. Zero defects. r10 acceptance was
treated as historical; the r11 set was verified itself. Confirmations: light skeletons #e4e4e7
visible on canvas and white surfaces at both viewports; dark skeletons #2f3035 visible and
unchanged; narrow truncated badges wrap inside 390px in both themes; hostile plaintext inert in
all four captured contexts; unread filter shows only unread rows with the active pill; all
empty/error/unavailable/cursor-continuation copy and actions correct. Acceptance observations
(as-designed, not defects): mailboxes-error replaces sidebar/drawer content with bare raw error
text + Try again (Shell.tsx:170-174); reader header "3 messages in this conversation" with one
rendered message is a synthetic fixture artifact (message_count: 3). Limitations recorded:
static images do not prove interaction; reduced-motion covers only the three representative rows
per theme (no reduced-motion session-loading capture by design); geometry assertions prove
viewport containment only; contrast oracle closed statically within the opaque-hex theme scope.
Docs synchronized: visual-qa-matrix.md (status COMPLETE at agent inspection level),
frontend-regression-repair-status.md (full QA section; superseded "pending full suite" language
replaced). This is agent visual verification of the FE01 read checkpoint, not whole-application
acceptance.
