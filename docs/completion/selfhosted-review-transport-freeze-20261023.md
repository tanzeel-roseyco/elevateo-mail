# Final bounded production transport review — 2026-10-23

Task `task_d46f761ff015`; dispatch `ctx_ddf22b6bbcc0`.

Status: initial packets and superseding MIME-decoding delta reviewed; zero open confirmed defects. Runtime not run.

## Scope and provenance

Read AGENTS.md and .planning/STANDARDS.md, plus README current state and state/documentation context. Review is static and read-only except this assigned report. No source changes, tests, nested workers, secrets, cloud/DNS access or production actions.

| Packet | File | Physical lines | Whole-file SHA256 verified |
| --- | --- | --- | --- |
| 1 | apps/server/lib/elevateo/send_worker/production_mox_profile.rb | 1–56 | 4076990546b1b599616d2f28fbbb935fae4bab7641769bcc134653ff64f5a370 |
| 2 | apps/server/test/send_worker/production_mox_transport_test.rb | 1–180 | c52f734c44a9c30afa32ad2b798a09224e549ee33efd472d037375160c58e8d9 |
| 3 | same test file | 181–226 | same verified hash |
| 4 | apps/server/test/send_worker/production_mox_protocol_test.rb | 1–91 | 9de71a6214198f53c015c0a3fda301303238ebfd576a1c3135634ee341bf3cb9 |
| 5 (supersedes packet 4 matcher) | same protocol test | 1–12 and 46–60 (27 lines total) | 9156ff196a499b8c4e28d2b2c7051e85eaf5309d278643e4db533131d2ce58bf |

373 physical lines initially inspected, plus 27 lines inspected from the superseding version: **400 lines conservatively charged across versions**, including repeated unchanged context, blanks and comments. Final frozen file is coordinator-reported 94 lines, so final artifact footprint is 376 lines; only the superseding ranges above were reread, not the full final file. Every packet is <=200 lines. Packet 4 was read only after the coordinator supplied its freeze; packet 5 followed the last pre-completion inbox redirect. Imports and all other implementation/test source are excluded; migration/enrollment are not rereviewed.

## Findings

Final open actionable defects: **0 (0/KLOC over 400 conservatively charged lines)**. Historical defect: 1 test-oracle defect in the superseded raw matcher, identified by owner/coordinator and missed by this review initially; 2.68/KLOC over the initial 373-line coverage, or 2.50/KLOC over all 400 charged lines. The final decoded matcher corrects it statically; this is not runtime acceptance or approval of imported code.

The final reserved-name filter rejects reserved TLDs, the example.com/net/org domains and their descendants, malformed labels, numeric terminal labels and dotted numeric addresses. The profile enforces bounded JSON/domain cardinality, uniqueness, host membership under an approved domain, and an absolute non-NUL credentials path. Sender-domain authorization remains exact. Regression assertions exercise the reserved-name list and representative malformed, duplicate, oversized and unrelated-domain inputs.

## Mandatory rubric checklist

- Purpose/correctness: reserved-name rejection and exact domain authorization are consistent with the production-only profile boundary in scope.
- Null/empty/max: raw nil, malformed JSON, empty/wrong-shaped lists, duplicates, 121 domains and oversized raw input have negative assertions. Hostname nil/non-string and invalid labels are rejected by source checks. Exact upper-bound success and all malformed element types are not individually asserted here.
- State/coupling: profile duplicates/freezes strings and the domain array; separate production/Mailpit identities have explicit refusal assertions. Imported adapters and state machines were not inspected.
- Simplicity/responsibility/duplication/naming: no actionable issue in the small profile or assigned test helpers; no new abstraction needed for this bounded delta.
- Comments: AIDEV notes explain production isolation, no-network doubles and conservative uncertain-DATA semantics. Formatting/lint delegated to the fleet pipeline.
- Tests: happy-path envelope/TLS/receipt, header/recipient denial, missing/mismatched credentials, pre-DATA TLS/auth failures, uncertain DATA errors/deadlines, identity/version/ref isolation and IMAP-only refusal are represented. Assertions were inspected, not executed; the test titled never-replayed performs one submission and does not independently establish queue replay behavior.
- Documentation: current README accurately states application not live and separate acceptance/activation gates; this report records exact static scope. Full documentation synchronization is outside the assignment.
- Validation/auth/privacy: bounded config parsing, reserved-name filtering and exact sender authorization inspected; tests demand no client creation for bad inputs and cross-identity credentials. Resolver/Bundle/SMTP implementation security cannot be established from imported names alone.
- Performance: input limits bound domain work to 120 entries and raw JSON to 32768 bytes; no database query or unbounded hot-path loop appears in assigned implementation.
- Standards: deliberate ConfigError propagation, immutable profile state, meaningful AIDEV note and boundary regressions align with inspected standards. Type signatures and external runtime conformance are outside the assigned source ranges.

## Limits and remaining work

Protocol packet: SecureRandom.hex(16) generates a fresh submission marker shared by subject/body; negative predicates reject old unmarked mail and a fresh subject with stale body. Real adapter submission asserts accepted, nonsimulated, correctly shaped receipt; verified IMAP TLS/UIDVALIDITY and ensure-close are checked. Wrong-password and certificate-hostname failure tests require Held with no underlying cause.

Superseded matcher defect: the initial raw MIME substring predicate could not reliably match RFC2047/base64 encoded delivery, causing false-negative real delivery proof. The initial review incorrectly characterized raw matching as adequate. Final SHA9156ff adds require "mail" and Mail.read_from_string, compares the decoded subject exactly and searches decoded body for the fresh marker. This directly addresses the reported encoding failure; zero additional confirmed defects in the inspected 27-line successor packet. Actual parsing and delivery still require fleet runtime. No full final-file unchanged-region identity proof beyond the coordinator's delta statement is claimed.

Harness limits: setup skips unless BE02_MOX_PRODUCTION_PROTOCOL=1; runtime receipts must show executed cases rather than only exit zero. Delivery search reads the first 50 messages after UID zero; the dedicated isolated mailbox must stay within that window for a reliable positive proof. The monotonic polling limit is checked after each adapter fetch, so actual adapter I/O timeouts remain an imported implementation dependency. Negative tests prove Held outcomes, not independently observed server-side absence of DATA.

No runtime commands or network calls were run. Coordinator owns fleet Docker test evidence, separate design review, integration and live-release authority. Initial and final findings were sent to coordinator and implementation owner `ctx_6594097677c5`. No design-agent work, Obsidian simulation or central documentation changes were performed in this strictly bounded review assignment.
