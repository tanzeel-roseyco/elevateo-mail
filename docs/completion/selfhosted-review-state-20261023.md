# Bounded production transport state review — 2026-10-23

Task `task_47e12dd8fc2e`; dispatch `ctx_8a3470c82a37`. Static review only; no tests, network, secrets, cloud/DNS access, source edits or nested workers. Read AGENTS.md, .planning/STANDARDS.md and current README/state/documentation context. Used the supplied complete adversarial rubric; formatting is delegated to lint. Actual model billing identity was not independently exposed.

## Exact coverage and hashes

SHA256 values below are actual whole-file hashes, matching the supplied packet manifest. Only the listed physical implementation/test lines were inspected; imported dependencies were not inspected.

| File under apps/server/ | Reviewed physical ranges | LOC | SHA256 |
| --- | --- | ---: | --- |
| lib/elevateo/send_worker/database_store.rb | 15–30, 53–63, 80–90, 113–123, 139–160 | 71 | a9a12d19b350b7524345554b386abfccfa0e4f5ef3cb590989fcdd67358366f0 |
| lib/elevateo/send_worker/mox_smtp_transport.rb | 4–14, 20–30 | 22 | faa1103f542765ad14bfa5d8c113c1a76088803b37d0330f84dfd288f4c7fb34 |
| sig/send_worker/production_mox_transport.rbs | 1–28 | 28 | 7adcc80a3203fbff310bb0fa1f3dc4aec76ecd75bafe031bd4ee1883e8c0698b |
| sig/inbound_runtime.rbs | 2–35 | 34 | 24e335988353e53e5e9336e079f0f8f5e8aa553ea02463c3a52a565724cc0ec4 |
| test/send_worker/production_mox_transport_test.rb | 1–180; 181–192 | 192 | c79c0170c3cfc0900af5f907d30dbb8b8133391283dc25c569e8f4508c7ef8ba |

Packet A: 155 LOC. Packet B: 192 LOC, split into 180/12-line portions. Total unique physical coverage: **347 LOC**, including blanks/comments. Assignment described the full test as 193 lines; actual file contains 192 and matches the manifest hash. No packet exceeds 200 lines; total stays below 400.

## Actionable finding

**STATE-01 — MEDIUM: production SMTP server rejection lacks a regression test.**

Location: `test/send_worker/production_mox_transport_test.rb:17–39,77–187`.

The fake always returns status 250 unless configured to raise. Configured failures in the reviewed tests are IO loss, deadline expiry, TLS failure and authentication failure. The rejection test at 89–97 rejects malformed snapshots before connecting; it cannot catch a regression that treats an explicit SMTP server rejection as accepted or gives it the wrong uncertainty classification. Add representative explicit SMTP 4xx/5xx failure cases at the relevant protocol phases, asserting the intended normalized result, absence of an accepted receipt, and expected DATA/submission count. This is a confirmed test coverage defect, not a claim that the unreviewed production transport currently mishandles those responses.

Defects: **1 MEDIUM**. Overall density: **2.88 defects/KLOC** (1/347*1000). Packet A: 0/155, **0/KLOC**; packet B: 1/192, **5.21/KLOC**. No independently confirmed implementation defect in the assigned fragments.

Finding sent immediately to coordinator (`msg_41aae7ade013`) and implementation owner dispatch `ctx_6594097677c5` (`msg_e5121dc2a803`).

## Rubric checklist and evidence limits

- Purpose and correctness: profile maps distinguish production Mox from local Mox and Resend; simulated checks explicitly enumerate both production profiles. This supports route/state separation in these fragments, not end-to-end routing acceptance.
- Null/empty/max boundaries: due exclusions visibly reject nonarrays, more than 32 entries and invalid IDs. Binding handling requires an exact-key Hash and SMTP protocol. Binding field value validation after line 160 is outside the assignment. Tests include missing binding, wrong type/reference/account/version, empty/malformed/oversized passwords and IMAP-only credentials.
- State integrity and no replay: reconciliation calls a distinct no-evidence database function; actual SQL and worker transitions were not assigned. The test named `test_lost_acknowledgment_is_unknown_and_never_replayed` makes one submit call and proves unknown/no receipt/one captured message only. Durable restart/reclaim/reconcile no-replay remains unverified here and requires the separate database/worker evidence. No exactly-once or durable no-replay claim is made.
- Production binding failures: tests assert Held before client construction for invalid credentials/bindings and before DATA for TLS/auth failures. Private bundle cross-identity cases and SMTP-versus-IMAP separation have meaningful negative assertions. Their dependency implementation and execution remain outside this review.
- Complexity, responsibility, duplication and naming: assigned methods/types are bounded and domain-named. The repeated simulated-profile expression is consistent across these fragments; no necessary extraction or actionable overengineering defect established.
- Comments: visible AIDEV notes explain profile/source binding, test isolation and SQL-owned identity decisions. No stale anchor was changed or removed. The synthetic-only wording at database_store.rb:123 is incomplete context, insufficient by itself to establish a defect.
- Happy path/failures: success verifies production receipt prefix, peer/hostname TLS settings and envelope; uncertain submission verifies no receipt; pre-I/O versus in-DATA deadline cases differ appropriately. Explicit SMTP rejection gap is STATE-01. The fake records send_message invocation before raising, so these are uncertainty classification checks, not proof of real SMTP server acceptance.
- Security/input validation: reviewed tests check header injection, sender mismatch, credential identity/protocol isolation and secret-free Held causes. Full boundary sanitation/authorization cannot be accepted without the unassigned dependencies and SQL.
- Performance: no new loop/query bottleneck identified in visible fragments; query count, locks and transaction boundaries cannot be fully evaluated across omitted ranges.
- Documentation/standards: current docs preserve fleet-only execution and no deployment authority. This review follows standards on ambiguity and evidence scope; it does not establish complete feature documentation or runtime/typecheck conformance.
- Design tradeoff: separate local and production profile identifiers reduce accidental route conflation; withholding observational evidence when unavailable favors uncertainty over fabricated success. Actual durable no-replay design remains dependent on unreviewed database/worker code. No Obsidian connection was accessed and no deep design recommendation requiring a simulation is made.

## Disposition

Bounded static review complete with one test coverage defect. Fleet Docker execution, explicit SMTP rejection coverage and independently reviewed durable no-replay evidence remain coordinator/implementation-owner work. No application, transport activation, public release, whole-project approval or passing runtime result is inferred.
