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
