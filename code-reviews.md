# Code reviews

## 2026-10-13 BE02 C/D adversarial review and repair checkpoint

Reports below live in the coordinator checkout, `Elevateo Mail - Local Completion/docs/completion`. Each reviewer used separate passes of at most 200 physical lines and no more than 400 unique lines per assignment, with the full supplied rubric. Counts describe the reviewed snapshots; runtime is **NOT_RUN** for these C/D changes. Zero observed defects is not certification.

| Review | Physical LOC | Observed defects | Defects/KLOC |
| --- | ---: | ---: | ---: |
| [Draft schema/ledger](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-draft-schema-ledger.md) | 259 | 0 | 0.00 |
| [Draft services](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-draft-services.md) | 303 | 0 | 0.00 |
| [Draft HTTP boundary](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-draft-http-boundary.md) | 280 | 0 | 0.00 |
| [Draft test boundaries](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-draft-test-boundaries.md) | 332 | 6 | 18.07 |
| [Draft races](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-draft-races.md) | 163 | 3 | 18.40 |
| [Membership service](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-membership-service.md) | 357 | 0 | 0.00 |
| [Membership SQL/races](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-membership-sql-races.md) | 354 | 3 | 8.47 |
| [Search service](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-search-service.md) | 377 | 1 | 2.65 |
| [C/D transaction design](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-cd-transaction-design.md) | 326 | 1 | 3.07 |
| [Collaboration schema](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-collaboration-schema.md) | 312 | 0 | 0.00 |
| [Collaboration services](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-collaboration-services.md) | 300 | 1 | 3.33 |
| [Collaboration HTTP](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-collaboration-http.md) | 353 | 1 | 2.83 |
| [Collaboration database tests](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-collaboration-database.md) | 324 | 4 | 12.35 |
| [Collaboration race tests](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-collaboration-races.md) | 254 | 2 | 7.87 |
| [A/B compatibility](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-collaboration-b-compat.md) | 327 | 0 | 0.00 |
| [Collaboration design](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-collaboration-design.md) | 343 | 1 | 2.92 |
| [Write guard/schema](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-write-guard-schema.md) | 269 | 2 | 7.43 |
| [Write transport](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-write-transport.md) | 323 | 1 | 3.10 |
| [Write input tests](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-write-boundary-tests.md) | 201 | 2 | 9.95 |
| [Write controller/races](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-write-boundary-races.md) | 277 | 2 | 7.22 |
| [Write deadline repair](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/review-be02-write-deadline-repair.md) | 271 | 2 | 7.38 |

The collaboration design finding duplicates the service cursor finding (CS-01); these per-review rows must not be added as unique defects or unique coverage. The later deadline review found interruption masking and connection-pool ownership defects after the initial deadline repair; that work is not closed. The conditional D-down/C-up grant concern was correlated against actual owners: D's revoked read grants target elevateo_session_owner, while C's draft functions/policies use elevateo_owner. No confirmed shared-grant defect was established; the actual migration round-trip remains a runtime requirement.

Separate Astra LOW terminals own draft, membership and collaboration test repairs, cursor error precedence, draft compaction's indexed expiry predicate, exact JSON-number handling, byte-boundary evidence and deterministic write races. Fresh deadline/guard consultation includes the early re-entry check and safe multidimensional-array validation; implementation awaits the accepted synthesis. The exact Auth RLS decision is accepted in [the decision record](../Elevateo%20Mail%20-%20Local%20Completion/docs/completion/be02-auth-rls-decision.md), with its narrowly scoped implementation still under review and runtime acceptance pending. No source finding is marked closed merely because a repair was dispatched.

The transport boundary verifies serialized object shape and bytes; individual projectors must enforce closed response schemas, valid terminal-conflict status/code relationships and error caps before commit. The coordinator supplied the inherited-controller and helper interfaces after the affected review reports were authored. Generic lock-wait observations are being replaced by exact blocker evidence. Obsidian was unavailable for the design analyses; recorded schedules are analytical simulations, not executed races.



## 2026-10-13 Orca completion review checkpoint

The earlier bootstrap status-finalizer review remains closed: 52 reviewed LOC, zero remaining defects, 0 defects/KLOC. PERF R8 timing/design re-review reached 387 cumulative reviewed LOC and closed the rounding finding; analytical checks only, runtime NOT_RUN. New bounded Orca assignments cover the bootstrap inventory/invocation/reconciliation controls and two changed freezer hunks, plus a dedicated 191-LOC lifecycle/design slice. Those assignments are pending; defect counts and densities are not yet known. No new application code is accepted by this checkpoint, and no ultrareview was launched.

Invocation regression accepted (2026-10-12): BE-INVOKE-REGRESSION-20261012-01 CLOSED. Evidence be01-invoke-regression-f1aa549f-df9c-4f48-a84f-2d87e3c9eb61: test_exit=0, process_exit=0, cleanup_failed=0; independent reconciliation phase/source/inventory/retention/builders and exact container ID/name/label absence all zero. Docker tests cover literal arguments/status, invalid paths, original failure discrimination and observer cleanup on success, write failure, failed launch, TERM and INT. Shared resources retained. Static coverage remains 139 unique LOC, zero defects, 0/KLOC. Fresh FE release reconciled r9 with completed r10/r11. Corrected capability packet requested locally; no capability/services/PERF allocation or whole-app acceptance. No ultrareviews.

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

### FE-01-R1 independent test review continuation

Shell tests1�180:180LOC, one P2 defect (5.56/KLOC): the duplicate accessible-link assertion conflicts with Radix modal background hiding. SHA256 c85c2ae56fb44429d13180fa34b5a03081ffe23be19d91c8ce9f3d183bbefa3a. Separate continuation72LOC plus scope tests13 and scope source23:108LOC, zero new defects. Scope hashes bf4a063dbb3dd04453c7079dd7549583e1c3df99fc24258650644475ac8c09e7 and 51a4b28f8fe892ff03249d29bfa0f6b010c203f3998e8027e69ccd86619890ac. Privacy snapshots establish first replacement commit, not every possible delayed sibling update.

Production browser tests145LOC: two P2 defects (13.79/KLOC), SHA256 38bd991cfb1508eb11d27d49cf4c577b02d0c926a48730c0190b09bb991e2817. Nonexact conversation1 locator also matches10�19; hostile-content claim never routes hostile content or opens its reader. Browser read tests162LOC: two P2 defects (12.35/KLOC), SHA256 4589e04a26647846076a2dd97e6af7c15b6e9018911cbbe321cba088c321e10e. Connected focus can still be hidden; active-filter contrast silently skips absent selector. Repairs queued for Fable; no browser execution claimed.

Dedicated design re-review of repaired session1�190:190LOC, zero new defects (0/KLOC), SHA256 7987cebfb6ccade214b8f130982611884c19f9900a032da2265599bbf19183c2. Deadline chaining statically closes offset cadence finding. Runtime timing and overlapping request tests remain required. This overlaps prior source coverage. Obsidian unavailable; analytical scenarios only.

Thread tests captured166LOC had zero defects but changed during review (314d38e6f2a48afbc6a14cb991e9183682c1495ed2b854450b04c543ff8287bc to24d6eba2e400585461b64e29e3a01b68871810ae5370154744796f6bec81fd42). No current-file closure or stable coverage claimed. All assignments were read-only and below200LOC; no host application tests.

FE final source repair design slice session191�232 (42) plus ThreadPage1�150 (150):192LOC, one new P2 resource ownership defect (5.21/KLOC). Thread A->B reuses unkeyed route while passive-effect reset permits first B commit to show A content; D3 covers resource ownership. Parent App/Shell key context supplied separately. Hashes session bec0d84dd03bae8248a9832d3015c1e95ed1c3de7c6953392c36dd4f6c2bdfd3; Thread f9b809eff1673b38e74a32365e27452ecdedbfdd907fca2bc9c67a2af1db0f5d. Repair queued; no cross-identity disclosure claim. Stable Thread tests1�190 SHA756d2cd13d29ead98da1582a2f8132db5d451e0cf9fdb8b6deecea68c90f81d8:190LOC zero defects; remainder13 pending. Overlaps prior test snapshot and does not add190 unique lines.

### Egress fixture repair review � 2026-10-12 (pending validation)

Independent adversarial review inspected egress_test.rb lines 49�104 (56 primary LOC), lines 1�48 and both wrapper lines 16�30 (134 unique LOC total). One confirmed defect: the PowerShell mock function failed to forward pipeline JSON to Ruby. Density: 17.86 defects/KLOC primary, 7.46/KLOC including context. Findings were delivered to the Orca backend repair terminal; repaired code and Docker execution remain pending. Reviewed egress_test.rb SHA256: 94932799b3e08482727a128e05063a67618476961b94e231289085a8c5cc6fc0.

Dedicated design review covered 71 overlapping LOC (Ruby 49�104, shell 16�30), reporting zero independently confirmed defects and one conditional stdin finding (14.08 conditional findings/KLOC), confirmed by the other review through the PowerShell caller. Coverage is not additive. Logical token/exit simulation preserved the requirement for exit 42 plus the exact rejection token. Obsidian was unavailable; no Obsidian simulation or executable test is claimed. PowerShell Docker validation remains required; a skipped lane is not a pass.


### PowerShell fixture repair re-review
Reviewer egress_fixture_review inspected 58 changed-context LOC plus 11 wrapper LOC; 0 defects, 0/KLOC. Prior stdin forwarding defect resolved by inspection. PowerShell runtime validation remains pending. Linux noexec fixture Docker run passes (9 tests, 39 assertions, one PowerShell skip).


### Fleet-02 runner preparation review
be01_compose_review: runner SHA 3a2f75fe33311d756f302ed60385f2f195ed1cead423bf26bca3af0007c41114, 154 LOC, 0 defects (0/KLOC). egress_fixture_design: frozen helper SHA c134518c1122e0b4d9e51c79ebaa9a54fdcd9cf595265dfeda5d31ac0ad6637f, 184 LOC, 1 cleanup timeout defect (5.43/KLOC). Config inspection spawned during cleanup could outlive timeout because ordinary rm cannot remove running container; routed to backend terminal for verified exact-container force removal preserving failed status. Parent additionally requested explicit VPS CPU/memory caps. New helper requires re-review; no execution acceptance. Design scenarios were static; Obsidian unavailable.

### 2026-10-12 repaired runner and frontend bounded reviews

- be01_compose_review: runner ba3576ed5e0ef9586c0b3d4b3844607e38ae90745bffbb5a59feaf1336d34591, 157 LOC, zero defects (0/KLOC).
- egress_fixture_design: repaired resources helper 86681089c789e3b636f518508e8c6cf496d332f69bd69e5696bbc1dd4302aa4d, 196 LOC, zero new defects (0/KLOC); prior cleanup timeout defect fixed.
- egress_fixture_review: synthetic regression harness 39466f5a67c7b4fe7e20efa1eeb839d68c7d008d1de7631b2c83cdc90c5796da, 128 primary LOC, 196 including context, zero defects (0/KLOC). Docker execution passed ownership/mount/cap rejection, timeout cleanup and wrong-overlay/helper rejection. Synthetic success does not establish real database or network correctness.
- be01_compose_review: frontend session.tsx SHA256 7d7b88d00a9e8873593342b59e1fa84b94f6b818d3e1b809b8f30fcc1ff1dee5, lines 55–180 and 185–239, 181 unique LOC, zero defects (0/KLOC). Runtime recovery/refetch behavior remains pending.
- egress_fixture_design: frontend browser support/read/production slices, 260 unique LOC, zero repair defects (0/KLOC). One pre-existing evidence gap: mobile contrast could measure the hidden desktop sidebar. Fable authored a visible-link correction; re-review/runtime are pending. Hashes: support 802e11b8eb803fae1b4bb6d3f12ed42bac56c9e6d967a7dfe9bba4f5f32ddb3f; read 41c5e5cc2b3a1dec4184ad6635506f945186d8252032bc43a5dc8d0e02c34e4b; production ac941add3700cc304e03995b6f9ed6bf622bc1b42f93f6647f09737cada2330f.

Counts above are per assignment and must not be summed as non-overlapping coverage. Design review used static scenarios; no Obsidian execution occurred. The subsequent real PostgreSQL run found a membership-catalog.sql syntax defect outside these slices; it remains open until the authored repair passes Docker verification. No further ultrareviews are authorized.
## R2 verification and frontend runner hold (2026-10-12)

Backend runner 587200aba0ae06caf1c4cc088965ad926b1bbc9fb7690c594aeb62e651696456 plus catalog e1a347ce15e6779b93b9b8e4f1dd2baa3d3eac520d3ad294b919193aa1cdc77a: 205 reviewed LOC, 0 defects, 0/KLOC. Harness 6d8e93b1189f80ca7b8798a716baa561ba961f3916bdd0a51d4ed124494afafa: 131 lines plus 43 runner context, 0 defects, 0/KLOC. Fleet-02 Docker syntax and all updated synthetic regressions passed. Negative rejection checks retain a residual causal-evidence limitation; actual catalog rejection probes passed in full R2.

Full R2 failed tenancy pool5/pool1 and worker-role test; driver/authority/membership and catalog lifecycle passed. This is not full acceptance. Exact task resources absent after cleanup, evidence retained. Codex terminal received both failures.

Dedicated frontend runner design review cb61122e1b90862c61d4a80a5490e0122e8282582092dea736b3737bab24dc04: 148 reported LOC, 5 defects, 33.78/KLOC. Unverified builder/cache deletion; substring CPU verification; missing phase/cleanup deadlines; timeout can pass on graceful zero exit; inspection errors conflated with absence. Fable terminal received repair task; execution held. No Obsidian simulation or runtime validation claimed for this runner.

## Frontend runner follow-up and backend R2 repairs
Follow-up checkpoint (2026-10-12): Codex authored ownership-loss disconnect/ContextError repair and worker catalog-OID assertions without new grants; bounded static review of 148 LOC reports zero confirmed defects, runtime rerun pending. Frontend runner follow-up review at SHA 0f9a7e667b1bb6bc15740112daad3fe948bed2bb9440ae69e05ef2f54c0b53ab found four cleanup/existence defects in 145 LOC (27.59/KLOC) and one browser-status false-pass defect in 94 LOC including Dockerfile (10.64/KLOC). Immediate repair feedback sent to the Fable terminal; no further ultrareviews. Performance team remains active and unaccepted.
Static reviews only; no new runtime validation or Obsidian simulation claimed. Frontend execution withheld pending repairs.

### Fleet-02 R3 / frontend runner follow-up (2026-10-12)
Backend frozen overlay/test review:144 LOC,0 defects,0/KLOC; tenancy_test ebb80f9d45d6735d509e19d1953a654286126c7aa9ec1d09ad82b50f96744e4e and runner e2d409e0284cf486ea8894637f6376459994f4c5ae97a332b5a5c293aaf80066. Harness review143LOC,0 defects,0/KLOC at a8ff7b5c2a616bd9542d577f239fca00f4eea23fcf96a9510e536039b523883d. Synthetic Docker regressions PASS. R3b runtime subset PASS and cleanup0; broader acceptance remains pending.
Frontend execution/probe/Dockerfile review182LOC found2 P2 defects (10.99/KLOC): relative scratch cleanup and grep-error false pass. Immediate Claude terminal repair, re-review probes98LOC + Dockerfile41LOC=139LOC,0 new defects,0/KLOC; runtime pending. Repaired hashes3c5e113bfc08fe907f03b166c259c1caf04df00617d51c54b5f84d47c421d1b4 and73861610a354eb5a9198f3ecb89f9978935ba0d5312ad74879bafeec5b80193b. Runner design re-review still active; no acceptance. Overlapping review coverage not summed.

Frontend design followup at runner8acf5f27612196f1b02d2a44765981b4458c4694bdce8f7b4cdbc9b85d05ea33 lines1-139:2 P2 defects,14.39/KLOC. Large-inventory SIGPIPE false absence and output parent-symlink containment bypass dispatched immediately to Claude terminal. Prior four cleanup findings structurally addressed, acceptance remains open.

### Frontend r5 contrast-oracle review and r4 runtime evidence

Read-only adversarial review by fe01_r1_data_writer: apps/web/e2e/read.spec.ts lines125-238, 114 LOC, SHA256 e8c4c1b8448427eac8ebdc8669043a60b7b1676b4aad9e47b485e4481aa19585. Zero defects, 0 defects/KLOC. RGB bytes and normalized sRGB now use the correct transfer function; the 4.5 threshold remains unchanged. Unsupported/nonopaque formats and missing surfaces fail. Regressions cover white, cream, format equivalence and unsupported formats. Static acceptance only; actual browser evidence remains pending.

The preceding r4 Docker run passed 171 unit tests and the static/build checks; browser42/45 failed three light contrast cases. Exit1 with cleanup_failed0. Frozen validation runner dcaa2bc92d76c26a896f9737ba7c099a65da2c077b2ec018e488b60effbcc597: design review lines1-139,139LOC,zero defects; runner140-200 plus121-line probes,182LOC,zero defects. Fifteen runtime preflight probes passed and forced empty-seq negative failed as expected with temporary-directory cleanup. R5 uses this unchanged runner and a newly hashed frontend snapshot; runtime/visual acceptance pending.
## 2026-10-12: frontend r5 runtime and Lane C bounded review

Frontend snapshot `5bcd3c7121482c782a052bfc68a92f0c918586e1c899cab4144c9cdc19ec05fc`, task `fe01r1-20261011-202110-de551068`, passed 171 unit tests and 44/45 browser tests. One runtime defect remains: the light reduced-motion contrast oracle rejects actual computed `oklab(0.967428 0.000417888 -0.00125271)`. The prior 114-LOC oracle static review reported zero defects; this runtime result exposes missing serialization coverage (one observed defect / 114 reviewed LOC = 8.77 defects/KLOC, not a whole-application density). Fable received the exact failure. Cleanup verified exact disposable containers, images, builder and cache absent; `cleanup_failed=0`, overall exit=1. Logs retained outside Git in `Elevateo Mail - FE Validation 20261012-r5`.

Lane C independent static review by be01_compose_review covered 162 LOC: compose override81 and compose helper81. Initial P2 report under reassessment: helper line77 starts a one-shot container with bare Docker, but the driver exports DOCKER_CONTEXT. That caller invariant may invalidate the reported wrong-daemon defect; do not count it as confirmed pending reassessment. Backend Orca owner received both the finding and correction. Reviewed helper SHA256 `7edd451661919db0ae7f53e49b703599fe37929cdf918d752ca064c8ca32964b`; override `ee26c30bcb80900dbe989083180a967527cbae934f7887c5f0e245867ec2087f`.

Independent lifecycle review by egress_fixture_review covered resources115 + inspection32 =147 LOC, zero confirmed defects, 0/KLOC. Hashes `ea0c250a855eb8050f8d9ec38830bc60fd7cc09267f6bb6f3ccb92f70a1ac182` and `5850d6250ebf360106af5ce18276c3d3d5b03b51f79d982ca39f134ec17a4fef`. Runtime fingerprint stability, inherited pipefail and daemon timeout/final inventory remain verification obligations. Dedicated design review covered driver84 + adapter72 + baked-source verifier24 =180 LOC with zero independently confirmed defects (0/KLOC). It requires runtime timeout-cleanup evidence and flags single-attempt positive readiness as a possible false-failure risk. Synthetic regression review remains pending. No additional ultrareview or acceptance claim.

### Lane C context finding reassessment
The original reviewer withdrew the P2 Docker-context finding: the driver rejects conflicting endpoint variables and exports DOCKER_CONTEXT before helper calls. Corrected original scope: 0 confirmed defects / 162 LOC, 0 defects/KLOC. Explicit context arguments remain defensive hardening. Reassessment covered 20 driver and 8 helper lines plus caller documentation; no runtime execution. Updated package still requires frozen-hash review and fleet-02 validation.

### Frontend r6 snapshot prepared
Post-r5 Fable repair frozen for bounded review. Snapshot SHA256 7c9407a7e7b80d163d8348f5f9b0f083a9721c331c0ab3f661cb3621be025118, 54 files. Nonrecursive explicit-sRGB pixel conversion and rejecting animation deadline are awaiting r6 Docker evidence. No new ultrareviews authorized or started.

Frontend r6 bounded review: read.spec.ts lines 142-330, 189 LOC, SHA256 c97ad650788d727d83d6392cf428d4024f78e339848e37e94c3fade6ff27f89c. Reviewer confirmed 0 defects, 0/KLOC. Static only; full-page accessibility and runtime validation remain separate. Snapshot transfer verified on fleet-02; runner and Dockerfile hashes match previously reviewed versions. r6 launched with scoped cleanup; outcome pending.

### Lane C follow-up bounded reviews
Readiness adapter (88 LOC) and readiness regression (51 LOC): 1 medium defect / 139 LOC = 7.19 defects/KLOC. Adapter SHA256 4e4291bf1ad5c73c5c20fb0c64ea7ecfd427f735397e3318bad4a836ddc1aaea accepts multi-document jq input based on the last result; require exactly one object and mixed-document regression. Regression SHA256 25b6c9fb601858cf30f919b43a1c382ac5da8f6560ac1662225c664e65202eff.
Profile/context synthetic regressions (57+65 LOC): 1 P3 / 122 LOC = 8.20 defects/KLOC. Standalone inverted cmp does not trigger errexit; use explicit failure branch. Hashes 39645a9af9f5f32b5b9b9f2d6a2bb2e0992d9767d3928e1eeaeb801a062029e3 and d499c6016a2eb56921454a4f33fa788ffa75b5f3b6bd3558d8ca5e262d5a921e. Both findings dispatched to existing backend Orca terminal; request c600cea3-6b55-4689-b819-e569269d1e5f confirmed turn_started. Repairs and runtime proof pending; no ultrareview.

## 2026-10-12 Lane C closure and frontend boundary follow-up

- Readiness adapter/regression: 152 LOC, 0 remaining defects (0/KLOC); hashes 54df513b4eb38d8569bf5c7ffc356455468f1c5f3c81b6f2d601ae168f78e1db and 38603fc91c2e1690ca56c49929183c76775ae93d650076a3947aad763fe1323c. Prior multi-document defect statically closed.
- Profile/context regressions: 127 LOC, 0 remaining defects (0/KLOC); hashes 3633385939b32b7685b0fc09d01e3e8fdf6bd428b7173ba668ae7f681b8b4056 and de1968ba3426f4edb1e8e765ec2d102b2575df8af121d29fb733c11b31007890. Prior inverted-cmp defect statically closed. Actual Docker lifecycle remains unverified.
- Frontend Unicode scope: 161 LOC, 1 residual mismatch (6.21/KLOC): opaque cursors/request IDs still used UTF-16 max despite canonical Unicode allowances. Assigned to Fable.
- Frontend transport scope: 148 LOC, 1 defect (6.76/KLOC): parseInt accepted malformed/fractional Retry-After values. Header parsing tests do not prove retry scheduling horizon. Assigned to Fable with missing coverage explicitly retained.
- Lane C staging: Windows archive newline conversion initially mismatched source hashes; re-archived with core.autocrlf=false and obtained explicit CRLF-attributed PowerShell file directly from canonical Git blob. All 52 source and 10 package entries now match on fleet-02. Two synthetic container attempts exited at missing jq before assertions. Exact names elevateo-lanec-synthetic-20261012-a and -b are absent; no images/cache/volumes created by these attempts. Existing shared runner images retained. Dedicated tools image remains pending.
### Frontend signal propagation bounded review
Independent reviewer be01_compose_review covered signal-propagation.test.ts (77 LOC) and fixtures/fixtureGateway.ts (76 LOC): 153 LOC, zero defects, 0 defects/KLOC. SHA256 respectively 786739e1a37ebf70d6c084de98f01618238b164ccfa0868a1008deb741512f0d and 13883218b724b6dd5ff1754fed01b20469deafb7a2f97aecbfafec89a0db1704. All four fixture methods cover pre-aborted/live signals; HTTP methods cover pre-aborted no-fetch and in-flight cancellation. Static review only: fixture resolution is synchronous, so abort after settlement still requires caller post-await checks. Listener cleanup, DTO isolation and body-read cancellation are outside this assignment. New patches still require fleet-02 Docker validation.
Lane C explicit-context/resource follow-up: egress_fixture_review reviewed resources117 + compose81 = 198 LOC, zero confirmed defects (0/KLOC), SHA256 c4ce5cf3ada3c2bebe92d3557c82d7de92bdef27738603a182e32f5272e8a363 and 415112e4cb67efae9e8dd794ae32674fe03f36ab895e70e3daa8855df235ae1c. Exact IDs/fingerprints and empty-network checks preserved. Runtime daemon behavior, timeout cleanup and fingerprint stability remain pending. Caller pipefail is required; inspector outside this follow-up scope.
### Frontend r7 boundary closure and tools-runner findings
Transport repair re-review: 163 LOC, 0 confirmed defects (0/KLOC), transport SHA256 97b1d68a752a535deadaacc7a5fdddbae30fb7dca78c26c3a7f98a51063a0ee0, boundary tests 86d24bbddf4e5d9843b9b944da9371208e63f7a50d6360f08dc190f1ad00f493. Whole-header parsing closes malformed/fractional acceptance; independent 10000ms deadline assertion added. No retry-scheduler runtime claim.
Unicode repair re-review: 148 LOC, 0 confirmed defects (0/KLOC); contract 177ea21b6a4d7730afeeb0df0c56a3ee9f83eb610e9c7fdc84da2a49feb67a7a, test 94c10bf2e77457d1559316fb96876f518bba10f9c342c916cc2dd1240d462eec. Cursor/request ID code-point limits preserve nonempty minima. Both reviews static only.
Dedicated tools design review: 155 LOC, 3 defects (19.35/KLOC), parent-run 7ed3675deeb398dc731396c7d2567fc9ec43d8d6b07cbf980fb142a3476eae2f. Early builder failure retains empty task cache; partial image load can escape cleanup; several daemon operations lack deadlines. Assigned to backend Orca worker, acknowledged and repairing. Execution withheld until repaired review. Obsidian unavailable; tradeoffs analyzed without claiming connected simulation.
Frontend r7 snapshot prepared from repaired working tree: archive 68d1a9cbfc31b9b226c9a1d27d7cc564ea84a99ef890832a280d7b86418e9b9a, 57 manifest files; unchanged reviewed runner/Dockerfile. Fleet-02 has 36 GiB available memory and 253 GiB root free at preflight. Runtime pending.
Frontend r7 runtime closure: Latest verification (2026-10-12): frontend r7 snapshot 68d1a9cbfc31b9b226c9a1d27d7cc564ea84a99ef890832a280d7b86418e9b9a (57 manifest files) passed API generation, lint, typecheck, 209 unit tests across 14 files, coverage, production build and 48 browser tests on fleet-02. Task fe01r1-20261011-204933-f5d8cb42 exited 0 with cleanup_failed=0; exact disposable containers, images, builder and cache were removed. This includes Unicode, Retry-After and cancellation repairs. Backend tools runner has three follow-up defects under repair in the existing Orca Codex terminal; runtime acceptance remains pending. No more ultrareviews. Full integration, performance acceptance and project completion remain open. Static follow-up coverage remains 163 LOC transport and 148 LOC Unicode, zero remaining defects (0/KLOC); runtime counts are not review coverage.

Backend tools runtime checkpoint (2026-10-12): bounded re-review covered 173 lifecycle/design LOC and 161 execution/regression LOC, zero confirmed static defects (0/KLOC each). First fleet-02 run be01tools-2103c1f8-467e-4dc9-8f11-b86ba5b37cfa failed before assertions: SCP directory permissions denied non-root script access; Buildx v0.35.0 rejects inspect --format, so cleanup retained registry/cache. Codex terminal received repair request. Parent verified exact registry endpoint/driver, nonce-labelled local cache, no attached containers and recorded cache contents (260740 KiB), then removed only that registry/cache. Task-labelled containers, volumes and images inventories are empty; root disk reports 256G available (no precise reclaimed-byte claim). Shared images retained. Synthetic and actual Lane C validation remain pending; no further ultrareviews.

Visual r7 inspection: eight runtime screenshots inspected; zero visible defects in sampled states. Code LOC and defect density not applicable to screenshot inspection. Full visual/integration acceptance remains pending.
`nPERF draft review: run-baseline.sh lines 1-180, SHA256 d5e1f5123f97b2b90ba2e38237aca1d036a83ce7bce5be87ef3370284e68d310; 180 LOC, four defects, 22.22/KLOC. Findings: preflight rejection can stop preexisting project; unbounded/empty matrix; cleanup failure masked; EXPLAIN failure swallowed. Sent to Fable 5.1 CLI lead for repair. No benchmark authorized or run; other harness modules remain unreviewed.

Backend synthetic-tools compatibility repair review (2026-10-12): frozen manifest d7500a3343450e153c153310faa0526a50da7d99c20b8df12da71eb5862ef6d5. Adversarial reviewers covered cleanup/preflight/preflight regression 200 LOC, 0 confirmed defects (0/KLOC), and cleanup regression/Dockerfile 101 LOC, 0 confirmed defects (0/KLOC). Parent reviewed runner/container/checks 127 LOC, 0 confirmed defects (0/KLOC): bounded orchestration, pre-mutation inventory, non-root readability before builder allocation, inspected socket-free container profile and deliberate error propagation. Total nonoverlapping primary scope 428 LOC; static review does not prove runtime. Coverage limitations include cleanup-regression nonempty and timeout mocks sharing status124 and ordering assertions being structural. Completed SCP verified all eight files and manifest remotely; a premature hash check while transfer was ongoing failed and was repeated only after transfer exit0. Dedicated staged tools directories set traversable and files readable, no unrelated permissions changed. Fleet-02 repaired Docker execution launched, session77806; result pending. No ultrareviews.

Backend tools verification (2026-10-12): frozen tools manifest d7500a3343450e153c153310faa0526a50da7d99c20b8df12da71eb5862ef6d5 passed fleet-02 Docker execution. Task be01tools-a5fba660-a2cd-4793-8c3f-3038b2e9e124, evidence /home/tanzeel/elevateo-mail-tests-20261012-ultra/be01tools-a5fba660-a2cd-4793-8c3f-3038b2e9e124.aMktCN. Readability preflight, shell/Ruby syntax, cleanup/deadline regression, supported Buildx/readability regression, synthetic profile (13 invalid profiles), context and readiness regressions passed. test_exit=0 cleanup_failed=0; parent independently verified no nonce-labelled containers, volumes or images and no task builder registration. Disposable tools image sha256:f14d770662b215b06cc46926724e5f4b7b0d5e00f534942c1c6783f026c0a66b removed; shared base images retained. Expected negative-case parse/permission errors appear in passing regression logs. Actual Compose egress and PowerShell runtime remain unverified; no full backend or application completion claim. No ultrareviews.

Performance harness follow-up (2026-10-12): parent reviewed sample.sh (SHA256 5218199f6e5288fe42f02c2d43452bd99b5857076285b9593b6e5dad9aa63b80) and lib.sh (bed77b0060bbc925d94982d8a15ca231761616d95d10d0ade93ccc3fedf2fe1c). Four defects: stats pipeline masks Docker exit; worker proc pipeline masks failure/partial data; resource inventory pipeline can report empty after failed Docker commands; sampler Docker calls lack deadlines. Sent to actual Fable CLI session 61161 for repair and failure regressions. No benchmark executed; no new ultrareviews. Exact line coverage/density below.
Coverage: 156 lines; 4 defects; density 25.64 defects/KLOC.


Lane C app runner design review (2026-10-12): egress_fixture_design reviewed 170 LOC across parent-run.sh (40eae17a191f78c0912cc5f69fa27810e3058dfb9a8b606beff4b84dfb3ffadd), source.sh (339cc168f1ce84fbb581ed4bcf26d37a0d80d5aa30b5bb559dd9575771e1ccd8), regression.sh (dde4730db073af7e1a61a8a3bf1bffbc55976406a0ef898ec4422b5ad2ab79d0). Zero confirmed defects, 0/KLOC. Archive membership/count/exclusion lacks direct regression coverage; actual build, Compose and independent cleanup verification remain required. Obsidian unavailable, tradeoffs assessed analytically. Bounded independent code review still pending. No ultrareviews.


### 2026-10-12 Lane C app orchestration verification
Independent and design reviews each covered the 170 frozen shell LOC, with zero confirmed script defects (0/KLOC), manifest 7152b86727b06d58f9e4666a126472fb6eb34dc34f7ffecd68f5b20c804d5cc9. Runtime identified two defects in the 52-line handoff (38.46 defects/KLOC): full hostname supplied to hostname -s guard; noexec tmpfs invalidated executable-mode assertions. Actual backend Codex terminal corrected both docs. Docker syntax/regression passed with SSH exit 0 using immutable Ruby image 22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2; evidence fleet-02:/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01app-final-check.log. Independent inventory returned no synthetic containers. Earlier transport attempts reached PASS but had CRLF exit-status errors and are not the authoritative run. Staged rails/worker/worker-health modes restored from 664 to 755; byte manifests unchanged. Real lifecycle task be01app-aebdc940-96d9-461f-ad54-c0faaa0d6311 currently building; no Compose success claim. No further ultrareviews.

### Lane C actual lifecycle outcome, 2026-10-12
Task be01app-aebdc940-96d9-461f-ad54-c0faaa0d6311 built app sha256:7b4c78a17d14583226d95a20b499ff262f786717ad61b8dc08fe0589eb36346a successfully. Child be01r1-466ce081-b90e-4570-96fc-7a61076877c3 passed baked source/runtime file-set check (tool exit 0), then failed post-execution resource verification; test_exit=1 cleanup_failed=1, Compose never started. Codex terminal accepted repair task and turn_started confirmed. Suspected mutable full Config/HostConfig fingerprint; cause not yet proven. Parent independently inspected exact stopped tool identity, labels, image and sole read-only source bind; removed container bc96a77c016929dbbdb1a7b4c7683ee1e9cfc4aab98d4ce3434e57d9d4c36817 and exact app image. Builder/cache already cleaned by runner. Independent inventories: both task container label sets empty, child networks and parent volumes empty, only default builder remains. Host free 255G; Docker images96.63GB/cache10.79GB are shared inventory, not task deletion scope; no reclaimed-byte claim. Shared prerequisite images retained. Actual integration remains failing, not complete. No ultrareviews.

### Narrow Docker lifecycle repair review, 2026-10-12
Parent diagnostic isolated HostConfig.OomKillDisable false -> null as the only selected configuration difference. Independent reviewer covered inspect.jq1-34 plus regression.sh1-102 (136 LOC), then separately resources.sh1-37 (37 LOC); dedicated design reviewer covered the same 173 LOC. Each found zero confirmed defects, 0/KLOC; overlapping coverage is not additive. An accidentally inspected historical helper was excluded from repair coverage. Hashes: inspect 0e863475a3fa1d4dfc0edd557f947b5945ab750b1b12607b1adb53fcaa18acb2; regression c1b2491574bf8d5bb5dc4a12818c65e4746fe3a3e4726afc2ed41843ca93e25e; resources c4ce5cf3ada3c2bebe92d3557c82d7de92bdef27738603a182e32f5272e8a363. False/null normalization preserves full remaining Config/HostConfig; true and malformed values reject. Synthetic tests exercise both equivalence directions, successful exact-ID removal, and security drift rejection without mutation calls. Reverse direction tests verification but not a second removal. Design comparison was analytical; Obsidian unavailable. This is static review, not Docker runtime acceptance. Owner is updating the manifest chain; source manifest remains canonical. No ultrareviews.
### Compose create compatibility repair (2026-10-12)

One confirmed runtime CLI defect: `docker compose create --no-deps` is unsupported. The frozen repair uses one supported create call after validating all nine service registrations. Adversarial code review covered 192 unique LOC (compose helper 89, new create regression 77, checks entrypoint 26): zero remaining confirmed defects, 0 defects/KLOC. Dedicated design review covered 166 overlapping LOC: zero confirmed defects, 0/KLOC. Do not sum overlapping coverage. Both reviewers used the user rubric; style belongs to linters. Compose helper SHA256 a8d1e2d61de4871f5a4da672e593c6474df3587d37478f27a8cb9bd87197cfbc; create regression 759ecf0544262e40beac0ceb5714c5fd39265bd6bf46f23b976e7442d52f20b2; checks e92a416815a8a8e499bac7686484a5be8b83d24884c34f71c605715b6c81cc10.

Design tradeoff: a single dependency-inclusive batch avoids reconciling already pinned containers, but a partial or timed-out create can leave unpinned resources. Existing cleanup must retain uncertain resources for independent exact recovery. Mocks cover registration, command arguments and failure ordering, not actual daemon completion or recovery. The shared 25-second create deadline needs fleet-02 runtime evidence. Obsidian was unavailable; assessment was analytical, not an Obsidian simulation. Runtime validation is delegated to the existing Orca Codex terminal; no further ultrareviews.
### BE01 identity staging and inventory supplement, 2026-10-12

Correctness and dedicated design reviews completed for frozen identity-stage (69 LOC) and identity-parent (94 LOC): 163 unique LOC, zero confirmed defects, 0/KLOC. Supplemental direct staging regression (83 LOC) and exact-prefix inventory (41 LOC): 124 unique LOC, zero confirmed defects, 0/KLOC. Design reviews overlap these same slices and are nonadditive. Full user rubric used; formatting delegated. Analytical tradeoff simulations only because Obsidian was unavailable.

Hashes: stager 082f2dee68ec408f34ff52766239e493eb3f01960e71026d0e55a0aae24f95b9; parent 32df717a039ace9ff27b203b13e07acfeacd788d37e1d2f9ec3865768f1d982b; regression 02be3533fbc8f2c732a0784d43840051072ed6fa809ea73a356461aab05d3afa; inventory defef60ccc7b4f3dee161e7182bff9d8fdaa180e56de59549087148f6c39c267. Before/after review hashes matched.

Tests cover the real pinned archive under umask077, existing destination preservation and corrupted-archive rejection. These are static review findings, not executed test results. Mode assertions do not prove alternate-UID traversal; missing immutable identities require separate evidence reconciliation, and mid-write failures are not injected. Fleet reservation covers only bounded jq/Python validation with independent cleanup between phases; full foundation acceptance remains pending.
### Coordinator checkpoint: services R2 failure and PERF R2 review, 2026-10-12

Services R2 failed before Auth/Storage acceptance. Audit: /home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-services-r2-audit-a5397bfa-8b33-4a18-a0d6-7c3ddc6d7895; child be01services-6f1401a6-071b-475a-8c27-1a3de66edc4b.qXP5nL reported test_exit=1 and cleanup_failed=1. Parent status file was absent when independently checked; do not infer parent success. Coordinator independently inspected four retained Created probes over SSH exit0: Docker CapAdd uses CAP_CHOWN/CAP_FOWNER or CAP_DAC_READ_SEARCH, while the frozen profile compares bare capability names. Existing BE worker consumed scoped local repair request fe1dc1d8-d679-4698-b9d3-7b835265ad5c. Exact reconciliation remains pending; no uncertain volume deletion, retry or fleet release claimed.

PERF R2 frozen runner 4ab711d65821d93d883e4a3e451b1cc2df0c96b58e0c8df87b0383fa87b5e555 completed bounded static review: 884 unique executable LOC, two medium defects (2.26/KLOC). Signal handling can seal while the background wait still writes evidence; fake Docker stop wrongly deletes container state and can mask removal failure. Fable received repairs plus stale documentation corrections and stronger regression assertions. Dedicated design review included analytical timing simulations; Obsidian unavailable. No Docker execution, benchmark acceptance, fleet lease, ultrareviews or new paid sessions. FE remains released. Full application completion remains unproven.
### Capability normalization snapshot review, 2026-10-12

Adversarial code review covered profile.jq (47), profile-regression.sh (52), and volume-check/checks.sh (20): 119 LOC, zero defects. Dedicated design review covered profile.jq, profile-regression.sh, and services-app/dispatch.sh (38): 137 LOC, zero defects, with 99 overlapping lines. Combined unique agent coverage: 157 LOC, zero defects, density 0/KLOC. All snapshot hashes matched before and after review against docs/evidence/be-01-services-capability-files.json in BE01 R1. Strict single-prefix normalization preserves exact capability sets and rejects malformed, duplicate, unsupported, and extra capabilities. Null/empty equivalence lacks an explicit regression assertion but was analytically checked; no concrete defect found. Obsidian unavailable; design simulations were analytical. Root additionally inspected the 82-line app regression coupling; runtime remains unproven. Recovery plan and retained resources are not approved for removal by this review. No remote mutation, tests, ultrareviews, or paid sessions occurred.
### Capability execution and PERF R3 reviews, 2026-10-12

Frozen capability execution scripts completed static review: recovery56 + staging92 + launcher51 = 199 unique script LOC, zero defects (0/KLOC). Correctness additionally inspected unchanged parent88; 287 total unique supporting/script LOC. Dedicated design overlaps, not additive. Final hashes: recovery9f829601d00091efc94cc31a8af2c0949ed5257ac0a5632f8d0b8d8a95b4932f, stagingf0ec97799654f24c8b657575406da6f40901ecb9e64f61242f36c3778ccd9dd1, launcher0a38d5252cd5c9e363d70658c7dba0182f65bc097531d1857b857a25f57431c7. External exclusive reservation and independent cleanup remain prerequisites; static review is not runtime acceptance. Obsidian unavailable; design simulations analytical.

PERF R3 review found two medium defects: wrapper-only fallback termination does not establish child evidence-writer absence; late-write regression delay exceeds timeout kill grace and lacks handler-ready synchronization, allowing a broken implementation to pass. Reviewed runner hash28850d2cd50e5712ec7a8197bfa3dd2a6c712a7bd47247eaf8886ad00a644adc and regressionbc35fdd255188e997d517d6a47b5e560a2877d1e94a909e9dcfc737c84961ff2 remained stable during reviews. Review assignments: core116 LOC/1 defect (8.62/KLOC), regression first110 LOC/0, design200 LOC/1 (5/KLOC), overlapping and not summed. Fable consumed both findings and is routing R4 repairs; no performance acceptance.

Backend consumed request79c66da2-e2ad-40df-bcb6-7225160927b5 for separate retained-volume/image recovery preparation, with read-only inspection only. Four probes, four volumes and exact app image remain retained; no remote mutation or test launch this checkpoint. No further ultrareviews, paid sessions or live activation. Full application objective remains incomplete.
### Retained-resource recovery draft review, 2026-10-12

Frozen snapshots in C:/Users/Tanzeel/AppData/Local/Temp/elevateo-capability-recovery-review-20261012-r1: content helper e0c8e2d50f224436e92fb5b6c9ceae6388ea5e1dc3a6f8490c02a047fd17d20c (50 LOC); image recovery a8138a3d906234b9d76d9248306b92c3e901e8413401b8ac0220549e6a667e45 (74 LOC). Correctness and dedicated design each reviewed the same124 unique LOC. Two unique medium findings,16.13 defects/KLOC: repeated serial inspection of about303 shared containers twice competes with120-second total deadline; image rm omits --no-prune and can delete untagged parents before its preservation check. Correctness found the latter as one additional defect (8.06/KLOC excluding known timeout issue); do not add overlapping review coverage. Both findings delivered to existing backend worker; repairs and caller integration remain pending. No concrete content-helper defect found within its documented caller contract. No execution. Obsidian unavailable; design failure timelines simulated analytically.

Fable acknowledged and recorded strengthened R4 mutation-control requirement: isolated copy of actual runner with reap/group-absence protection deterministically disabled must fail the late-writer regression while production runner passes. Standalone scratch checksum demonstration is insufficient. No PERF execution or lease allocated.

### Coordinator checkpoint: retained-resource recovery static review closed, 2026-10-12

Correctness and dedicated design reviews completed for volume driver/content (156 unique LOC) and repaired image procedure/regression (111 unique LOC): 267 unique LOC, zero remaining concrete defects, 0 defects/KLOC. Design coverage overlaps and is not counted twice. The initial 124-LOC draft had two unique medium defects (16.13/KLOC): serial consumer-inspection deadline risk and implicit untagged-parent deletion. Both are statically resolved by bounded batch inspection and exact non-force image removal with --no-prune. Regression extracts the actual removal function and discriminates the unsafe original; Docker execution remains NOT_RUN.

Coordinator verified all four frozen member hashes against manifest a727ce2126c4294b8481a9c85c146ac11fb8cf71e79d8100119531439bae1a42. Final driver cb9a1281dfa9a2ed34a6407b1b7012dbe1838ca39f12d3d0337d97338fb18be9 differs from reviewed driver only by the image-helper pin, now 8ac8a690a9dd1e31a71b226bdf10d0cc9eca04381c94c51c0c1b771deb7b8348. Regression aaccab391834af57f3f8e26dd2c3397caca27f92f6bde74e0b76aa4264b92f91 and content e0c8e2d50f224436e92fb5b6c9ceae6388ea5e1dc3a6f8490c02a047fd17d20c are frozen. Obsidian unavailable; design simulations were analytical.

Existing backend worker visibly consumed request 05c95209-d56a-4693-8923-8ae44bfbc202 and is preparing the concrete socket-free Docker validation dispatcher locally. No remote mutation or new fleet allocation granted. Four volumes and app image remain retained pending runtime checks and independently reconciled recovery. Fable performance PTY 61161 was polled and remains live. Full Auth/Storage acceptance and complete application implementation remain pending. No ultrareviews or new paid sessions.

### Coordinator checkpoint: recovery validation runner reviewed, 2026-10-12

Independent correctness and dedicated design reviews passed the immutable socket-free validation runner snapshot: parent 62 LOC (01ca66e2dd0332fd39c0b9ebfa8857eb594bef06216306475f8413785000cb75), checks 12 LOC (eb2a90caf805b66caf2f7d3f0adecaa2a3a0ee5424f74f708fc85dad92a40edc), inventory 29 LOC (7ac8fee18a2b8ae164a61eb51cfa927db2e66e9923e2122d581b5d3a09b3733f). Total 103 unique LOC, zero concrete defects, 0/KLOC; design overlaps. Obsidian unavailable; failure timelines simulated analytically. No runtime acceptance claimed.

Coordinator independently verified archive SHA256 8fa39315af9d8e56ff15a0147f0cfd662a025c0771aa15bd150f1b8ef90f013f and ten regular flat members. Delivery manifest pin is 3c388c9889c007055671592b3d4ad758d77eaf9817c2779fcfb36223b14e3318. Concrete staging authentication/mode commands remain under preparation; archived 0666 modes must be normalized to 0644 and mounted root 0755 within a private outer directory. Existing worker accepted review receipt 7773ff84-844b-4ba9-bc86-947312edbdd3; consumption not yet observed. No remote allocation, staging or Docker execution this checkpoint. Fable PID44920 was confirmed live; performance R4 remains pending. Full application implementation and Auth/Storage acceptance remain incomplete. No ultrareviews or new paid sessions.

Staging follow-up: fresh coordinator read-only fleet probe exited SSH0, confirmed expected host/default Unix socket/pinned Ruby base, MemAvailable 38794956800 bytes and filesystem free 272173879296 bytes. Shared evidence root is mode0775; proposed sibling source0755 does not establish the stated private outer boundary. Worker visibly consumed receipt f4183c05-315c-4dc9-bd84-281296969240 and is changing only launcher source location to $AUDIT/source under fresh private0700 audit, preserving source0755/file0644 and the three reviewed scripts. Launcher51-line review remains pending; no remote mutation. The previous terminal wait observation timed out, but a fresh read confirmed the same worker live and implementing the repair; no restart.
Launcher review completed against document8d0db39adce94fa1df5babced3e616e28896dfd06e15e99a4177b3a9289c4b06 fenced51LOC: one LOW defect,19.61/KLOC. Disabled errexit can mask reconciliation.status write failure after successful tests; restore set-e immediately after each captured parent/inventory status before writing its status file. Repair delivered to existing worker receipt c4b5388d-362b-4fcb-b26c-df79ee24bd0e (accepted, consumption not yet observed). Private staging prerequisite tracked separately. Final launcher repair comparison and Docker runtime remain pending.
### Coordinator checkpoint: recovery validation runtime allocated, 2026-10-12

Root verified final launcher55LOC SHA256 f1fff25dc950aa0de5307a70f9b3bc51024e2fdb10e3d734bdf25071cacea5b3: LF-only, exact documentation block match, private0700 AUDIT/source0755, and errexit restored before both status writes. The one LOW launcher finding is statically resolved; runtime remains pending. Three reviewed runner hashes unchanged (103 unique LOC,0 defects); dedicated design overlaps. Original launcher51LOC had1LOW,19.61/KLOC; no new execution claim.

Exclusive fleet-02 BE validation reservation10minutes plus independent reconciliation granted to existing worker via receipt8622e13a-8b5e-497e-aa8e-07fd4faaa94d. Scope: authenticated additive staging of archive8fa39315af9d8e56ff15a0147f0cfd662a025c0771aa15bd150f1b8ef90f013f and socket-free Docker checks only, conditioned on fresh host/context/capacity/canonical52/base/conflict preflight. FE released; PERF has no lease. No pulls/builds/services or retained-volume/image recovery. Worker must capture independent statuses and preserve shared bases, builder, four retained volumes and app image; coordinator acceptance precedes lease release. Full Auth/Storage and whole-application completion remain pending. No ultrareviews or new paid sessions.

### Coordinator checkpoint: recovery validation independently passed, 2026-10-12

Evidence: fleet-02:/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-recovery-validation-audit.DIGxywd8. Coordinator read launch_exit=0, parent_exit=0, test_exit=0, cleanup_failed=0, source_exit=0 and independent_inventory_exit=0 over SSH exit0. Actual Docker checks.log records exact no-prune removal, daemon failure propagation and unsafe-original discrimination PASS, with all nine source hashes valid before and after. This verifies the socket-free recovery regression, not Auth/Storage integration or retained-volume content.

Fresh independent inventory found no be01recoverycheck containers and confirmed all four exact retained config/data/state/storage volumes, app image sha256:7d755994b0456f71886c92ec548e55b64f58d0c8a579c14cde401f23b715b0f8 and default builder retained. Validation lease released; receipt c08593fd-ac38-47a1-95d6-7052f02a6cd9 requests concrete retained-resource recovery invocation preparation only. No recovery allocation yet. Fable PID44920 confirmed live; R4 remains pending. No new ultrareviews, paid sessions, live activation or purchases. Full application objective remains incomplete.

### Volume transport repair static review, 2026-10-12

Immutable be01-capability-volume-transport.sh SHA25644bbb5de36b813a5f68b68d894fc50e2ec400fe1271e9143aad5ceccec93b1a7 received independent correctness and dedicated design reviews: 41 unique LOC, zero concrete defects, 0 defects/KLOC. Design overlaps and is not counted twice. Both reviewers verified hashes before/after. Reviewed inventory failure/empty/duplicate IDs, exact historical IDs, invocation pin, retry guards, status propagation and timeout hierarchy. Obsidian unavailable; design failure simulations were analytical. No runtime acceptance. Transport-specific Docker regression and concrete authenticated delivery remain pending; no fleet reservation allocated. Existing worker received queued follow-up2ba5f369-61aa-4997-bcb9-1d144888a79c; consumption not yet confirmed. Whole application remains incomplete.
### Transport regression review finding, 2026-10-12

Correctness and dedicated design reviewed immutable regression f04981e96117e854327d9d6744ad5e5fe3d95068fc03a6d4f2d8398f3d99e43f: 70 unique LOC, one unique LOW defect (14.29/KLOC), overlapping reviews not additive. Line49 piped input can race intentional stdin closure; pipefail can report producer SIGPIPE141 despite transport success. Requested prepared input file plus direct redirection/status capture in receipt d832d2f9-2262-49c2-8a7a-1f3c72d347f8; consumption pending. Transport41LOC itself remains static0 defects. Regression runtime NOT_RUN; Windows SSH delivery not proved by synthetic shell discrimination. Obsidian unavailable; design simulations analytical.

Fable PTY61161 was live but waiting on a concrete read-only source/hash permission prompt. Coordinator approved that specific check; PTY resumed and remained live. No test, fleet reservation, new paid session or remote mutation authorized by that approval. Whole application remains incomplete.
### Transport regression review closed; Docker allocation, 2026-10-12
Repaired regression bab36a6ae50b7c9ce9665c051e88141206e302cf9205ef968667e224e6f962fc: 71 unique LOC, zero remaining defects. New Docker wiring parent88/checks18/runtime24: 130 unique LOC, zero defects. Dedicated design independently reviewed the same 201 LOC in bounded slices; overlap is not additive, density0/KLOC. Original single LOW SIGPIPE finding is closed statically. All four hashes matched before/after review. Obsidian unavailable; design simulations analytical. Runtime and real Windows SSH remain unverified.
Coordinator receipt6ea7a88a-9a4d-4c41-a123-0939e7533b75 allocates fleet-02 to BE transport-regression validation for30 minutes plus independent reconciliation, conditional on fresh preflight. Exact archive85042689cfeb33cffbfb5142cab588429bfc210db529928c1960732050090df6/package52a8c974a6fa2250b16ded714f66b568cd0963e8289e8553c851b712ec2e2381; additive staging, existing capped tools build and one1200+180-second parent only. No recovery/full-services/image-removal phase or retry. Retained four volumes/app/shared bases preserved. Allocation accepted into worker queue; runtime result pending. FE confirms no conflict; PERF remains unallocated. Outer deadline bounds execution but cannot prove cleanup; independent exact reconciliation required after all outcomes. No additional ultrareviews or paid sessions.
### Reconciliation closed; dependency repair and performance review, 2026-10-12

Root read the backend follow-up evidence over SSH exit0: followup_exit=0 and source/retained/bases/builders/targets_absent/inventory exits0, workload_not_started=1. Original preflight and initial reconciliation failures remain preserved in audit be01-transport-audit-d473c069-e5cb-4e3c-ab87-c33590c41d5e. The spent transport allocation is closed; parent/test/cleanup remain NOT_RUN. Four retained volumes, app image and shared bases were preserved. The existing BE worker visibly consumed request bfac9f7b-3b0d-47b9-82a6-eb37b70cf7c1 and is implementing only the local dependency correction and boundary regression; no new remote run is allocated.

PERF R4 static review at runner5fc0dd14/regression228795ad: regression ranges1-141 and142-291 cover291 unique LOC, zero confirmed defects, density0/KLOC. Dedicated design reviewed165 LOC (124 runner,41 overlapping regression): one conditional MED about unconditional shell wait after bounded KILL polling (conditional density6.06/KLOC), pending external-watchdog verification. Separate unresolved coverage concern: five-second writer may exit before25-second escalation, weakening the stopped-wrapper regression. These are preliminary findings, not runtime acceptance. Review hashes were stable. Obsidian unavailable; design simulations analytical. Feedback visibly submitted in existing Fable PTY61161; its working indicator confirms the review turn started. Full runner review and Docker validation remain pending.

Lane P independent-cleanup.log re-read successfully: exact cleanup PASS, shared bases and fe01r8-probes-stage retained. Linux PowerShell only; no native Windows claim. Latest FE terminal reports r11 released and no pending fleet need. No ultrareviews, new paid sessions, frontend changes or live activation. Full application remains incomplete.

### Dependency correction frozen; performance R5 underway, 2026-10-12

Backend dependency correction: correctness and dedicated design reviews cover the same 170 unique executable LOC (parent89/checks20/regression61), zero defects, density0/KLOC; overlapping reviews are not additive. Hashes remained stable: parent1161916e152384f06276a6518a4bc73afda15c7e72072dcc692cea3282481ae4, checks00c811dfa412def32f2fbbc197bffdb51fdc4fabee4c5fa5ee21b6c27c24f960, regression9d99e7a1b5baa8687ce26454427d2661cefd6b85fc5ed4c64afc78e2de8bf994. Obsidian unavailable; design simulations analytical. Package8a9613df and seven-file archive0dde1cfc are frozen in BE01 R1 docs/evidence/be-01-services-transport-dependency-freeze.md. Follow-up review covered manifest11/runtime24/Dockerfile21/baked checks17: 73 additional LOC in this pass, zero defects, density0/KLOC (historical coverage is not cumulative). All11 manifest entries match disk before/after. Baked service checks are copied but not invoked by transport; removed service manifests are unused on this execution path. Helper internals/canonical manifest retain prior review limits. Syntax/runtime NOT_RUN. Worker visibly consumed request8911dfae-e8a5-4a4a-a3f9-aa83bccc225d to prepare new seven-member staging locally; no remote allocation or mutation.

Fable lead reports R5 work assigned to the existing benchmark owner: keep the stopped-wrapper writer alive through escalation, cap child reaping, and detect output-descriptor holders that escape process groups. These are proposed repairs, not verified behavior. R4 review history remains preserved; revised hashes, bounded review and Docker execution pending. No ultrareviews, new paid sessions or frontend edits. Full application remains incomplete.

### Seven-file stager review checkpoint, 2026-10-12

Correctness and dedicated design independently reviewed all 97 lines of docs/evidence/scripts/be01-transport-stage.py at SHA256 d5f9a669c2a413ed5b03faf39f9fde5baaeac95073792a407be305c2b44eb222: zero concrete defects, density 0/KLOC; overlapping reviews are not additive. Hash remained stable. Archive authentication, exact member/dependency validation and destination checks precede exclusive writes; partial writes remain for reconciliation and prevent blind retry. Safety requires an exclusive filesystem lease. Obsidian unavailable; failure simulations were analytical. Docker regression and wrapper acceptance remain pending; no native Windows claim.

Existing BE worker visibly consumed request 3ccce603-a1c8-4401-828a-d1add16da649 and is preparing Docker-only success/mode, pre-write rejection and partial-write/retry regressions. Shell wrapper d6bbc4c0106b7550feabe1afee5eaa629910b7ac2477d5d83d864b0765d9ac80 is under preliminary bounded correctness/design review. No remote allocation or mutation, tests, ultrareviews or new paid sessions this checkpoint. Fable R5 remains with its existing benchmark owner; no revised freeze received. Full application remains incomplete.

Wrapper review follow-up: be01-transport-stage.sh SHA256 d6bbc4c0106b7550feabe1afee5eaa629910b7ac2477d5d83d864b0765d9ac80 remained stable across correctness and dedicated design reviews: 103 unique LOC, zero defects, density 0/KLOC, overlapping coverage not additive. This is preliminary static review, not runtime acceptance. Trusted historical baseline, authenticated invocation, exclusive lease and external whole-process watchdog remain prerequisites. Forced termination with missing status remains unknown until independent reconciliation; inventory_exit includes staged-file verification. Feedback request 6e851ea3-1432-4fe2-b6f2-3f2a224fda0e accepted by existing worker; consumption not yet verified. No remote work allocated.

### Staging regression reviewed; bounded Docker allocation, 2026-10-12

Correctness and dedicated design reviewed regression153 LOC at42cff9fd6c3c566817f86ceca2d37bcdb421c929822bb08af2f4d081ec6af347 and checks16 at a794d932075f66e92f7d9c58dfb3e701b7aa697e6fa97e633fb8d3ba10ddda99: 169 unique LOC, zero defects, density0/KLOC; overlap not additive. Hashes stable. Tests invoke the real authenticated stager and assert success bytes/modes, unchanged destinations on rejection, actual partial write preservation and retry refusal. Obsidian unavailable; design simulations analytical. Shell reconciliation, lease/signal behavior and runtime remain unproved.

Root read frozen packet5ba6501e and current FE terminal confirms r11 released/no current fleet need. Coordinator receipt2e4d3d8c-a1e2-4836-b4f3-58dee2ce871d allocates fleet-02 to the existing BE worker for15 minutes from consumption plus independent reconciliation: one constrained Docker Python fixture run only, contingent on fresh preflight and verified existing pinned Python image. No acquisition/build, real source staging, recovery, services or retry. Four retained volumes/app/shared bases and canonical52 preserved. Exact disposable-container cleanup requires verified identity/mount ownership; independent inventories required. Worker visibly consumed the reservation and began reading prerequisite evidence; currently compacting its live session. Test has not yet been reported started. Fable PID44920 confirmed live; R5 freeze still pending. No ultrareviews/new paid sessions/frontend edits. Full application remains incomplete.

### PERF R5 preliminary review, 2026-10-12

Runner SHA256 `0404b7757f28ba5f7e6a69d8de592a43cbbd4d055f66daf0178e84b82441eb53` has two confirmed static defects: HIGH descriptor enumeration suppresses errors and reports success (lines 118-121); MED failed or malformed process-state reads become `gone`, permitting an unbounded wait on a live child (408-423). Review coverage: 396 unique lines (1-200 and 385-580), two unique defects, 5.05 defects/KLOC; dedicated design coverage overlaps and is not additive. Hashes remained stable. Fable was sent the findings and requested negative regressions; delivery is not yet confirmed consumed. No performance execution or acceptance. Obsidian unavailable; design scenarios analytical only.

Backend terminal remains live, compacting after consuming its single Docker-only staging-regression allocation; no runtime result received. Lane P independent-cleanup.log reread over SSH successfully; shared bases and FE residual preserved. Whole-project implementation, integration and native acceptance remain incomplete. No additional ultrareviews or paid sessions launched.
### PERF R5 review completion, 2026-10-12

The same 396 unique reviewed lines at runner `0404b7757f28ba5f7e6a69d8de592a43cbbd4d055f66daf0178e84b82441eb53` contain three confirmed defects (7.58/KLOC): the two preceding findings plus MED suppressed stderr-copy failure at line 457, which can seal incomplete diagnostic evidence. Dedicated design review covers 196 overlapping lines, nonadditive. Fable received the consolidated narrow R6 repair request with negative regressions and no execution/fleet allocation. Backend worker has resumed after compaction and is checking prerequisites for audit `be01-stage-fixture-f70ea681-10a0-4b8b-8f20-9b799d091557`; no Docker test result yet. These findings supersede the preliminary two-defect count, not additional coverage.
### Python prerequisite acquisition allocated, 2026-10-12

Staging fixture audit be01-stage-fixture-f70ea681-10a0-4b8b-8f20-9b799d091557 stopped at preflight1 because immutable Python f0408636 was absent; tests NOT_RUN, no task container or cleanup. Initial SSH exit UNKNOWN remains recorded. Root independently read remote reconciliation.status over SSH0 and local reconciliation.log: source/inventory/retained/shared/cleanup0; four volumes, app, shared bases/builders and canonical52 retained. Raw shared-host delta -17395712 bytes is not attributable reclamation. Spent reservation closed.

Receipt752a6c0f-9474-45e9-b9fa-a74ea8b3f2da grants the existing BE worker a fresh20-minute fleet-02 slot plus reconciliation to acquire only python@sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a (300s+30 pull bound), authenticate the unchanged delivery, and perform one reviewed constrained Docker fixture (210s+15). Fresh preflight required; no real staging/recovery/services/builds/retry. Exact task cleanup and independent reconciliation required; preserve shared/persistent resources. Receipt accepted; consumption not yet verified. FE terminal reports released/no conflict; PERF remains unallocated. Fable PID44920 and PTY61161 verified live; exact read-only hash/line inspections approved, consolidated three-defect repair consumption remains unconfirmed. No new paid sessions, ultrareviews, frontend edits or live activation. Full application remains incomplete.
### Staging fixture passed; cleanup limitation retained, 2026-10-12

Audit be01-stage-fixture-6bc117b9-8084-42d2-8f5b-8b37990b742d: root inspected run.log/run.stderr/run-ssh.status, confirming five Docker regression tests passed in 3.617s, test/process/SSH/source exits0. Root independently read remote reconciliation.status over SSH0: independent_reconciliation_exit=0. Reconciliation log records source/inventory/retained/shared0, task_name_label_absent=1, but cleanup_exit=1 and STOPPED_IMAGE_RETAINED because historical container ID is UNKNOWN after an empty Docker event query. Acquired pinned Python image retained; this is not full cleanup PASS. Four retained volumes/app/shared bases and canonical source preserved. Raw shared-host free delta -46268416 bytes is not attributable reclamation.

Spent allocation752a6c0f closed with that limitation; request3df4481b-cfe7-4d51-b8cb-29d48eac9fbc asks the existing BE worker to document the result and prepare the reviewed seven-file staging invocation locally. Accepted input, consumption not yet verified; no new remote mutation allocation. FE terminal currently states no conflict. Fable PTY61161 confirmed live and compacting after exact read-only hash-check permission; prior three-defect repair text remains in its composer, not proven consumed. No ultrareviews, new paid sessions, frontend edits or live activation. Full implementation and real Auth/Storage acceptance remain incomplete.
### Capability invocation failure reconciled; R6 withdrawn, 2026-10-12

BE-CAPABILITY-CHECK-20261012-01 CLOSED as pre-launch transport failure127. Root read remote process.status, independent/status/components.status and followup.status over SSH0: launcher/parent not started, tests NOT_RUN, task_allocation0; source/inventory/retention/historical absence/builders/independent inventory all0. Evidence: be01-capability-check-delivery-226b8d85-75ad-409f-83d8-26c55f8421f8. Free272609939456 to272592338944, delta-17600512 shared-host movement, not attributable reclamation. Broad AUDIT replacement corrupted CHECK_AUDIT. Existing worker assigned local exact-sentinel repair and concrete invocation for review (receipt747bf5fb); consumption confirmed in the live terminal. No remote retry allocated.

Fable acknowledged the confirmed same-UID unreadable-descriptor flaw and withdrew R6, routing R7. Dedicated design review additionally found unchecked holder-output printf/sort/tr processing can erase actual holders while returning success. Repair feedback delivered; second message consumption pending. Reviewed runner1-200 and401-600 plus suite361-409:449 unique LOC,2 unique HIGH defects,4.45/KLOC. Design138 LOC overlaps89 runner lines; do not add overlap. Unknown-live handling/copy gating passed their bounded slice, but case13 only covers an unreadable zombie, not a demonstrably live child. Focused live-child regression requested. Obsidian unavailable; tradeoffs assessed analytically. No performance runtime acceptance or fleet allocation. Full Auth/Storage and whole-project completion remain pending. No ultrareviews, paid sessions, frontend edits or live activation.

Capability invocation repair review started: fixed invocation12a1fd28 (28 LOC), Docker-only regression23f02db9 (51 LOC),79 unique LOC assigned to existing adversarial design reviewer. No execution; review outcome and freeze pending. Existing Fable PTY61161 and backend Orca terminal confirmed live. This checkpoint is a verified wait on active repair work, not project completion.

### Invocation lifecycle review, 2026-10-12

Adversarial design review completed at stable hashes invocation12a1fd28 (28 LOC) and regression23f02db9 (51 LOC):79 unique LOC,1 MED defect,12.66 defects/KLOC. Observer cleanup only on normal path permits process.status write failure or interruption to leave the observer running until1540s timeout. Existing backend worker received exact-PID idempotent cleanup-trap repair and Docker-only early-failure/signal regression request (receipt0d5d11c0). No retry allocated. Fixed UUID path validation and original127 regression discrimination are statically sound; full wrapper lifecycle and outer status propagation remain untested. Obsidian unavailable; analytical tradeoff only. Fable R7 packet now acknowledges both HIGH defects and focused live-child regression. Runtime acceptance and whole-project completion remain pending.

### Invocation repair and fleet handoff reconciliation, 2026-10-12

Repaired invocation ec2fd5cc (45 LOC) and regression d6ce7124 (94 LOC) passed static adversarial re-review: 139 unique LOC, zero defects, 0/KLOC. Prior observer lifecycle defect is statically closed; Docker regression remains NOT_RUN. Signal stubs establish eventual handling only, not immediate cancellation of a real foreground child.

BE-INVOKE-REGRESSION-20261012-01 was accepted and consumed, but the latest user Lane P handoff returned fleet-02 to FE r9. Hold receipt 0cad9a2b was consumed: backend explicitly confirms only local preparation, no SSH/staging/container creation or remote mutation. FE reconciliation request a115f026 has turn-start proof; awaiting fresh release before regression execution. Fable process44920 confirmed live; R7 result pending. No ultrareviews, paid sessions, frontend edits or live activation. Full application completion remains unproven.
Fresh FE reconciliation consumed and answered: r9 was superseded by completed r10/r11; final release e78cd0cc, no active FE remote handles/transfers/tasks. FE explicitly released fleet-02 for the bounded backend invocation regression in response to a115f026. Coordinator lifted the hold for BE-INVOKE-REGRESSION-20261012-01 only, fresh 10-minute window from consumption plus independent reconciliation, all prior resource/identity/security gates retained. No capability/services/PERF allocation. Execution outcome pending.
### Service diagnostic repair review, 2026-10-12

225 unique LOC: services.rb 1-58 (b2fedbbbb2634d3eba2cf9b88a5127b0b829e5d49ec46c0ee43f8813c30e2368), diagnostic.rb 1-39 (35d30ed56f8d1590ad333803e481f65bad6d1e7ba076f8a24c551937874f52eb), regression.rb 1-128 (ac7f7c541b35604cd477df24bddc64d40805899d89d6974c69d8fcdd2731c5a6), in the BE01 R1 repair directory. Bounded assignments 162 initial LOC, 39 dedicated design LOC, and 128 regression re-review LOC; overlap not additive. Zero confirmed defects, density 0/KLOC. Original generated draft corruption was fixed before reviewed hashes. Added check/reseed/setup cases close initial coverage gaps. Timeout behavior and real integration remain unproved; Docker tests NOT_RUN. Fixed diagnostic vocabulary trades specificity for privacy. Analytical tradeoff simulation only; Obsidian unavailable. No ultrareview.

### R7 bounded static review, 2026-10-12

R7 review checkpoint (2026-10-12): frozen runner89b8a5c4 and suite7ed20460 passed bounded scan/regression static review (317 unique LOC), plus dedicated design review of119 additional runner LOC (436 unique code LOC, zero executable defects, 0/KLOC). One MED proposal defect: proposed TOTAL3300 plus watchdog300 plus kill grace60 is3660 seconds, exceeding the stated3600-second lease. Correction sent to Fable; executable constants remain frozen. Supplemental suite36-52,117-119,147-149 review passed:23 additional unique LOC, zero defects; aggregate459 unique executable LOC,0/KLOC. Foreground docker logs seal gap and Docker runtime remain open. Backend diagnostic packet837a2415 reviewed; worker is preparing concrete dispatcher and checking local cached Minitest; no remote allocation. No ultrareviews or paid sessions. Full application remains incomplete.

Coverage: runner1-200,260-290,310-335,480-505,750-770,800-814; suite401-517. Hashes verified before/after by reviewers. Documentation defect reported separately from executable density. Analytical tradeoff simulation only; Obsidian unavailable. Timing key includes settle/proof work, so it is not pure suite execution timing. Actual tmpfs nosuid/nodev verification remains a Docker requirement.


## BE diagnostic dispatcher static review (2026-10-12)

Reviewed dispatch.sh lines1-98 and checks.sh lines1-14, plus8 input manifest entries at hashes63501c5f/8cecdca8/380bc01a.112 unique executable LOC,0 confirmed defects,0 defects/KLOC. Exact hashes remained stable before/after review. Covers status propagation, input authentication, offline tmpfs gem installation and ownership-checked cleanup. Dedicated design review pending. No Docker execution; overall deadline can interrupt cleanup, requiring independent reconciliation. Downloaded gem independently authenticated by root; UID readability and Docker inspection representation remain runtime gates.

### Diagnostic reconciliation and design review — 2026-10-12

Reconcile script: 44 LOC, SHA256 0a0e73b595445c3848a961d650f03f5b147f09c84856a1abfcec957eac4cf101; zero confirmed defects, 0 defects/KLOC. Aggregate dispatcher/checks/reconcile coverage:156 unique executable LOC. Dedicated design:76 overlapping LOC, zero defects; analytical success/failure/timeout tradeoffs, Obsidian unavailable. Missing-ID cleanup remains UNKNOWN; trusted baselines and separate canonical source checks required. Static review only; Docker regression NOT_RUN.

Diagnostic invocation R2 (2026-10-12): invoke-r2.sh SHA a27537d6fa9756bbb1734e801526f9af5e26bd5d82d22a62f6b9b4c7fea59e59, all73 LOC adversarially reviewed; zero confirmed defects,0 defects/KLOC. Reviewer cumulative369 LOC. Historical single JSON object and fresh single-element inspect array validate identical identity fields; normalized comparison retained. External authenticated delivery remains required. Prior dedicated design review remains applicable to unchanged dispatcher/reconciliation. Static acceptance only; schema/runtime tests pending under BE-DIAGNOSTIC-20261012-02.

R8 review checkpoint (2026-10-12): stable runner8bf0be56 reviewed across281 unique LOC (131 functional plus182 design,32 overlap). One MED defect,3.56 defects/KLOC: pgid readiness polling can add5s before the fresh logs await cap, exceeding the65s reservation; narrow shared-deadline/subtracted-elapsed repair and regression sent to Fable. Design slice independently found0 defects; analytical simulations only, Obsidian unavailable. Backend diagnostic02 stopped at delivery creation SSH1 before upload/tests. Root read reconciliation log: delivery/audit absent, source/retention/name-label zero, complete marker, but native independent SSH status empty; correction and cause requested. Runtime NOT_RUN. No new allocation or ultrareviews.
Functional ranges530-620,830-869; design1-80,620-690,835-865. Union281 LOC; density3.56/KLOC. No runtime validation.

### R8 regression review — 2026-10-12

Independent adversarial reviewer covered 101 unique LOC in `ops/perf/tests/fleet-guards-guards.sh`: 68–84, 134–145, 204–212, 228–237, 540–592. Stable SHA256 `86892c14c51c5bb108c5e9192a648382755bab10c955e99fc1945a7684b7059d`. One MED defect; density 9.90 defects/KLOC. Case 18 permits an immediate KILL to pass because it only checks an upper duration bound and any numeric exit. Requested conservative lower bound and observed TERM marker while retaining eventual termination and seal checks. Case 17 meaningfully exercises the escaped writer and late temporary-file write. Static only, no Docker execution. Feedback sent to existing Fable PTY61161; consumption pending. Existing dedicated design review remains separately recorded.

Backend bootstrap draft inspected locally: exception after Process.Start may leave SSH running because Dispose does not terminate it. Requested bounded failure-path termination and log preservation from the existing backend worker; draft not accepted or allocated. No remote execution.
### Bootstrap output-drain review — 2026-10-12
Read-only adversarial review: bootstrap.ps1 lines1–73 SHA04557d42e019dd2db06cd5cce7c7437df7775e81f54d95c9b1fb7ec92c22277f; bootstrap.sh lines1–16 SHA3ab389aa8f6d022afa3ea531d031b2912d3c0a8911b66ac761df5a4121424db3. Stable before/after. 89 unique LOC,1 MED,11.24 defects/KLOC. At PS1 line54 process exit does not prove ReadToEndAsync completion; immediate IsCompleted can discard logs and falsely fail. Bounded shared drain deadline and regression requested from existing worker, receipt8adfedf8; hash correction sent separately. No runtime execution or acceptance.

Bootstrap drain re-review: PS1 lines1–80 SHA0dd7ddede090bb85eaaf6e5b94de1d3ed12011ea288787061384cbefe406484d stable. 80 LOC,0 new defects,0/KLOC; prior MED statically closed by shared monotonic5s drain at lines50–56. Reviewer cumulative169 LOC. Original status precedence preserved; runtime unverified. Dedicated design review dispatched; concrete regression fixture requested from existing backend worker (5e2d740c). No remote allocation.

Bootstrap dedicated design review:96 executable LOC (PS1 1–80 SHA0dd7dded and shell1–16 SHA3ab389aa),0 code defects,0/KLOC, stable hashes. Analytical success/exception/timeout/delayed-EOF/partial-remote scenarios; Obsidian unavailable, no runtime proof. Clarify docs that timeout aggregate124 preserves native status in evidence. Feedback receipt49472887 sent. Existing worker visibly consumed concrete fixture implementation task; no remote allocation.


Bootstrap fixture adversarial review (2026-10-12): regression.rb1-87 SHA f4aa07f8558687e1a6df5ae60289af7ec0897dcf84868c76fe24cb6c532230fe and fake-ssh.rb1-29 SHA79705a0d32ad99f119d1f208d4bbec8a873b66db610a99406fa1094183ca10c2 stable before/after. 116 unique LOC,1 HIGH,8.62 defects/KLOC. Open3.popen3 block cleanup joins the wait thread before outer ensure kills the process group, so105s timeout can hang. Move termination inside the block before its implicit join; correction queued receipt468c6c0e. Nine cases cover actual pinned caller, argv/stdin/status/log/timeout/evidence errors; no case forces post-start caller exception. Runtime NOT_RUN; reviewer cumulative285 LOC. No allocation.

Bootstrap fixture re-review: regression.rb1-97 stable SHA6bf9f4f462c4a1642f3cd26a23a8da92ad7dbbf92ae0b2bb6bc70bcfe27a67f1,97 LOC,1 MED,10.31 defects/KLOC; prior HIGH closed. Group kill before SSH absence assertion masks caller cleanup failures; move assertion inside protected block before ensure. Receipt165133f8 queued; reviewer cumulative382LOC. Packet dedicated design:69 packet lines+12 checks=81 artifact lines (34 executable/listing),0 defects,0/KLOC, stable packet4754eefc44796f0f8b09b1de7836d24629670f9318a0aba54ac71aeb8901f11a/checks46bcbc373a111c859ee0ab54a5ff87a2e158c38595b84acc4a2b92e9290d7f39. Analytical only, Obsidian unavailable. Image provenance/build, refreshed fixture manifest and fresh allocation/profile gates remain prerequisites. Runtime NOT_RUN.

### Bootstrap regression closure - 2026-10-12

Bootstrap regression closure (2026-10-12): independent static re-review of regression.rb lines 1-97 at SHA256 b511c3c1eb7507caffbbb22bf2f3ef619264719ec7264fb633fa9b1238856c50 found 0 defects, 0 defects/KLOC. Prior HIGH unbounded Open3 join and MED cleanup-masking assertion defects are statically closed. Assertions now precede harness cleanup; bounded cleanup remains inside the Open3 block. Runtime remains NOT_RUN, including post-start caller exception and native Windows transport. Existing backend worker visibly consumed local tools-image build/fixture packet preparation receipt be928ea7-371d-4e37-aee4-2a1166dcdcf0 and is preparing the exact lifecycle; no execution allocation. Fable R8-4 consolidated freeze remains pending. No ultrareviews or new paid sessions; full application incomplete.
Reviewer cumulative coverage: 274 lines. Hash stable before/after. Zombie acceptance proves stopped execution, not disappearance from /proc. Independent asymmetric-pipe scheduling remains unproven. No runtime test or remote mutation performed for this review.

### Build adapter review - 2026-10-13

Recovery checkpoint (2026-10-13): Backend replacement term_4c9183f0-88ad-4124-8ea1-3d23bcaa14e1 is running GPT-6-Astra low; task receipt 374d3b77-8ef6-4e66-a135-8a813b95ce71 proves turn start. Concrete read-only approvals recovered Windows helper error 1223; no permission policy was disabled. Bootstrap functional review covers 298 unique LOC with 0 defects; overlapping 200-LOC design review found 1 MED status-propagation defect (5/KLOC): post-fixture verification can replace a timeout exit. The terminal transcript confirms delivery; resume receipt 35144ce9-7c6e-4930-ad21-488d196228f8 reached turn_started. Repair/regressions remain pending. Existing Fable session 26101251-0006-4000-8000-000000000001 resumed on term_5851b37c-1b27-4e83-810a-1f7331b7061d. Final R8 static review: runner 200 LOC, 0 new defects; assertions 115 LOC, 2 MED (17.39/KLOC), because slow cleanup can mask premature KILL and missing/malformed timing fields can pass. Repair request 041214e7-2176-4a85-861a-bb58087dc488 reached turn_started. R8 is not accepted; runtime NOT_RUN, S_FG 120/TOTAL 3200 unchanged. No fleet allocation, ultrareview or new paid session. Historical Linux-only Lane P and later FE r10/r11 evidence remain preserved.
Reviewed cleanup.sh84-133 and run-container.sh1-10 in addition to the two adapter files. Static review is not whole-packet or runtime approval.

## Bootstrap tools dependency and lifecycle review — 2026-10-13

Read-only review; Docker runtime NOT_RUN. The complete user rubric and current STANDARDS applied. Formatting remains delegated to linters.

| Assignment | Coverage | Defects | Defects/KLOC |
| --- | --- | ---: | ---: |
| Dependency completion | cleanup.sh 1–83; run-container.sh 11–24; preflight.sh 1–9: 106 LOC, bringing functional review to 298 LOC | 0 | 0 |
| Independent lifecycle design | parent.sh 1–94; fixture-run.sh 1–38; cleanup.sh 1–68: 200 LOC | 1 MED | 5.0 |

The design review overlaps the functional review; combined unique source coverage is 298 LOC, not 498. The open MED finding is fixture-run.sh lines 33–37: a fixture timeout 124 followed by failed docker inspect or ownership verification can exit 1 under set -e before returning the saved status. Preserve the original nonzero fixture status and separately record verification failure; a successful fixture with failed verification must fail. Both combinations require regressions. Initial durable delivery became operation_unknown. The later terminal transcript shows the full finding consumed; continuation receipt 35144ce9-7c6e-4930-ad21-488d196228f8 reached input_accepted and turn_started. Repair/regressions remain pending.

Reviewed hashes remained stable: parent 22c6f91e9458157dd5bb632375ae74fea229d9bee054edc027e6218c200a1b8a; fixture 4572143c0124b2840d648b097e33c5c8e98b9204426d62783dadd4b87e43b89e; cleanup 095fb2a580620b724070a0dc3c0d5400e38a98fc347d034c97f3fe3e47dcc3ec; run-container 3b847a5faa7a59b3c0f8cf325d91429f1d9a5be757fb5ffe29975f9bedde7289; preflight bbded0f0293175732e60c42251b54bc1010a3f895ea5b6d49bd37f05f6dfc613.

Analytical lifecycle simulations covered success, build failure, fixture timeout, and cleanup ambiguity. The 1,200-second outer timeout plus 180-second termination grace bounds the overall task without guaranteeing every inner command its full allowance. Client timeout alone does not prove container termination; exact cleanup remains required. Ambiguous resource identity or unreadable contents must be retained. Obsidian was unavailable, so these are recorded analytical simulations, not Obsidian or runtime results. External builder-verification helpers and final packet delivery/reconciliation remain outside this closure. No whole-packet approval.
## Performance R8 final static review - 2026-10-13

| Assignment | Exact source coverage | Defects | Defects/KLOC |
| --- | --- | ---: | ---: |
| Dedicated timing/design | fleet-guards.sh 1-56, 529-601, 812-882: 200 LOC | 0 | 0 |
| Adversarial assertions | fleet-guards-guards.sh 58-74, 153-157, 185-194, 589-671: 115 LOC | 2 MED | 17.39 |

The files differ, so combined unique coverage is 315 LOC (2 defects; 6.35/KLOC). The complete user review rubric and project standards applied. Formatting remains delegated to linters. Stable source hashes: runner 1e24bfac0b0e69825b2206411b91ff3df7a638b2005d76ecfaa642c5310ddf16 (882 total lines), suite 1fd49289f16a0cc59022631059902e491423b4f98528f83f1cce008ece930078 (671 total lines). This is bounded review, not whole-module acceptance.

R8-5 MED at assertion lines 633/664: logs_wall_s includes proof/copy. A premature KILL at second 44 followed by five seconds of proof/copy can satisfy exit 137, recorded TERM and the 49-second lower bound without honoring the five-second grace. Separate call-lifetime evidence from cleanup and prove premature KILL plus slow cleanup fails.

R8-6 MED at lines 590/599/651: rv accepts numeric prefixes, and concatenated validation permits individually empty fields. Missing wait_bound with handshake_s=3 and cap_s=22 can pass because arithmetic treats empty as zero. Each required field needs an individual complete-numeric-token check; missing keys, empty values and trailing junk must fail explicitly.

The dedicated design review statically closes the previous uncharged handshake allowance: counted allowances are 0+54+11, 3+51+11 or 5+49+11 = 65 seconds. These are requested-sleep accounting examples, not measured wall-clock guarantees; scheduling overhead can exceed them, and the external watchdog remains required. Child/group/descriptor ambiguity or failed copying records failure and refuses acceptance. Helpers, exit-trap sealing and full runtime were outside scope. The known estimated 265-second suite versus unchanged S_FG=120 still requires a separately bounded measurement. Analytical simulation only; Obsidian unavailable; Docker runtime NOT_RUN.

Both new findings were routed to the existing exact Fable 5.1 lead; durable request 041214e7-2176-4a85-861a-bb58087dc488 reached input_accepted and turn_started. Minimal repairs and a fresh freeze are pending; no new paid agent, fleet allocation, frontend edit or ultrareview was authorized by this review.

## Status regression and performance boundary review - 2026-10-13

All reviews used the full user rubric and project standards. Runtime NOT_RUN; no SSH or Docker execution. Formatting remains delegated to linters. Simulations were analytical because Obsidian is unavailable.

| Assignment | Source coverage | Defects | Defects/KLOC |
| --- | --- | ---: | ---: |
| Backend first repair review | fixture-run.sh 1-51, previous status-regression.sh 1-33, parent.sh 67-96: 114 LOC | 1 MED | 8.77 |
| Backend collision closure | status-regression.sh 1-34, fixture-run.sh 36-51, parent.sh 72-73: 52 LOC | 0 | 0 |
| Performance assertion closure | suite 58-83, 90-94, 162-168, 197-204, 600-723: 170 LOC | 0 | 0 |
| Performance dedicated design | suite 58-83, 90-94, 162-168, 600-723: 162 LOC plus documentation line260 | 1 MED | 6.17 |

The backend first review closed the original failed-test exit overwrite, but found Bash dynamic scoping caused fake docker/owned_run to return finalizer locals instead of injected outcomes. The minimal rename to injected_inspect_exit/injected_ownership_exit closes that finding. Final six analytically expected exits are 124,1,124,1,124,0; failed inspection skips ownership verification. Stable final hashes: regression ed678b60a3de7a395634aa274c5a02eada9c6b64cb482e32edf1f8080adacd4d, fixture eab086e616fb869a0579a746458565bf121b224ecd10881561ab204634a77221, reviewed parent ddfe3377902ebbd0399f17dcf60c45fb53c76dd2eaf29bc08c0e13a1d05ba5b5. Backend reviewer's cumulative volume is 366 LOC across versions, not unique source coverage. Report-write failure cases remain outside this six-case regression. The subsequent one-line parent phase label and new delivery/reconciliation files require final packet review.

Performance freeze suite 2ed59270e5ea2bf8ebdca0ab9137e66181d5312a32a5a63ff562b05ec0fdf4e4 and documentation f37b9346eeb0fc7e11198fe175f3bf1ba737b293b131506afbed65596554320e were stable before/after both reviews. Combined unique review coverage is 170 source LOC (the 162 design lines overlap), one new MED, 5.88 defects/KLOC. The original premature-KILL-plus-slow-copy and incomplete numeric-token acceptance defects are statically closed. New MED at suite629: timeout begins1000.90, fake start1001.01 records1001, TERM1044.90 records1044, last heartbeat1048.91 records1048, KILL1049.90. TERM delta43 and grace4 pass, but observed span47 fails the48 floor despite correct timer behavior. Add this synthetic boundary and accommodate47 while preserving premature44/zero-grace rejection. Treat these as observed heartbeat spans, not exact signal-delivery timing. Larger scheduler stalls remain a limitation. Correction receipt 45eba5b0-4755-48cc-be32-10001a189025 reached input_accepted and turn_started in the existing Fable session. Assertion reviewer cumulative285 LOC; design reviewer cumulative362 source LOC across assignments. No whole-module or runtime acceptance.
