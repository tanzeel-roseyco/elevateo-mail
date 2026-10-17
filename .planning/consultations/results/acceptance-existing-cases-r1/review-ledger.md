# ACCEPTANCE-EXISTING-CASES-R1 review ledger

Date: 2026-10-14 Australia/Sydney. Task `task_d1da752a40c7`, dispatch `ctx_6a0cdf9e4b2f`. Design review complete; implementation and all proposed runtime checks remain NOT_RUN.

<!-- AIDEV-NOTE: Count unique inspected source once; prior findings below are reconfirmed, not newly discovered defects. -->

This is the task-local review record. The coordinator owns consolidation into root `code-reviews.md`; this worker was explicitly limited to new consultation artifacts and the [implementation brief](../../../../docs/completion/acceptance-existing-cases-design.md). No source fixes, application tests or commits were made here.

## Coverage and counting

Three fresh independent reviewers received the full user rubric, common actual-content packet, source pins and explicit source limits, with tools disabled. Exact identities and successful outcomes are recorded in [metadata.json](metadata.json): Fable 5, Opus 5.5 and Fable 5.1. Actual GPT-6 Astra MAX made the final dispositions in [synthesis.md](synthesis.md). Opus was assigned the dedicated deep-design role; it examined correlation, isolation, state epochs, generation monotonicity and the limits of negative evidence. No Obsidian connection or executed tradeoff simulation was available; the brief contains analytical traces only.

| Pass | Exact source scope | Physical lines |
| --- | --- | ---: |
| A | unavailable.e2e.ts (22), cases.ts (23), draft.e2e.ts (46), support.ts (53), seed-contract.json (22) | 166 |
| B | Backend ops/tests/be02/acceptance_seed.rb | 181 |
| Unique inspected total | Source bytes pinned in source-manifest.json; no extra dependency inspection | 347 |

Each pass is at most 200 lines and the combined packet is under 400. Repeated readings by three reviewers do not triple the denominator. Documents and opinions are excluded from source LOC. Every dependency outside those six files remains uninspected, including FE/session/gateway code, Rails routes/controllers, seed runtime/support, migrations, schemas/config/reporting, existing boundary checks and Playwright configuration. Source-file existence or hashes do not imply code review.

Final provenance troubleshooting inspected five additional task-local launcher lines, not application dependencies or opinion inputs: 352 total source/control lines remain within the ceiling. [Integrity notes](integrity-notes.md) explain that administrative check, late mount-status document drift and the preserved initial integrity report.

**Confirmed findings: 3 reconfirmed prior coverage/blocker defects, 8.65 defects/KLOC (3 / 347 × 1,000). Newly demonstrated production defects: 0; new-production-defect density: 0 / 347.** The preceding acceptance-controls design used a different 294-line scope and counted these same three findings (10.20/KLOC); these are not three additional defects. Conditional risks, missing runtime evidence and improvement suggestions are not silently counted as confirmed product failures.

## Reconfirmed findings

| ID | Severity / affected source | Evidence and consequence | Disposition |
| --- | --- | --- | --- |
| EXISTING-COVERAGE-1 | Medium; unavailable.e2e.ts, DRAFT-003-F2 reason | The reason describes expired operation detail; the matrix calls for recorded conflict or an unrelated-operation lookup response. The wrong stimulus can direct a later author to the wrong case. | Correct the reason only; retain NOT_RUN pending independent outcome/recovery evidence. Do not add an expiry or uncertain-save test. |
| EXISTING-COVERAGE-2 | Medium; unavailable.e2e.ts, READ-001-F2 reason | The reason names only malformed responses, but the matrix also permits revoked membership. A malformed-only blocker obscures an alternative without establishing that revocation is safe now. | Name both alternatives and the absent isolated real mutation/restore contract. Retain NOT_RUN and preserve all global malformed/over-budget tests and their actual statuses. |
| EXISTING-COVERAGE-3 | Medium; unavailable.e2e.ts, READ-001-F1 and DRAFT-008-F1 reasons | One grouped inventory error affects two entries: the seed already leaves the revoked actor's org membership active with no mailbox grants, and provides composer and approver with compose rights in the same mailbox plus a composer-owned draft. These fixtures contradict the stated missing-actor explanations. | Author the two genuine scenarios after endpoint/selector preflight; remove each unavailable registration atomically with its real scenario. If authoring is blocked, use the precise verified UI/API blocker, not the false seed claim. Count as the same grouped prior finding. |

The seed establishes fixture intent, not successful live Auth/API/UI behavior. No claim that any candidate passes follows from these findings.

## Opinion finding triage

The opinions retain their original wording, including headings such as “confirmed.” The following dispositions govern; the label inside an opinion is not sufficient evidence by itself.

| Opinion finding(s) | Astra disposition |
| --- | --- |
| Fable 5 D1; Opus F-D; Fable 5.1 F1 | Generic failure redaction loses triage detail, but protects output. Fixed stage diagnostics are useful; arbitrary error/constructor names can contain external data. Shared wrapper/report/schema changes are outside this slice. Assertions recorded before a later failure do not turn an explicitly failed record into a pass. No newly demonstrated defect. |
| Fable 5 D2; Opus F-C | The positive-only response observer cannot resolve an aborted request. Accepted as a constraint for new AUTH cases: correlated requestfailed observation and bounded cleanup are required. Existing inspected callers use positive replies, so no existing abort misuse was demonstrated. The fixed app.test origin matches the frozen private topology; broader origin/TLS support is uninspected and not an authorized refactor. |
| Fable 5 D3; Opus F-A and F-B; Fable 5.1 F3 | Map the actual false seed reasons into EXISTING-COVERAGE-3 above. AUTH availability is not already proven by a seed. Remove a candidate's unavailable entry only when a real authored scenario replaces it, preserving one record per ID. |
| Fable 5 D4 | Autosave might cause the first matching PUT to be the wrong response, but FE autosave behavior was not inspected. Treat as writer preflight/request-correlation risk, not a confirmed current failure. |
| Opus F-E | Skip-to-NOT_RUN mapping is a required writer verification. Reporter code was not inspected; a false pass was not demonstrated. Do not alter the reporter or evidence schema in this slice. |
| Opus F-F; Fable 5.1 F6 | The shared positive draft body does not exercise consumed-state, truncation and ordering partitions. Keep those group-level limits explicit as follow-up coverage work. Existing observed assertion strings already describe concrete save/list/reload checks; this F1 privacy slice neither fixes nor claims those other partitions. No new production defect is established. |
| Opus F-G; Fable 5.1 F4 | The seed refuses used Auth state and creates Auth users outside the domain transaction. On a partial failure root must discard/quarantine its owned disposable fixture, not retry the seed in place. This matters for isolation; no newly demonstrated violation of the fresh-fixture contract or authorized seed repair. |
| Fable 5.1 F2 | A nonempty assertions array cannot prove assertions executed. Require real expectations before each new summary. The inspected positive body does execute expectations; no existing false pass was demonstrated. |
| Fable 5.1 F5 | The hash regex is looser than a UUID grammar, but the inspected input comes from UI navigation and no exploit/failure was shown. New case-owned IDs must use the accepted UUID validator; do not broaden this task into an existing-test refactor. |

Every R-number has an explicit accept/adapt/reject-or-defer decision in synthesis: Fable 5 R1–R6, Opus R1–R9, Fable 5.1 R1–R8, 23 recommendations total. In particular, reject cookie capture/reinjection, duplicate unavailable registrations for an alternate partition, optional cross-author PUT probes, fabricated business JSON, accepting any non-2xx as authorization proof and treating client cancellation as delivered-response proof.

## Full rubric and standards checklist

| Review area | Applied check / conclusion | Evidence still required |
| --- | --- | --- |
| Feature purpose and scope | Four candidates match existing matrix alternatives; two blocker-only corrections; exact 26 IDs and all expected evidence sets remain unchanged. No uncertain-save, stale-version or new controls are designed here. | Writer verifies endpoint/selector/config contracts; root runs each genuine stimulus. |
| Null, empty and limits | Revoked actor explicitly covers empty mailboxes. New JSON boundaries must validate shapes; privacy list traversal has cursor/row/page/body limits, repeated-cursor failure and no incomplete-scan pass. | Existing guard compatibility, actual API limits and null/malformed global checks are uninspected and must keep their own evidence status. |
| State and cross-system effects | No shared membership changes; each gate has one terminal outcome and bounded cleanup. Case-owned drafts use distinct nonces; extra contexts close. No generation rewind, reseed of used Auth state or new global mutable helper. | Root verifies repeatability and later cases against the used disposable dataset, then separately owned fresh engine/attempt fixtures. |
| Over-engineering and single responsibility | Four focused specs and, only if needed by both AUTH cases, one small transport helper. No new dependencies, new fixture contract, generic fault framework or shared report refactor. | Changed modules get bounded post-implementation review. |
| Duplication, names and complexity | Reuse compatible existing helpers unchanged; share only proven AUTH gate needs. Fixed terminal outcome/stage names; bounded cursor loop with explicit termination. | Review actual implementation for duplicated state machines, nesting and misleading names. |
| Comments and documentation | Preserve/search AIDEV anchors before edits; explain request correlation, authentic redelivery, cancellation limits and fixture ownership. Root must update README/state/documentation and code-reviews.md in the implementation commit. | No implementation comments or shared state docs were edited by this restricted worker. |
| Testing happy and failure paths | Brief requires genuine positive controls plus selected negatives and meaningful helper regressions for abort, duplicate, timeout, upstream failure, cancellation and cleanup. Output canaries remain unit evidence. | All proposed lint/typecheck/unit/integration/browser checks are NOT_RUN; application checks must run inside root-owned Docker. |
| Inputs, permission and authorization | Use validated real endpoints/responses and actual same-mailbox compose capabilities. Successful approver list/own-draft control prevents a permission failure from passing privacy. No broad non-2xx assertions. | Exact denial shape, query fields, membership bootstrap and existing boundary guards need writer verification. |
| Privacy and output | No login postData, cookies, tokens, storage state or raw errors in output. Forward authentic delayed response unchanged. No live send, provider/account activation or credentials requested. | Existing trace/HAR/video/attachment settings and output redaction checks must be verified before runtime. |
| Performance and failure budgets | Explicit finite hold, wait and negative observation windows; verified client deadline margin; bounded list traversal and response bodies; no repeated DB polling introduced. | Client deadlines and actual cleanup bounds are uninspected; root must measure the real lane. |
| UI and accessibility | Pending/error/retry, signed-out, empty and forbidden views require accessible controls and actual visual verification, not only mocks. | Root/Fable own the real UI evidence; this worker performed no browser or application host test. |
| Formatting and typing | Style/formatting delegated to configured linters; strict typing and no unjustified any required. Models were asked for substantive review, not style findings. | Writer verifies the actual configured commands; no linter success is asserted here. |
| Deep design tradeoffs | Preserve unanimous dissent favoring only empty-mailbox/privacy cases until server barriers exist. Selected browser gates remain permissible only for their narrow real-traffic UI partitions. | No executed simulation/Obsidian evidence exists; analytical traces are explicitly labelled. |

## Completion limits

This review completes the design assignment, not application acceptance. Root's later Auth/RLS concurrency-pass report is separately labelled in the brief and was not independently inspected here; it does not clear the full migration/integration prerequisite. Implementation, Docker checks, actual UI evidence, post-change adversarial review and root consolidation remain outstanding. No task-owned Docker resource was created, so this worker has no Docker cleanup to perform.
