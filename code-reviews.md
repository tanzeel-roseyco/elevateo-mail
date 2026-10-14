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

### BE-01-R1 isolated probe cleanup review
Initial review: 143 Bash lines, one P2 ownership/mount-verification defect (6.99 defects per 1,000 lines). Revised script: 169 Bash lines, zero new defects (0 per 1,000), original defect statically resolved. All removal paths now inspect nonce ownership and exact mounts, preserving resources on failed verification. Runtime startup, mount serialization, readiness and grantor catalog proof remain pending. Final document SHA-256: 5b1e35dfa6a7b8446eabbe1dfae6a6f19125f13ab6e4ca1f659682fad14f83a3. No application acceptance is claimed.

### BE-01-R1 repair review checkpoint, 2026-10-12

The corrected probe subsequently completed remotely with exit 0. Its exact output and attribution are archived in `docs/evidence/be-01-r1-probe-result`; SHA-256 `3263793b298326c2231a22fcd847b13ada0b365ae3ccb2bb44097534f1b69327`. This supersedes the pending probe status above, without accepting the application.

Initial Unit A review covered 813 unique lines in six bounded assignments (94,155,142,111,187,124). Four P2 findings: ownership guard omitted non-relation catalogs; T2 could pass through the ambient-transaction guard alone; worker authority checks omitted inherited USAGE; migration failure injection could pass before executing the grant. The overlapping 159-line Astra MAX design review found two additional P2 defects: mutable UUID strings inside Data and an RBS return type excluding Rails rollback's nil. Six unique defects / 813 unique LOC = 7.38 defects per 1,000 LOC. The source writer repaired all six; runtime closure is outstanding.

Repaired source manifest SHA-256 `1c55d2a8e93686efd296fd19cf352fc1608a3823fa491b0002333fbb408317cb` belongs to the isolated BE01 R1 checkout. Dedicated design re-review: 161 lines, zero new defects, both design findings statically closed. A4 re-review: 178 lines, zero new defects, independent clean-second-connection assertion confirmed. Remaining repaired A slices are undergoing review. Overlapping re-reviews do not increase unique coverage.

B4 Compose lines 1–120: 120 lines, zero defects. B5 Compose lines 121–222, test overlay and fixtures: 183 lines, zero defects. A separate five-line JWT initialization review resolved the conditional missing-secret concern: the script requires only JWT_EXP, which is supplied. These reviews do not prove service startup or authentication.

C1 checker/probe/listener: 138 lines, zero defects. Corrected C2 shell wrapper: 140 lines, zero new defects. Corrected C3 PowerShell wrapper: 127 lines, zero new defects. C4 egress tests: 127 lines, zero confirmed defects. Wrapper failure-protocol and PowerShell inspection findings are statically resolved; execution remains outstanding. C4 coverage still needs correct-token/wrong-exit and exit-42/wrong-token combinations. PowerShell tests explicitly skip without the configured runtime; Linux execution cannot establish Windows PowerShell 5.1 compatibility. No actual network-isolation or cleanup acceptance is claimed.

All assignments used the user's adversarial rubric; formatting remains delegated to tools. Obsidian is unavailable, so design tradeoffs are analytical rather than connected simulations.

### FE-01-R1 data checkpoint

Data source review: 769 unique lines, one newly found cancellation-cleanup defect, repaired and statically re-reviewed (1.30 defects per 1,000 LOC). Configuration review: 113 lines, zero defects. README and final provenance review: 63 lines, zero defects. Combined unique coverage: 945 lines, one defect (1.06 per 1,000). Docker regression evidence and exact source manifest are preserved on `fix/astra-low/fe-01-r1-data` at `79387b1bab0f5958b1a80028c0b35152fc10ecbc`.

Pinned Docker checks passed 123 unit tests, strict types, API regeneration and production build. Lint identified an unused import in the pending Fable session repair. These results cover the data checkpoint, not frontend end-to-end or backend integration. Fable repair session `b878fb94-6e40-482d-9b26-1e39f8e98920` is active from that commit with only Read/Write/Edit/Glob/Grep tools; runtime identity is claude-fable-5. No frontend visual acceptance yet.


### FE-01-R1 stage B interim review, 2026-10-12

Read-only snapshot while Fable authors tests. Four bounded assignments cover 670 unique lines: readPage/Drawer 86, session 1-190 190, session 191-219 plus Shell 1-165 194, Shell 166-205 plus Inbox 1-160 200. Three confirmed defects: P3 misleading Drawer CSS/focus comment; P2 fixed-interval refresh can delay a visible-session refresh nearly 60 seconds after an offset focus refresh; P1 successful stale Inbox request can overwrite the current mailbox because success lacks an ownership guard. Density: 3/670 = 4.48 defects per 1,000 LOC. Repairs and runtime regression tests remain pending; this is not acceptance.

Snapshot SHA256: readPage 167d7e18063fadb2d5e34d40603db5328ce0dfb7aa08ad663bbaa1bbdf6dd87f; Drawer 30126788b864549b15f6c9af846ecf1a607639880d717c9c715b2708d6179afe; session 3f86ba637d4d2626dc3871c88a78190997f0573cd842fb3e3f436e15d02071c8; Shell 4b4157235b18a1e0a066aa5802cea43806c092f22e15b059e42354e1c5524333; Inbox 96b4a4e567ea4992a531c0584fbaf6ec7acca8fd012792273980e8f39f39c56d.

Shell ownership/keying, guarded mailbox traversal, explicit breakpoint drawer closure and focusable main markup passed static inspection. Actual focus restoration, visual QA, remaining source/test review and Docker checks remain open. Review used the full user rubric; no formatting review or host application tests were performed.

### BE-01-R1 full-bundle runner initial review

Main runner 121 LOC, SHA256 fbbf64d9329b9056bea105ddb8c7dfa38abd238ac85ddcc98004aafe49e50aa2: zero confirmed defects (0/1,000 LOC). Helper independently pending. The runner's subset explicitly excludes legacy/rollback closure and final acceptance. No runtime result is claimed.


FE stage B follow-up: Inbox remainder 19 + Thread 171 =190 new LOC. Reader repeats the stale-success ownership defect (same root cause); one additional P2 empty-continuation defect. Source total860 unique LOC, four distinct defects =4.65/KLOC (five affected occurrences =5.81/KLOC). Session tests reviewed in180+142-line assignments:322LOC, zero new code defects, but blocked-state timing and offset-cadence coverage gaps. These gaps are queued for Fable; no runtime closure. Thread SHA ddd966a6539cf3745e53b88a801dd85467411feee6b3e77a9b84e92d6be73de2; session tests SHA f39b4e6a884c460ef45dc82ac2645599c824cacc34552f6e67a4d0c6b082bd16.

Runner helper134LOC initial independent review found zero defects; overlapping dedicated design review found one P2 inspection-error/absence conflation permitting unverified builder removal. Helper density1/134=7.46/KLOC; combined runner unique coverage255LOC,1defect=3.92/KLOC. Repair/re-review pending. Analysis used Docker upstream control flow; no runtime or Obsidian execution claimed.


Runner final helper re-review:184LOC SHA256 c134518c1122e0b4d9e51c79ebaa9a54fdcd9cf595265dfeda5d31ac0ad6637f, independently reviewed and separately design-reviewed with zero new confirmed defects. Inspection-error/absence defect class is statically resolved across containers, networks and images; timed-out suites are removed before later suites, or abort on uncertainty. Final main121+helper184=305 unique LOC; one original defect class=3.28/KLOC, zero outstanding static findings. Runtime Docker representation, build and suite execution, timeout cleanup and host free-space verification remain pending.

FE readPage tests100LOC SHA3a2893be607d99f8c7536104dc0bdeff36cb5fac66f47ae9f85475482602a837 and Inbox tests152LOC SHAceb6574c1087c64cf828ef7a66895c3db928ae0387f313d06d0fc4c2d6e1f108: zero new confirmed code defects; stale success and request-argument regression gaps remain. These are distinct assignments, each below200LOC.
# INT-401 source integration review checkpoint (2026-10-14)

Provenance inspection found one artifact-mode defect affecting four executable paths (bin/rails, bin/worker, egress-check.sh, scripts/dev). Original 100755 modes restored using canonical Git indexes. Artifact defects found/fixed: 1/1; source code coverage remains 0 LOC, so code defect density remains N/A. This is static archive/mode evidence, not runtime validation.

Baseline b0d73327 combines canonical source without asserting new application review coverage. Dedicated Linus ADV-729 provenance and Ada ADV-714 design-tradeoff review requested through root; results pending. New source review coverage: 0 LOC, confirmed new code defects: 0, defect density: N/A (zero reviewed LOC), not a claim of defect-free code. Inherited source requires bounded <=200 LOC adversarial assignments against the full INT-401 rubric. Formatting belongs to remote linters. Application lint/type/unit/integration/visual gates are UNRUN; no publication authorized.


## INT-401 Linus ADV-729 bounded review and repair

Root supplied Linus results: 172 source lines, two confirmed integration defects, 11.63 defects/KLOC. Scope: missing root compose.yaml required by scripts/dev and ops/perf/lib.sh; helper leaf-name filter omitted nested be01-* tooling. Full INT-401 rubric applies; formatting belongs to linters. These are narrow integration findings, not a whole-application review. Both repaired by canonical source restoration and tool-root selection. Independent repair re-review is pending; overlap adds no unique review LOC. Original mode defect remains a separate artifact finding.

Ada ADV-714 design advice: contract/hash identity proves provenance, not lifecycle correctness. Root must reconcile R3 with the actual log and test real login/mailbox/thread/draft/reload, tenant/session invalidation, draft version conflicts/lost ACK, Storage isolation and restore. No additional defect count or reviewed LOC was supplied for Ada; density N/A. Analytical advice is recorded here and mirrored Obsidian records, not claimed as an executed connected simulation. All application tests and visual gates NOT_RUN in Cassian checkout. Static source dependency audit finds one inherited frozen package hash conflict and absent seed/check services; root owns disposition and test strategy.


## RES-406 documentation checkpoint (2026-10-14)

Nadia authored docs/research/instantly-gmail-rea.md with public primary-source index, claim ledger, tradeoffs and proposed acceptance cases. Author consistency check only; no independent adversarial/design review completed. No application source changed: reviewed source LOC 0, code defect count unmeasured, defects/KLOC N/A. Full current INT-401 rubric applies to future implementation; <=200 source lines per assignment and dedicated tradeoff review remain required. All proposed application tests NOT_RUN; actual visual evidence and REA skill pending root.


## RES-406 continuation citation/source advisory (2026-10-14)

Nadia reopened I1–I9, G1–G5, R1–R6 and request-verification primary sources; source-inspected gateway/contracts/routes/mailbox permission/readiness to map unsupported health/consent/send controls. Author/source consistency advisory only; no independent adversarial/design reviewer signoff. Historical missing-skill event resolved with supplied REA v37 instructions; partial root Orca evidence reported, full runtime verification pending. No app source edited, source review coverage counted for adversarial acceptance 0 LOC, defects unmeasured, defects/KLOC N/A. Full INT-401 rubric and dedicated design-tradeoff review required for future implementation. All proposed application scenarios NOT_RUN; root mirror pending.
