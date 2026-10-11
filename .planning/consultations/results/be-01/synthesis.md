# BE-01 consultation synthesis

Decision: accept the bounded local foundation in [decisions.md](decisions.md), using the executable [dispatch brief](dispatch-brief.md). This closes BE-01 design consultation, not application verification, code review, merge or any later task. No implementation or application test was performed by this synthesis agent.

## Evidence and scope

- Task: BE-01, [issue 3](https://github.com/tanzeel-roseyco/elevateo-mail/issues/3). Base: `103baeb042925badbbc50dc0d3d3bfbf09ce8344`.
- Identical common packet: SHA-256 `0d78de54f791778b5528192775cdc4ec7f507cc4a0afd72e932f3a7ebe3ab335`; all twelve source hashes matched the manifest. [source-packet.json](source-packet.json) preserves exact common text; the base commit alone does not identify working-document additions included in this packet.
- Actual synthesis runner: `gpt-6-astra`, effort `max`, canonical task `/root/plan_synthesis`, established by the coordinator's spawn-tool evidence. No opaque execution ID was returned; none invented. Planning date 2026-10-12 Australia/Sydney.
- All three opinions were separate, successful, single-turn executions with distinct session IDs, exact requested/observed canonical models and no cross-fed BE-01 opinions. Model-specific input prefixes, full opinions and structured metadata are retained. Prefixes' short names are labels; canonical IDs below control.

| Opinion | Requested and observed model | Session / result UUID | Outcome / reported list cost |
| --- | --- | --- | --- |
| [F5](fable-5.opinion.md) | `claude-fable-5` | `008f502d-83be-47dd-b366-ed10b3bcdb2e` / `52c30aab-81c4-4941-9f25-42f949440c2f` | Exit 0, success, 81.7 s / USD 1.509923 |
| [O55](opus-5-5.opinion.md) | `claude-opus-5-5` | `5ee49960-e945-42b5-bbe3-63129b88c4d8` / `f4571101-7413-47df-9c14-5a0513173528` | Exit 0, success, 83.8 s / USD 0.6562984 |
| [F51](fable-5-1.opinion.md) | `claude-fable-5-1` | `aea2daef-76a6-4975-8dcb-f7539642c597` / `8a5103e1-4bf7-40c9-8fed-25c3234180dc` | Exit 0, success, 144.4 s / USD 1.68777825 |

Total reported list cost USD **3.85399965**; not independently reconciled billing and not Devin spending. [metadata.json](metadata.json) retains full execution metadata, raw input/result/status hashes and each source verification. No credentials or real mail content appeared in the preserved material; substantive opinions were not abridged.

The [foundation dependency audit](foundation-dependencies.snapshot.md) arrived after the packet froze. The three opinions explicitly asked the coordinator to settle pins from that primary-source audit before dispatch; they did not inspect its final versions/digests. Acceptance below resolves that declared input. Runtime compatibility and advisories remain implementation checks. Initial PLAN opinions are not counted as BE-01 opinions.

## Scope and operational recommendations

| Recommendation | Source | Disposition | Reason / conflict | Decision / required evidence |
| --- | --- | --- | --- | --- |
| Pin compatible Ruby/Rails/Supabase and exact dependency graph before dispatch | F5 blocker 1; O55/F51 | Accept | The implementer must not make unreviewed platform choices | B01-02; audit snapshot, lockfiles, real build |
| Select exactly one Ruby type system before dispatch | F5; O55/F51 | Accept | Choose audited Steep/RBS, not two systems | B01-02/07; nonempty meaningful targets |
| Ship plain Ruby if type selection remains pending | F5 alternative | Reject | Selection is now settled; repository requires typed boundaries | B01-07; explicit framework seams |
| Prove usage read, billing stop and polling owner before dispatch | F5 blocker 2; O55/F51 | Adapt | Actual MCP sleep is verified; Free dollar telemetry is absent. User subsequently authorized existing $10 credit only. Record limitations and monitor actual state; no invented dollar cap | B01-08; coordinator authorization/control record |
| Balance/message limit is not a task cap | All | Accept | Retain exact distinction despite new credit authorization | B01-08; no purchase/top-up, stop on uncertainty |
| Split BE-01a/BE-01b or at least two sequential PRs | F5 | Reject mandatory split; adapt checkpoints | One cohesive foundation with two internal stops and complete sliced review avoids another changing-base task gate. Credit exhaustion means incomplete work, not waived checks | B01-01; dissent retained; reconsult any new continuation task |
| Defer OpenAPI generators/linter selection and unimplemented business routes | F5 | Accept | Health/readiness/error contract is enough before real routes | B01-01/07; A14 |
| Remove dedicated PowerShell lane as optional polish | F5 | Adapt | Windows use is an explicit product constraint; thin wrappers share Compose logic | B01-07; A15 actual Windows execution |
| Retain idle worker and default hold from day one | F5/F51 | Accept | Proves two-command/shared-image topology without speculative dispatch | B01-06; A01/A13 |
| Narrow writer documentation ownership | All | Accept with same-commit rule | Devin evidence file and explicit patch list; coordinator reconciles shared files, without stale implementation commits | Dispatch ownership section |
| Verify push/PR permission beyond read-only preflight | F5/F51 | Accept | Read/fetch/Docker evidence does not establish remote writes | B01-08; coordinator write-scope evidence |
| Require throwaway branch as the only permission proof | F5 method | Adapt | Verify actual capability and reserved draft path with minimal authorized change; no need for unrelated throwaway artifacts | B01-08; reconcile uncertain writes |
| Avoid future send ledger, provider, client/IPC and motion work | All | Accept | Preserve bounded task | B01-01; diff/review scope |

## Database, authorization and migration recommendations

| Recommendation | Source | Disposition | Reason / conflict | Decision / required evidence |
| --- | --- | --- | --- | --- |
| Name transaction-local claims convention in the plan | All | Accept | `app.user_id` / `app.org_id`, not a mix of JWT/context conventions | B01-04; A08 |
| Parameter-bound set_config inside explicit transaction | O55/F51; F5 no-op warning | Accept | Avoid SQL injection and context writes outside a transaction | B01-04; wrapper/no-wrapper tests |
| Missing/empty claims deny; malformed claims deliberately error | All | Accept | No permissive default; handle both NULL and empty setting states | B01-04; A06/A08 |
| Assume missing current_setting always returns an empty string | F51 phrasing | Adapt | Missing and previously set/reset states can differ; test both NULL/empty | B01-04; A08 |
| FORCE RLS and separate ownership/runtime roles | O55/F51; F5 | Accept | ENABLE alone and owner-run tests are insufficient | B01-03/04; A05 |
| No BYPASSRLS, superuser, ownership or SET ROLE escape for API/worker | All | Accept | Prove actual session/current role and memberships in harness | B01-03/04; A05 |
| Worker gets narrow explicit business policies | O55 | Adapt | No business job exists here, so no business grants yet | B01-04; A05 |
| Test future authorized writes as part of foundation | Broad draft reading | Defer | API is read-only in this slice. Test negative writes now; BE-02 must add genuine mutation policies and positive tests | B01-04; A06 |
| Direct PostgreSQL pool, no Supavisor; test actual topology | All | Accept | Do not infer transaction-pooler guarantees from another topology | B01-02/04; A08 |
| Pool size one commit/rollback/exception reuse plus small concurrent pool | All; O55 concurrency | Accept | Detect leaked claims and concurrent misrouting | B01-04; A08 |
| Deny wrapper-free access and assert cleared claims | F5/O55/F51 | Accept | Make failure closed mechanically observable | B01-04; A06/A08 |
| Protect nested contexts and policy recursion | Synthesis elaboration | Accept | Necessary details of explicit transaction/RLS design, not new product scope | B01-04; conflicting nested principal / acyclic policies |
| Organization-aware composite keys; actor belongs to both organizations | All; F5 dual membership | Accept | Constraints bind the row's organization independently of actor membership | B01-03; A07 fixture writer |
| External Auth UUID reference, no Auth schema ownership/FK migration | O55/F51 | Accept | Keep service migration boundary intact | B01-03; A03/A12 |
| Seed users via real Auth admin API, never direct auth.users inserts | F5/O55/F51 | Accept | Real Auth identity fixture and stable repeated seed | B01-03; A03/A11 |
| NOLOGIN group ownership, generated ignored login credentials | O55 | Accept | Version grants/roles without committing local secrets | B01-03; A05/A11 |
| Dedicated hidden app schema; SQL structure dump excludes Auth/Storage | O55 | Accept with metadata distinction | Keep tenant tables FORCE-protected and migration bookkeeping separately private; schema dump does not include global roles | B01-03/05; A09/A12 |
| Remove app schema permissions from anon/authenticated/service_role/PUBLIC | O55; F51 sole authority | Accept | BYPASSRLS does not excuse schema exposure; service_role exception is Storage HTTP only | B01-05; A09 |
| Flag SECURITY DEFINER/BYPASSRLS/superuser uses | O55 | Adapt | Review any instance and runtime connection; narrow upstream/bootstrap privileges are real, so a blind keyword ban is misleading | B01-03; role audit and review |
| Test actual failed migration with per-migration transactional semantics | F5/O55 | Accept | Entire multi-migration run need not roll back; test the failed migration/version entry | B01-07; A12 |
| Skip RLS for cheaper Rails-only isolation | O55 rejected alternative | Reject | Contradicts accepted defense boundary and task requirements | B01-04; A05–A08 |

## Supabase, Storage and no-live recommendations

| Recommendation | Source | Disposition | Reason / conflict | Decision / required evidence |
| --- | --- | --- | --- | --- |
| Record exact minimal service set and required dependencies | All | Accept | Five audited backing services, not unconstrained full stack | B01-02; A01 |
| Four services: omit PostgREST along with optional Supabase services | F51 hypothesis; O55 conditional | Reject PostgREST omission | Pinned Storage configuration depends on it; audit overrides unverified four-service hypothesis | B01-02; real object round-trip |
| Omit imgproxy if transformations disabled | F5/O55; audit | Accept conditionally | Disable pinned feature flag and remove dependency together | B01-02; A01/A10 |
| Omit Studio/Realtime/analytics/Edge Runtime/Supavisor | All | Accept | No requirement in this foundation | B01-02; actual profile resource metrics |
| Omit public gateway under Rails-only client authority | O55/F51 | Adapt | Internal tests use service DNS; BE-02 must implement facade and path/issuer contract before clients authenticate | B01-02; no fake SDK URL compatibility |
| Private bucket with no direct anon/authenticated object policies | O55/F51 | Accept | Avoid second public authorization surface | B01-05; A10 |
| Allow server-only Storage service credential despite blanket service-role wording | O55/F51 | Accept narrow exception | Storage HTTP adapter only; no Rails database bypass, client disclosure or logs | B01-05; A05/A09/A10 |
| Route all Storage operations through centralized authorized adapter | O55/F51 | Accept | Fixture authorization uses database context and server-owned locator | B01-05; foreign-principal negative test |
| Keep Storage HTTP call inside database transaction | O55 wording | Adapt | Finish authorization within transaction, then release connection before network I/O; full attachment/revocation semantics are BE-05 | B01-05; documented limitation |
| Stream every production attachment through Rails now | F51 suggested path | Defer | BE-01 proves internal fixture access only; public streaming/quarantine belongs to BE-05 | B01-05; no new business endpoint |
| Disable signup and external providers/hooks; administrative seeds only | O55/F51 | Accept | Real invitations/recovery captured without public provisioning path | B01-06; A03 |
| Verify full Auth signature/issuer/audience/expiry/session in BE-01 | F51 | Adapt to scope | Prove real token issuance/claims shape now; complete runtime verifier/current-session/revocation is BE-02 before protected routes | B01-04/06; A03 and explicit no protected route |
| Treat JWT decoding as proof of current session | All reject; audit broad checklist | Reject | No runtime auth completion claim from BE-01 smoke | B01-04; BE-02 dependency |
| Prefer asymmetric signing over broad shared signing secret | F51 risk | Defer selection to BE-02 | Inspect actual pinned Auth algorithm/key behavior first; never expose local signing/service secrets | B01-02/06; evidence for next task |
| Outbound hold outside restored DB from day one | F51/F5 | Accept | Restore cannot activate future worker; no release path here | B01-06; A13 |
| Restore test must modify a business hold/lease row now | F51 scenario implication | Adapt | Test config independence and DB restoration without inventing future dispatch tables | B01-06; A13 |
| Internal runtime network; separate build download network | All | Accept | Enforce egress property beyond endpoint validation | B01-06; A04 |
| Include Auth and Mailpit, not only Rails, in outbound checks | All | Accept | Auth is the actual mail sender; catcher can relay if misconfigured | B01-06; A03/A04 |
| Exact mailpit:1025; reject localhost/host-gateway/provider alternatives | O55/F51; F5 | Accept | Name allowlist and private topology jointly enforce local-only behavior | B01-06; A02 |
| Explicitly disable Mailpit relay/forward/outbound features and confine listeners | All | Accept | Capture alone is not no-live proof | B01-06; A04 |
| Probe a TEST-NET address to prove blocked egress | O55 example | Adapt | Unroutable targets can fail even with egress. Use isolated external fixture/control plus topology evidence; no real providers | B01-06; A04 |
| Real token issuance and object round-trip in readiness checks | O55 acceptance wording | Adapt | Smoke suite performs side effects; readiness uses safe live dependency checks | B01-07; A01/A03/A10/A13 |

## Tooling, evidence and completion recommendations

| Recommendation | Source | Disposition | Reason / conflict | Decision / required evidence |
| --- | --- | --- | --- | --- |
| LF scripts, named data volumes, same Compose logic from Windows/Linux | O55 | Accept | Avoid NTFS/line-ending execution differences and duplicated logic | B01-07; A15 |
| Baseline idle memory/CPU/disk instead of full-stack sizing assumption | F51 | Accept | Reduced service graph needs actual measurement | B01-07; A15 |
| Repeat seed/bootstrap preserves IDs/counts/credential hashes | O55/F51; F5 seed detail | Accept | Detect destructive convenience resets | B01-07; A11 |
| Stop/up preserves Auth, database and Storage content | All | Accept | Proves durable services and non-destructive lifecycle | B01-07; A11/A16 |
| Practical type boundaries, not exhaustive framework annotations | O55/F51 | Adapt | Check every owned boundary and explain framework seams; neither empty targets nor unconstrained handwritten modules pass | B01-07; A14 |
| Stable safe error envelope with request ID; no C++/UI motion work | O55 | Accept | Minimal contract matches foundation scope | B01-01/07; A14 |
| All application checks in Docker and evidence at actual reviewed commit | All | Accept | No proposed tests reported as passed; host only invokes wrappers | Dispatch A01–A16 and review gate |
| Full code coverage by small adversarial slices and deep design review | All/shared requirement | Accept | PR size does not waive coverage; formatting delegated to tools | B01-08; code-reviews.md after implementation |
| Do not call analytical scenarios an Obsidian connection simulation | Capability limitation | Accept | No actual Obsidian tool/connection found | Tradeoff scenarios; record pending requirement honestly |
| Cleanup task-owned disposable storage, preserve persistent data | All/shared requirement | Accept | No broad pruning or database deletion to reclaim space | B01-07; A16 |

## Dissent, limitations and coordinator follow-through

Fable 5's split-task recommendation remains the main scope dissent. Retain the two internal checkpoints and stop on exhausted credit; the decision is not a promise the whole task fits the available credit. Fable 5.1's four-service hypothesis loses to the dependency audit. Its early runtime JWT-verifier proposal loses to the explicit BE-01/BE-02 boundary. The narrow Storage service credential adapts the initial blanket service-role wording; it does not permit application DB bypass.

Post-packet operational evidence is coordinator-provided: explicit user approval for existing $10 Devin credit only, no purchases/top-ups, actual MCP sleep verified, and missing Free-plan dollar telemetry. These facts permit the bounded handoff without claiming a hard per-session dollar cap. The coordinator must still record implementation base, task/session deduplication, write scope, Codex state/usage polling every two minutes and stop/reconciliation behavior. No consultation model independently verified those later facts.

Update the shared architecture/contracts and task status with B01-01–08, especially the hidden schema, Storage exception, transaction-local convention, five-service graph and deferred runtime Auth. Preserve the frozen initial decisions/draft and this consultation input; record new decisions in the current shared documents/ADR. Do not replace original opinions or relabel their assumptions as current verification.

Independent work may prepare FE-01 against explicit contracts, inspect existing first-party UI reuse and assemble its fresh consultation packet. Actual BE-02/FE-01 implementation, native work or materially changed BE-01 assumptions still need their own three successful exact-model opinions and Astra synthesis. All A01–A16 application checks, final code review and merge remain pending.
