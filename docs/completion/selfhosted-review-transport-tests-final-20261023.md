# Final bounded transport regression review — 2026-10-23

Task `task_b0d294d2bcd5`, dispatch `ctx_9240388b9f88`; implementation owner `ctx_6594097677c5`.
Read-only adversarial source review; only this report was written. No tests, imports, secrets, cloud/DNS access, nested workers or commits.

## Scope and exact identity

Coordinator correction accepted: enrollment is 49 lines, RBS is 30 lines; review includes the entire RBS. Five packets, 383 unique physical lines including blanks/comments; each packet is <=180 lines.

| File | Inclusive packets | LOC | Whole-file SHA256 |
| --- | --- | ---: | --- |
| `apps/server/test/send_worker/production_mox_transport_test.rb` | 1-180; 181-226 | 226 | `c2254bbf3c802677e0f1df5a97729c3b3eddc0b750dd583fe3a124e0fdb8c526` |
| `apps/server/test/send_worker/production_mox_protocol_test.rb` | 1-78 | 78 | `e98040cbba5c9feb4429b821c196d091aaa1642c14cad45d6b231a3fd6c04347` |
| `apps/server/test/administration/verified_enrollment_database_test.rb` | 1-49 | 49 | `61160f036469cdc5441e645bbd460cc5dae743fc4834d18168e83d2d6a1001c2` |
| `apps/server/sig/send_worker/production_mox_transport.rbs` | 1-30 | 30 | `0a73f3056bad61a49e286e812392c74abb6a9938257bfa5c98d1dbae2a3cda81` |

All four hashes matched the transport manifest at inspection. Context: AGENTS.md, .planning/STANDARDS.md, documentation.md, README/state current-state sections, and docs/completion/selfhosted-transport-20261023.md. Imported implementations/helpers and external harness were not inspected.

## Actionable finding

**TESTFINAL01 — LOW: delivery oracle can match a previous submission.** `production_mox_protocol_test.rb:35-57` submits constant subject/body and accepts any fetched message containing `ruby-production-adapter`, starting at UID zero. If this test is rerun against the same private mailbox, an earlier successful message can satisfy line 57 even when the current accepted SMTP submission never reaches IMAP. This is a test correctness defect; it does not establish an application transport defect. Generate a fresh per-test nonce, include it in submitted content, and require that nonce in the retrieved MIME. Validate the oracle with an existing old subject-only message and no current delivery. A separately enforced fresh-mailbox harness reduces exposure, but that invariant is not asserted in this assigned test.

Finding sent immediately to coordinator (`msg_a32a7d4921be`) and owner (`msg_b95087293e9d`). Defects: **1 LOW / 383 LOC = 2.61 defects/KLOC**; protocol packet alone **1 / 78 LOC = 12.82/KLOC**. Overlapping previous reviews are nonadditive.

## Mandatory rubric checklist

- Purpose and assertions: exact envelope, receipt namespace, nonsimulated acceptance, peer/hostname verification and no custom CA file are asserted. No implementation conformance or runtime PASS is inferred.
- Null/empty/max: credential nil/empty/newline/4097-length cases; domain nil/empty/wrong JSON type/malformed/duplicate/121-entry/32769-byte cases; reserved/IP/uppercase/malformed domains and exact multi-domain sender membership are covered. Exact upper-bound acceptance is not established by these packets.
- State coupling and failures: 450/550 both before submission (Held, no messages) and after send_message begins (unknown, no receipt, one call); lost acknowledgment, expired deadlines, cross-account/version/reference bindings and IMAP-only credentials are covered. The single-call fake test does not independently establish durable no-replay behavior across workers/restarts.
- Real protocol: actual default Ruby transport construction, SMTP acceptance, IMAP TLS indication, wrong password and hostname mismatch cases are present. Generic Held alone does not independently prove which network stage failed. Trust injection, DNS routing, network-none and fresh-mailbox isolation require separate harness review/runtime evidence.
- Authorization/RLS: enrollment uses PG.connect with a migrator URL and explicitly asserts session_user=elevateo_migrator on the happy path; missing membership and forged-org API denial have negative assertions. Parent helper/migration are outside scope, so forced-RLS enablement, fixture isolation and real-role properties beyond these assertions remain unverified. Runtime denial checks organization_access stays empty; success checks receipt role/reference.
- Types: RBS separates production profile/transport and types binding, deadline and result. The untyped JSON admission has a reason comment; compatibility with implementation requires the separate source/typecheck gate.
- Maintainability: small fixture helpers, bounded loops and domain-specific names; no actionable duplication, needless abstraction or hot database-query issue found in assigned ranges. Existing AIDEV notes explain test isolation/uncertainty intent. Formatting is delegated to lint.
- Tests/documentation: happy and multiple failure scenarios exist; manifest records holds and runtime limits. TESTFINAL01 limits real-delivery evidence. No secrets are embedded: credential strings are visibly synthetic test values. No added dependencies are proposed.

## Disposition and limits

Source review complete with one LOW test repair recommended; not unconditional acceptance. No application source was read beyond the assigned signature, no tests were run, and historical fleet results were not promoted to verification of this freeze. Central code-reviews.md/state integration, harness trust/isolation validation, exact-current runtime evidence and production activation remain coordinator-owned.
