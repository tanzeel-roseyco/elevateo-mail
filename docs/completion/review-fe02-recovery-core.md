# FE02 recovery core adversarial review

Review date: 2026-10-14 (Australia/Sydney). Outcome: review complete; **one medium defect**, requiring repair before this recovery behavior can be accepted. This is static review evidence, not a runtime or release approval.

## Assignment and execution identity

- Task: `task_bc1cc8f2713a`; dispatch: `ctx_bce720f8d81d`.
- Worker: `term_f9b989fc-404b-46f4-9a34-bf83e28fdc11`.
- Requested identity/effort: GPT-6-Astra MAX.
- Actual observable execution: Orca reports `agentIdentity: codex`; the worker terminal preview identifies `GPT-6-Astra max`. These are runtime-visible identity and effort evidence, not an independent attestation of provider routing.
- Scope: adversarial review only, using the supplied full review rubric. No source edits, new agents, commits, host tests, Docker/SSH operations, or application mutations were performed. This report is the only file created.

## Frozen source and coverage

Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion/ops/local/fe02-recovery-mv5yv7i5-stage/payload`.

| File relative to source root | SHA-256, matching supplied pin | Reviewed physical lines |
| --- | --- | ---: |
| `apps/web/src/domain/draftOperation.ts` | `f1ffa6e3710f0d8bfbb67f62f1cb61a5e9b5f3312651c9233145bbd37e622b49` | 234 |
| `apps/web/src/app/draftIntent.tsx` | `1e4f5639eb1b990918b8013002aeaaf6851f21c31c151a5757dc0b24e609769f` | 81 |
| `apps/web/src/app/App.tsx` | `575587a133d457cfc6bdcade7619e24584231f4579f953dedbeaa2eec5d04506` | 39 |

| Pass | Exact source ranges | Physical lines |
| --- | --- | ---: |
| 1 | `draftOperation.ts:1-195` | 195 |
| 2 | `draftOperation.ts:196-234`; `draftIntent.tsx:1-81`; `App.tsx:1-39` | 159 |
| Total, deduplicated | No overlap; no other implementation or test source reviewed | **354** |

Each pass stays below 200 lines. Counts include comments, imports, and blank lines. One distinct defect over 354 reviewed physical lines gives **2.82 defects per 1,000 lines** (`1 / 354 * 1000`). Its guard and state-transition locations describe one defect, not two.

## Finding CORE-01 — Applied lookup receipts can acknowledge a non-advancing version

**Severity: Medium (P2). Evidence: static, with coordinator-supplied boundary context.**

Locations: `apps/web/src/domain/draftOperation.ts:132-136` (`receiptBinding`) and `:198-203` (the applied branch of `reconcile`). Related existing protection: `:122-125` (`resultBinding`).

`receiptBinding` checks operation identity, mailbox, draft, and expected version, but does not require an applied receipt's saved version to advance beyond that expected version. After this check, `reconcile` accepts `operation.version`, treats the original attempted content as saved, and returns to idle. The direct save-result path already rejects `result.version <= attempt.payload.expected_version`; the lookup recovery path lacks the equivalent protection.

This is reachable through the declared transport boundary: coordinator message `msg_491b75cb655c` states that `DraftOperationAppliedSchema` validates `version` and `expected_version` integer ranges independently and has no advancement check. That schema implementation was **not** read by this reviewer. The supplied contract requires a fresh successful save to advance its version; therefore a matching identity alone does not make such a receipt semantically valid.

### Failure schedule

1. The client has saved version 7, edits content to P, and starts operation A with `expected_version: 7`.
2. The write response is lost; the client retains A and its original payload as uncertain.
3. Lookup returns an otherwise valid `applied` receipt for A and the same mailbox, draft, and expected version, but reports `version: 7` (or 6).
4. `receiptBinding` accepts it. `reconcile` becomes idle, sets the saved version to 7 (or regresses it to 6), and records P as saved without evidence of a valid advancement.
5. If the editor still contains P, it now appears clean; if the user has typed newer content, subsequent work starts from the invalid acknowledged base. In both cases the unresolved operation has been incorrectly discharged.

The demonstrated defect is client acceptance of a semantically invalid response. This review does not claim that a conforming backend generates that receipt, that an attacker can forge it, or that backend data corruption was observed.

### Smallest recommended repair

Extend `receiptBinding` so an `applied` receipt with `operation.version <= attempt.payload.expected_version` is a mismatch. Preserve the existing mismatch path, original operation identity and payload, and uncertain state. This mirrors the existing direct-result rule without adding a new abstraction or changing the retention model. Keep the nearby receipt-validation comment aligned with the new condition.

Compare against the original attempt's expected version, not a later draft read: a valid receipt for A may precede a newer operation B. No deep architectural change or Obsidian tradeoff simulation is proposed by this review.

### Regression expectation

- From an uncertain attempt at expected version 7, matching applied receipts reporting versions 7 and 6 must leave the attempt unresolved, preserve the prior saved version/content and editable content, and retain A for replay.
- A valid matching receipt reporting version 8 must resolve A and acknowledge its original content; any later edits must remain dirty.
- Replay after a rejected receipt must still use A and its original payload, without generating a fresh operation ID.
- Retain the existing direct-result advancement rejection and wrong-identity/expected-version cases. Use otherwise schema-valid receipts so tests reach this semantic check.

These are required regression expectations, **NOT_RUN** by this worker. Test implementation and completeness belong to the separately assigned test reviewers.

## Covered checklist and static conclusions

| Area | Reviewed conclusion | Limit |
| --- | --- | --- |
| State transitions and duplicate actions | Examined all branches in the assigned domain module, including idle, saving, uncertain, rejected, conflict, and unusable handling. No second concrete defect established. | No runtime execution. |
| Replay identity and frozen intent | Uncertain replay retains the original attempt and payload; the replay path does not create a new operation ID. New editable content is separate from attempted/saved content. | Payload mutation by unreviewed consumers is not assessed. |
| Invalid newer edits | Domain replay selection is independent of the current editable text and reuses the original attempted body. | Editor validation order and submit wiring are outside scope. |
| Refused replay versus fresh refusal | Replay refusals retain uncertainty and original intent; fresh refusal can become rejected. | Error classification and transport parsing outside these files are unreviewed. |
| Response authority and version binding | Operation, mailbox, draft, and expected-version matching are represented; direct results enforce advancement. | Applied lookup advancement fails in CORE-01; external validators are coordinator context only. |
| Concurrent edits and stale completions | Successful acknowledgement records attempted content while preserving current editable content; completion handling checks the operation identity/status. | Page-level request tokens, navigation races, and callback ordering are unreviewed. |
| Route lifetime | `App.tsx` places the intent provider above routed screens, and the provider retains its map across route unmounts as written. | Actual navigation and editor reattachment were not exercised. |
| Owner separation | The retention key includes actor, organization, mailbox, and draft. The provider has explicit clearing logic for sign-out, unauthenticated/no-organization states, and ready-principal changes. Updates do not recreate a missing cleared entry. | The editor's current-authorized-read gate, passive-effect timing, and stale callback callers require separate review/runtime evidence. |
| Temporary authentication recovery | Retention distinguishes temporary recovery states from explicit identity loss. | Correct status production by the imported auth provider is not established here. |
| Empty/null content and limits | The content-copying/equality logic accommodates empty recipient lists and declared nullable fields without a demonstrated defect. The module uses typed internal values. | Whole-payload null rejection, UUID validation, recipient/text maxima, and malformed network inputs depend on unreviewed boundaries. |
| Complexity and performance | No database queries or new dependencies in the assigned source; recipient copying/comparison is linear in the recipient list. No concrete bottleneck established. | No performance measurement or retention-capacity requirement was available. |
| Naming, comments, cohesion | Reviewed functional intent, comments, shared binding logic, and provider/domain responsibilities. The proposed fix is local. | Linters own formatting/style; no formatting findings counted. |

## Standards conformance and unchecked evidence

- **Conforms within inspected source:** explicit TypeScript types, deliberate failure when the required intent context is missing, distinct domain/retention/router responsibilities, and no embedded credentials or live-mail transport. Existing comments explain intent and cross-file lifetime concerns; no anchors or comments were modified.
- **Violation:** CORE-01 misses the required semantic validation of an external applied receipt and can discharge an uncertain operation without valid saved-version advancement.
- **Not established:** repository strict compiler settings, imported schema implementation, backend enforcement, authorization at every consumer, and browser lifecycle correctness. These were not inferred from typed signatures or comments.
- **Tests and execution:** lint, typecheck, unit tests, integration tests, application build, browser E2E, manual UI checks, and fleet-02 checks are all **NOT_RUN by this worker**. No host-test fallback was used. Coordinator owns runtime checks; tests/pages belong to other reviewers.
- **Documentation:** project instructions/standards and relevant completion/contract prose were used as context. The owner repair report documents the seven intended repairs and explicitly marks its execution evidence NOT_RUN; its existence does not prove the new behavior. Its receipt-binding repair description is incomplete until CORE-01 is addressed. Aggregate `code-reviews.md`, state, and README synchronization remain coordinator responsibilities because this assignment authorizes only this report.
- **Unchecked implementation areas:** editor/page consumers, auth provider implementation, request/error client, schemas, backend/ledger/database behavior, tests, native clients, and all other source outside the exact 354 lines. No whole-application acceptance or security proof is claimed.

Context documents include `docs/completion/be02-cd-contract.md` (notably fresh-save advancement and operation lookup semantics), the prior design review, and the source owner's `docs/completion/fe02-cd-recovery-repair.md` in `Elevateo Mail - Fable FE01 R1`. The owner report SHA-256 is `66a1d64cd9838a2d596e378d9a0237068ca0eba6def0ebf7e178e81c83be1fa5`; its test descriptions are owner claims, not independently reviewed test coverage.

Remaining work: repair CORE-01, add the bounded regression coverage, and obtain the separate consumer/authorization review and coordinator-owned runtime evidence before accepting recovery behavior.
