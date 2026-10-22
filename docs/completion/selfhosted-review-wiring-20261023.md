# Self-hosted transport wiring bounded adversarial review

Date: 2026-10-23. Task `task_17e23f18c21e`; dispatch `ctx_34246d361ffa`; implementation owner `ctx_6594097677c5`.

Verdict: **0 confirmed actionable defects / 285 unique physical source lines = 0 defects/KLOC**. Packet A: 150 lines, 0 defects, 0/KLOC. Packet B: 135 lines, 0 defects, 0/KLOC. Static bounded review only; this is not whole-feature approval or runtime acceptance. Requested profile/billing identity is not independently verified.

Read AGENTS.md, .planning/STANDARDS.md, current documentation context, and README/state current entries. Followed the full supplied mandatory functional/security/maintainability/testing rubric. No source edits, tests, imports inspected, nested workers, secrets, provider calls, cloud/DNS access, or deployment. Only this report was written. Formatting delegated to existing lint gates.

## Exact coverage

SHA256 values below are whole-file byte hashes captured during review, all matching the supplied manifest. Coverage is restricted to the listed inclusive physical ranges; blank lines and comments count. Disjoint ranges in one file are not treated as permission to inspect intervening lines.

| Packet | File | Inclusive ranges | Physical lines | SHA256 |
| --- | --- | --- | ---: | --- |
| A | `apps/server/bin/inbound-worker` | 28-53 | 26 | `a13dbfab703289d167fefcd7c225780ba478343d10152c08d616b0a7235c2d37` |
| A | `apps/server/bin/send-worker` | 13-45, 55-76 | 55 | `0b97eb712b8991e5f1f69710a1d239f83d171806787f516a64e5ab5145bcf92d` |
| B | `apps/server/lib/elevateo/campaigns/runs.rb` | 36-46 | 11 | `5f5b030419be5f721b20dc4662e9bb58bdae0e1bf87e0f3e40d19def33ba0ff3` |
| B | `apps/server/lib/elevateo/config.rb` | 17-27, 73-91, 101-113 | 43 | `a4028e2e6a775d0afa27d0a93d80674ec256639ebc32e38f4ebee204297ec2b0` |
| A | `apps/server/lib/elevateo/inbound/poll_loop.rb` | 4-17, 42-52 | 25 | `b1a10a6e5fe2d896a23c8558211d006fe95a4c1d1dbbb951ccb18aeb5a4080b3` |
| A | `apps/server/lib/elevateo/inbound/worker_config.rb` | 1-44 | 44 | `52479912864a3f1d40017276598754854ea465d81fffb62369b8a145dc488a60` |
| B | `apps/server/lib/elevateo/mail_credentials/binding.rb` | 13-23 | 11 | `6b6eb901638385de5c121b491cc00f23884af8aa76d48cf32f573ed59dfc643e` |
| B | `apps/server/lib/elevateo/send_api/review.rb` | 38-48, 53-63 | 22 | `a9429d29e19cfb3d4ab00e5ebc8cdf2d4b05bced0c0b872da26c056768a3d1c9` |
| B | `apps/server/lib/elevateo/send_api/service.rb` | 88-98 | 11 | `73b436a970d05c35ff46bf1432b4aa86bd937c968ecd8eba8683679f274d77cc` |
| B | `apps/server/lib/elevateo/send_worker/submission_result.rb` | 9-23, 26-36 | 26 | `d9d573c46ac07fc6bf2f93d4e69a9603d92c9fb84683679c0dd5746323df033f` |
| B | `apps/server/lib/elevateo/sessions.rb` | 12-22 | 11 | `a7244adda6bc787c793efb8f796559ba36139f2ef9c3a1d9f9adf6b86527f1fa` |

## Checklist and findings

- Purpose/provider route: send-worker explicitly selects `mox-smtp-v1` and ProductionMoxTransport with its production profile and private credential bundle. It rejects Mox plus fixture override. Session, campaign and send-review presentation consistently treat Mox as nonsimulated; approval checks expect that same boolean. Accepted `mox-v1:` receipts retain SMTP provenance, without claiming delivery.
- Held defaults/environment validation: outbound mode defaults to held and outbound hold defaults to true. Mode allowlist rejects unknown modes. Mox requires production mode; production validation requires Rails production, private DB hostname, exact activation boolean, role/process mapping, and either held operation or explicit Mox activation. Live send-worker refuses the hold before initializing storage/provider clients. Daily limit syntax bounds values to 1-9999. Validation helpers and production-profile implementation are outside scope.
- Process loop/scheduling: inbound startup constructs a fresh transport per poll under a pooled worker-role connection, and calls PollLoop.run with stop/once inputs. Poll reports suppress identical outcomes for 60 seconds. The SQL scheduling ownership comment and monotonic clock are coherent. **PollLoop.run, most of wait, signal registration, and Drain internals are outside assigned ranges; retry/backoff, shutdown latency, account scheduling and send rescheduling are not verified.** Send-worker dispatches one Drain.run or Executor.run_once, then closes its connection; this alone does not prove continuous scheduling.
- Null/empty/max inputs: Binding explicitly checks UUID string types, integer credential-version bounds and nonempty bounded reference syntax. SubmissionResult checks accepted receipt type/length/prefix and allowed rejected/unknown codes. WorkerConfig rejects missing/unknown IMAP profiles and incompatible runtime modes. Global environment nil handling, absolute-path checks and all request boundary validators outside these slices remain unverified. Receipt-less rejected/unknown results have no provider provenance in simulated?; callers must not use that alone to infer actual transport, but no such misuse is established within the assigned ranges.
- State/coupling/auth: API approval nonsimulation check matches review and campaign state. Worker startup checks configured role and inbound verifies actual session_user; no authorization bypass appears in scope. SQL lease, tenant authorization, consent enforcement, final dispatch fences and database role permissions are excluded and not approved by this report.
- Privacy/error handling: inbound startup/cleanup logs emit fixed event names and simulation flags, not exception messages. Poll logs emit outcome/timing only in scope. WorkerConfig inspect/to_s are redacted. Send logs contain send ID/result and counts, with no explicit credentials. Exceptions in out-of-scope constructors and their top-level handling are unverified; no universal credential-leakage guarantee is claimed.
- Maintainability: selected methods each have a bounded concern; names and AIDEV comments explain role, ownership and transport separation. No actionable duplication, speculative abstraction, deeply nested iteration or excessive responsibility found in these slices. Repeated two-provider membership checks are small and consistent; introducing an abstraction is not warranted by this review alone.
- Performance: no unbounded new loop or repeated hot-path query established in scope. Campaign lead iteration is visible but lead-count validation is excluded. Send connection applies statement and lock timeouts. Actual lock/lease behavior, transport latency and loop pacing need runtime evidence.
- Tests/documentation: manifest lists worker configuration, SMTP transport, production transport and database tests, but their source is outside this assignment and was not inspected. Happy-path plus failure coverage, regression assertions, lint and typecheck are **unverified here**, not absent. Existing standards and transport documentation were read; the inspected SSH transport runtime receipt covers a different boundary and is not evidence for these application changes. Exact-source fleet Docker and affected tests remain coordinator-owned.

## Design boundary and next evidence

Explicit separate fixture/production endpoint and credential namespaces reduce accidental production credential use. Independent activation and runtime hold add two understandable fences. Keeping SQL responsible for durable scheduling avoids a second scheduler authority; its operational correctness cannot be proven from startup wiring. No design change is recommended on this bounded evidence; dedicated broader design review and any Obsidian simulation remain coordinator-owned and were not performed here.

Coordinator and implementation owner were immediately sent the zero-confirmed-defect result and the excluded-loop/runtime limits before report completion. Required next evidence is exact-source fleet Docker verification of production Mox routing, held/activation negative cases, credential redaction on failures, and process scheduling/restart behavior, plus independent review of excluded loop/transport/SQL bodies. No acceptance, live activation or production release authority is inferred.
