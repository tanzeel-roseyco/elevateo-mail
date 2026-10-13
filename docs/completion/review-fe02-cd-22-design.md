# FE-02 C/D bounded design review: assignment 22-design

<!-- AIDEV-NOTE: Static frozen-slice review only; coordinator integrates findings and owns runtime acceptance. -->

Status: bounded static review complete. **Seven confirmed static defects in 386 unique source lines: 18.13 defects per 1,000 reviewed lines (7 / 386 * 1000).** This is not an app-wide defect count or correctness judgment. Runtime: **NOT_RUN** for all C/D checks; no A/B runtime counts are inherited. The report is this worker's only file write, and there are no implementation edits.

## Scope, provenance and method

- Assignment: `22-design`; task `task_09dba2b3b59f`; dispatch `ctx_1f0009091801`; worker terminal `term_60edc41f-3bc1-4180-ba58-98ef5e48f0f0`.
- Requested model/effort in dispatch metadata: `gpt-6-astra` / `max`. This report does not independently attest provider-side execution telemetry.
- Frozen identity supplied by the coordinator: branch `review/ultra/frontend-reader`, HEAD `284aa71d20015b2b9b6a2f00beec9fa3087efe91`, archive SHA256 `57b2aef6ce02efbc026aa499b43682dddc00b6e6bfdf9c0ab0923c6c3aa42186`, manifest SHA256 `d4f0bd0a21905d273e801646f5b8ab7b67d9b9559f6bf4b120eb8900047c6837`. Source includes dirty A/B+C/D bytes; HEAD alone does not identify the reviewed content. Archive/manifest identity is supplied metadata; the file and pass hashes below were independently checked against assignment.json.
- Frozen root: `ops/local/fe02-cd-stage-561fa71d811e467dad2c81c54ffe4c62/payload`. Only the two assigned, line-numbered pass files were opened for source inspection. Whole-file hashing inspected identity, not additional source content. No original files, other source, diffs or contract JSON were opened.
- Read the supplied prose interface summary, C/D contract, STANDARDS, relevant implementation report and accepted BE02 decisions, omitting fenced source excerpts. Also read the expressly supplied coordinator D05 write-deadline amendment in `.planning/consultations/results/be-02/decisions.md:67-69`; it supersedes historical frozen prose about a literal ten-second write guarantee, without changing reviewed FE bytes.
- Used the version-matched `orca skills get orchestration` worker workflow. No spawned agents, app/host/Docker/SSH tests, commits, purchases, activation or non-Orca messaging.
- Additional interfaces and test assertions below are explicitly attributed to the coordinator's prose-only reply to this worker's ask, received 2026-10-13. They are not extra source inspection or independently reviewed test code.
- Obsidian is unavailable. Every schedule below is **analytical**, not an Obsidian simulation or an executed runtime test.

| Frozen source file | Reviewed inclusive range | Unique physical source lines | Verified whole-file SHA256 |
| --- | --- | ---: | --- |
| `apps/web/src/domain/draftOperation.ts` | 1-172 | 172 | `a0602af1c5908abb3348b499908bb5023ecd7445acdce74aaf8ee738b8972ca6` |
| `apps/web/src/features/drafts/DraftEditorPage.tsx` | 109-219 | 111 | `c85daf6cf91c2bf3ff3c4a1b6b23acb4b0bcd25b6f441a8ad5a8a585b2d574f1` |
| `apps/web/src/features/members/MembersPage.tsx` | 100-143 | 44 | `75d159497269452c5650e7dea829dd08ba73a046bea42726a91978681d1cbd2f` |
| `apps/web/src/app/protectedRequest.ts` | 1-59 | 59 | `f389ff712b5a570c4305e3c42a5cadc444a8f83c396ad0206f4ced35aa318b70` |
| **Total** | No overlap | **386** | All four matched |

| Sequential pass | Ranges | Source lines | Verified pass SHA256 |
| --- | --- | ---: | --- |
| 01 | domain 1-172; editor 109-136 | 200 | `d64b956201f3a7bbec60f8c99bc15675c6615bb6702216e335acb2491fdad1cf` |
| 02 | editor 137-219; members 100-143; protected request 1-59 | 186 | `82c6bf453d4d2cf9e8897e703447fc366d17f56c1176282e886c72fc264ee687` |

All helpers/context source is included in that 386-line denominator. Prose and report lines are excluded. Pass 1 analysis was written to this report before pass 2 was opened; the following checkpoint notes preserve that order, and the final classifications are in the numbered findings.

## Pass 1 recorded before pass 2

Reviewed 200 physical source lines: `apps/web/src/domain/draftOperation.ts:1-172` and `apps/web/src/features/drafts/DraftEditorPage.tsx:109-136`. All four assigned payload file hashes and both pass hashes matched assignment.json before content review. No original source or unassigned source was opened.

- Exact retry is intentionally separate from the current edit buffer: an uncertain operation keeps its payload and ID at domain lines 71-91, and success updates the saved baseline without replacing later edits at lines 98-102. Unknown lookup leaves the attempt intact at lines 137-148.
- Candidate confirmed defect: after a lost reply, a later retry's `not_available` or `request_invalid` result is treated as proof that nothing was saved (lines 115-118), even though authorization/proof rejection occurs before historical ledger lookup. The domain then permits a new ID from rejected status (lines 71-77) or after dismissal (lines 168-171). This loses the unresolved historical attempt; pass 2 will establish the UI reachability.
- Candidate confirmed defect: editor `load()` replaces the entire buffer with loading state (line 110) and subsequently a new server/empty buffer (lines 118, 128). Accepted interface prose establishes context recovery restarts this load and explicitly rejects draft loss as a decision. Safe repair must retain scoped local intent across recovery without reviving old request authority.
- Open interface question: `reconcile()` checks operation ID but not operation mailbox/draft/expected-version binding (lines 137-146). Need gateway prose before treating this as a defect; do not inspect more source.
- Null recipients, empty subject/body and nullable reply fields are representable here; external validation and actual max-bound tests are outside this pass. Payload freezing is shallow but recipient objects are cloned; no in-scope mutation demonstrates a practical aliasing defect.
- Tests are not assigned. The implementation report's test descriptions are not assertion evidence, and its context-change test expectation of reloading server text may codify the data-loss defect.

These were checkpoint hypotheses; the final findings below incorporate pass 2 and the coordinator's interface reply.

## Pass 2 recorded

Reviewed the remaining 186 physical source lines: `DraftEditorPage.tsx:137-219` (83), `MembersPage.tsx:100-143` (44), and `protectedRequest.ts:1-59` (59). Total source inspected is exactly 386 unique lines, with no test source or other implementation helpers inspected. The subsequent prose-only interface reply did not enlarge this source budget.

- The save callback forwards generic current failures into the domain classifier (editor lines 157-158), establishing the rejected-retry path from pass 1. Its stale branch tries to preserve the attempt (151-154), but cannot reconstruct a buffer already replaced by load.
- Candidate defect: save validates the current editable content before selecting the frozen retry payload (143-150). An invalid later edit can block replay of an earlier valid uncertain attempt.
- Candidate defect: conflict recovery equates generic `not_available` with a nonexistent draft (198-204), then drops the operation and rebases to zero or adopts empty content. Authorization-first 404 does not establish existence or outcome.
- Candidate defect: choosing rebase on a draft found consumed unconditionally adopts server content (211-213), discarding the very local edits rebase should retain.
- Possible lifetime gap: lookup and conflict resolution set resolving=true then return on stale before clearing it (173-177, 193-197). Whether context recovery remounts or resets that flag needs prose rather than extra source inspection.
- Membership detects post-write actor authorization change and calls refresh (107-111). Protected requests discard old generations on both success and error (42-50) and abort on unmount (28-34). The unseen refresh/controller contract determines whether this establishes the required synchronous invalidation boundary; do not infer a security defect from response-patching order alone.
- No runtime check, Docker operation, network product operation, implementation edit, agent spawn or commit was performed. The final schedules and findings follow.

## Confirmed static defects

Severity denotes practical impact: high means loss of the user's local work/operation recovery; medium means an incorrect recovery decision, false save evidence or recoverable workflow failure. No backend authorization bypass is claimed. Findings 2 and 4 establish incorrect handling of a contract-supported refusal; they do not assume that every raw revocation immediately returns 404 instead of the contract's higher-priority 409/401.

### 1. High: context recovery destroys the unsaved draft and frozen operation

- **Location:** `apps/web/src/features/drafts/DraftEditorPage.tsx:110`, `:118`, `:128`, `:151-154`; central handoff at `apps/web/src/app/protectedRequest.ts:49`.
- **Trigger/schedule:** edit server version 2 to local text Q; start operation A with frozen Q; receive current `409 context_changed` (or a different protected call triggers recovery while A is unresolved). Central recovery invalidates scope and changes the request/context identity. The editor's load sets state to loading and then constructs a new buffer from version 2 server text. If the protected subtree unmounts, local component state is lost even earlier. If it remains mounted, the explicit replacement loses Q and A. A late stale-save callback cannot recover them because its updater only acts on a ready buffer with the matching in-flight operation.
- **Violated requirement:** contract sections 2/5, BE02-D07, current D05 amendment and the interface clarification require preserving unsaved text plus exact uncertain operation ID/payload/expected version. Context recovery must refresh authority without discarding same-owner intent.
- **Root cause:** recoverable local intent shares the lifetime of protected server-read/component state. `newDraftBuffer` has no old attempt to reconcile.
- **Minimal repair:** hold the current draft buffer, raw recipient edits and frozen attempt in narrowly scoped in-memory ownership above the recovery/unmount boundary. Hide it while recovering; reattach only after the same actor/organization/mailbox/draft is reauthorized, using new request authority. Keep unsent edits separate from refreshed server data, and require explicit adopt/rebase instead of overwriting them. Apply the session-clear policy for identity change/logout; never restore another user's buffer.
- **Needed regression:** exercise a lost save reply and a current context mismatch in both committed-unmount and same-identity batched-recovery schedules. Assert exact local text/raw recipient input and original operation payload/ID survive, only one bootstrap occurs, no automatic new save is sent, stale successes/errors cannot apply, and cross-user/mailbox recovery cannot display the old buffer.
- **Test quality evidence (coordinator prose, not test-source review):** the current context-change test expects Subject to become `Fixture draft`, not `Edited text`, checks at least two session reads and one save, and does not assert recovery of A. It codifies this defect despite its reassuring recovery name.

### 2. Medium: a refused retry is treated as proof that the original uncertain save did not commit

- **Location:** `apps/web/src/domain/draftOperation.ts:115-118`, `:71-77`, `:168-171`; reachable error forwarding at `apps/web/src/features/drafts/DraftEditorPage.tsx:157-158`.
- **Trigger/schedule:** A is committed or still running and its reply is lost; local state is uncertain. Begin exact retry A, transitioning to saving. That retry receives `request_invalid` or `not_available` from current proof/scope checking before ledger replay. The reducer changes A to rejected and says `Nothing was saved`; another Save or dismiss-then-Save generates B. A refusal of this request says nothing about the earlier invocation of A. The 404 case is conditional on receiving a current generic refusal; stale context would be handled as 409 first.
- **Violated requirement:** authorization precedes replay; unknown or inaccessible history never proves unperformed, and D05 explicitly prohibits using missing/inaccessible lookup as permission for replacement identity. A write deadline/refusal cannot establish rollback of an earlier invocation.
- **Root cause:** `saving` loses whether it is a replay of an unresolved attempt, and error classification treats the latest invocation's result as the entire operation's history.
- **Minimal repair:** retain unresolved-operation provenance when entering retry. Refusal may end the current request or disable access, but must retain A and its exact binding/payload as unresolved; show the refusal separately without a false no-save claim. Only explicit new intent after appropriate reconciliation/rebase may allocate another operation. A genuinely first, definitively refused request can still use the ordinary correction flow.
- **Needed regression:** reducer and component sequences for A-lost-reply -> exact retry -> 400 and 404. Assert A is retained, no `Nothing was saved` assertion about A, no automatic/new ordinary-save ID, and later authorized lookup/replay still uses A. Pair with a first-attempt 400 case so the repair does not block legitimate correction.
- **Evidence limit:** the reducer transition and ordinary Save reachability are confirmed statically/prose; no end-to-end occurrence of a particular server proof/refusal schedule was executed. The coordinator confirms rejected state remains editable and its ordinary Save action currently mints a new ID.

### 3. Medium: later invalid edits prevent replay of an earlier valid frozen attempt

- **Location:** `apps/web/src/features/drafts/DraftEditorPage.tsx:144-150`; intended replay selection at `apps/web/src/domain/draftOperation.ts:74-75`.
- **Trigger/schedule:** save valid payload P under A; lose its reply; then edit local Q to a 999-code-point subject or another invalid value. The coordinator confirms uncertain buffers remain editable. Selecting Retry enters `save()`, which validates Q and returns before selecting the still-valid P/A. The exact retry path is therefore unavailable until the user changes unrelated unsaved work.
- **Violated requirement:** A is an immutable payload/ID pair independent of later edits; later local changes must not interfere with exact reconciliation/retry. The current-edit validation is appropriate for a fresh save, not for a frozen retry.
- **Root cause:** validation occurs before deciding which payload will be sent.
- **Minimal repair:** distinguish exact retry from fresh-save creation before current-content validation. Validate the actual frozen retry payload at the existing boundary while retaining Q and its validation errors. Do not normalize or replace P from Q, and keep ordinary invalid fresh saves blocked.
- **Needed regression:** after an uncertain valid A, enter invalid Q and trigger Retry; assert the original ID, payload, recipient nulls/order, binding and expected version are sent unchanged, Q stays visible, and success does not mark Q clean. Also assert an idle invalid draft still sends no request. Lookup alone is not a replacement test for the promised exact retry path.

### 4. Medium: generic unavailability is converted into an empty draft/version-zero recovery

- **Location:** `apps/web/src/features/drafts/DraftEditorPage.tsx:198-204`; related unverified-absence handling at `:115-118`.
- **Trigger/schedule:** with a conflict/unusable operation retained, select recovery; the authorized recovery GET returns generic `not_available`. That response can denote absence, hidden ownership or inaccessible mailbox/compose scope. The handler declares that the draft never existed, then clears the attempt through `rebase(..., 0, empty)` or erases local text through `adoptServerCopy(..., 0, empty)`. The UI has no absence proof. This is the behavior for the supported 404 outcome, not a claim that stale revocation skips 409 priority.
- **Violated requirement:** contract section 2 deliberately makes these conditions indistinguishable; sections 4/5 require current authorization and deliberate rebase from observed server state. Missing/inaccessible evidence is not an operation outcome or a version-zero observation.
- **Root cause:** resource unavailability is collapsed into a single guessed cause and fed into destructive recovery logic.
- **Minimal repair:** keep the buffer/attempt and show unavailable/recovery-blocked on generic 404. Permit a zero-version creation decision only from separately established, currently authorized creation semantics, not from this generic recovery read. An adopt action must successfully obtain the server copy before replacing local text. Revisit the persistent `?new=1` path under the same invariant; it is not counted as another defect here.
- **Needed regression:** conflict/unusable recovery GET -> 404 retains text, operation ID and base version, offers no fictional empty server copy, and emits no follow-up write. Include initial genuinely absent new-draft creation separately, plus current context mismatch and permission loss, without using a mock error label to prove existence.

### 5. Medium: choosing to keep local text on a consumed draft actually discards it

- **Location:** `apps/web/src/features/drafts/DraftEditorPage.tsx:211-213`.
- **Trigger/schedule:** A conflicts because another action consumed the server draft; the user chooses `Keep my text...` / rebase. The recovery read returns consumed content P while the local buffer contains Q. The consumed branch ignores `mode`, adopts P and overwrites Q, then locks the editor.
- **Violated requirement:** the domain's conflict invariant and accepted D07 require the local edit buffer to survive conflict. Consumed is a write prohibition; it is not consent to discard local edits or proof they equal the consumed content.
- **Root cause:** terminal server state and local content disposition are coupled in one unconditional `adoptServerCopy` transition.
- **Minimal repair:** set the consumed/write-disabled condition independently of the local buffer; preserve Q and the unresolved/conflict identity when the user selected keep/rebase. Explain that this draft cannot be saved, without inventing a send or automatic copy/new operation. Only an explicit adopt/discard action should replace Q after a successful read.
- **Needed regression:** consumed recovery after keep-text asserts Q and A remain, editing/saving is disabled, and no new write occurs. A separate deliberate adopt case can assert replacement with P. Include the unusable/expired recovery branch, which also reaches this code.
- **Test quality evidence (coordinator prose):** the existing consumed-rebase test clicks keep-text and checks a consumed badge and disabled Subject, but never asserts retained text or operation identity. Those assertions can pass while Q is lost.

### 6. Medium: a stale lookup/recovery can leave resolving permanently true

- **Location:** `apps/web/src/features/drafts/DraftEditorPage.tsx:171-177`, `:192-197`.
- **Trigger/schedule:** start a lookup or conflict read, setting resolving=true; a current context mismatch moves request scope on, so the awaited outcome is stale; the function returns before clearing the flag. In a same-identity recovery where the intermediate non-ready Shell frame batches away, the editor instance survives and its renewed context triggers load, but resolving remains true. Subsequent lookup and conflict recovery actions return immediately. Even if defect 1 is corrected, reconciliation stays disabled until a remount.
- **Violated requirement:** recoverable context changes must restore a usable workflow while rejecting old continuations; transient request ownership cannot permanently disable future recovery.
- **Root cause:** the boolean is component-lifetime state, yet completion only releases it on a current response. The coordinator confirms load/context changes do not reset it, and that same-identity recovery need not unmount the component.
- **Minimal repair:** make progress state belong to a local request/scope token, release/reset it when that owner is invalidated, and prevent an old completion from clearing a newer owner's busy state. Do not simply apply every stale continuation or use an unguarded finally that can interfere with a later request.
- **Needed regression:** preserve the editor instance through an explicitly batched same-identity context recovery; assert both lookup and conflict recovery become available again, no old value/error applies, and a later request's resolving state is not cleared by an older completion. Also exercise actual unmount to cover that different lifetime.

### 7. Medium: operation reconciliation accepts a receipt with the wrong binding/version

- **Location:** `apps/web/src/domain/draftOperation.ts:138-144`; handoff at `apps/web/src/features/drafts/DraftEditorPage.tsx:182-186`.
- **Trigger/schedule:** A is uncertain for mailbox M/draft D/expected version V. A schema-valid lookup response echoes A's ID but has a different mailbox, draft or expected_version. `reconcile` checks only the operation ID and accepts an applied/conflict receipt, changing the baseline or conflict metadata of D. This is a malformed-response/binding failure, not a claim that a conforming backend normally returns such a receipt.
- **Violated requirement:** operation identity includes immutable actor/org scope and mailbox/draft/payload/expected-version binding; the accepted standards require validation at external boundaries. A receipt for another binding cannot prove A's outcome in this buffer.
- **Root cause:** schema/context validation is mistaken for request-response correlation. The coordinator confirms the HTTP lookup does not compare returned mailbox_id/draft_id/expected_version to the request/attempt; no unseen gateway check closes this gap.
- **Minimal repair:** before applying any outcome, require matching operation, mailbox and draft IDs; for detailed applied/conflict outcomes also require matching expected_version. On violation retain uncertainty and expose a bounded protocol failure rather than silently accepting or endlessly showing success. Preserve the existing session/generation checks; they solve a different ownership problem.
- **Needed regression:** independently alter mailbox_id, draft_id and expected_version in otherwise schema-valid same-ID lookup results. Assert no savedVersion/savedContent/status success change, A remains recoverable, and the error is observable. Keep positive tests for exact applied/conflict/unknown/expired outcomes. This does not require weakening the generic 404 backend policy or exposing payload digests.

## Analytical schedules and design tradeoffs

### Lost save reply, later edits, same-ID replay and another writer

1. At server version 5, capture A = (ID a, mailbox M, draft D, expected_version 5, content P). Send it once.
2. The server may commit A as version 6, while the response is lost or budget/deadline failure is observed. Preserve A. Client timeout or abort is not proof of rollback under the adopted write amendment; COMMIT/cleanup can outlive a nominal ten seconds.
3. The user edits Q while A is uncertain. `edit` keeps A separate from Q. A lookup taken before A commits can return unknown; `reconcile` correctly retains A at domain line 148.
4. Another device can commit B as version 7. Exact retry A must still return A's original version-6 receipt; it must not overwrite B or substitute Q for P. The successful transition at domain line 102 changes the saved baseline to P without replacing Q. It is evidence about A, not proof of today's server version.
5. A deliberate next save of Q based on version 6 must conflict with version 7; a current read plus explicit rebase is required. This optimistic-version cost is preferable to secretly overwriting B or treating equal-looking server content as causal proof of A.
6. Invalid Q currently blocks step 4 (finding 3); a refused retry can erase A's unresolved status (finding 2). An expired lookup makes a unusable, never not-performed. A later deliberate, currently authorized rebase can be new intent under a fresh ID; merely observing expired/unknown/404 must not automatically re-key A.

**Selected tradeoff:** keep one immutable attempt plus a separately editable buffer and explicit reconciliation. The normal exact-retry transition is sound within the inspected code; no second ledger, transport redesign, automatic send or generalized offline sync is needed. Cloning at most 100 recipient entries and comparing bounded draft content is a reasonable cost. No in-scope aliasing mutation proves a separate deep-freeze defect.

### Context recovery with unsaved draft: retention versus destruction

1. Generation g owns current reads; local Q and attempt A belong to a specific actor/org/mailbox/draft, not to g's perpetual authority.
2. A current context mismatch invalidates g before recovery work starts. Old successes and errors must become stale, and no cached protected view should remain authorized by g.
3. Bootstrap re-establishes current identity and capabilities. If the same owner still has compose, restore Q/A under new request context/proof and reconcile explicitly. If bootstrap fails temporarily, retain bounded local intent invisibly without protected server fallback. If ownership changes or the session-clear policy applies, prevent restoration under the other principal. If mailbox/compose access is denied, expose no stale protected view and perform no replay; any quarantined local intent must remain inaccessible to other identities.

| Choice | Consistency/privacy consequence | Practical cost |
| --- | --- | --- |
| Destroy editor state on every refresh | Clears old state simply, but loses Q/A even for unchanged ownership; violates accepted preservation | Low implementation cost, high unrecoverable user cost; finding 1 |
| Leave the old editor visible with old context | Preserves text but conflates local intent with permission and permits stale authority/UI | Rejected; would undermine invalidation |
| Retain scoped local intent separately and reauthorize its presentation/use | Preserves exact retry identity without letting memory grant authority; rejects cross-owner restoration | Small buffer-owner boundary and explicit reset/recovery transitions; recommended |

A narrowly scoped in-memory buffer owner above the recoverable protected subtree is sufficient. Do not add browser persistence, reusable CSRF tokens, cross-tab coordination or a broad cache framework as part of this repair. Preserve raw invalid recipient text as well as parsed content so recovery does not silently normalize the user's work. Findings 5/6 must also be repaired so retained content remains both safe and recoverable.

### Permission revocation before versus after snapshot

- **Revocation committed before snapshot S:** the server observes current authority and applies the specified priority: invalid/revoked session -> 401; valid stale context -> 409; current context but unavailable resource/capability -> generic 404. A request with old authorization_version must not be modeled as necessarily returning 404. The client invalidates on current 401/409 and must not infer existence or past-write outcome from a subsequent generic refusal.
- **Revocation committed after S:** one whole earlier authorized snapshot can remain in flight; that is an accepted consistency boundary, not by itself a frontend defect. A second read in the same repeatable-read transaction cannot prove the newer revocation. This review does not certify protected-read timing; the write-only deadline amendment explicitly leaves read timing outside its acceptance.
- **Client learns of revocation before the old response arrives:** synchronous scope invalidation makes the old success/error stale at protectedRequest lines 45/48. Old responses must not clear a newer session or restore a removed mailbox. Once authority loss is known, retaining an unsaved local draft does not authorize displaying stale server caches or replaying its operation.
- **Write/revocation overlap:** the accepted backend guard order determines whether the write precedes revocation or rechecks after it. This reviewer did not inspect backend code. A denied retry/read is not evidence about a possibly earlier committed write; preserve the exact uncertain operation (findings 2/4).

### Self-membership capability change: rebootstrap versus optimistic authority changes

1. Under g, actor U changes their own explicit membership at roster revision r. Server authorization/last-manager rules apply; a true no-op need not change generation. A successful changing operation returns revision r+1 and the actor's post-write authorization_version.
2. `MembersPage.applyResult` observes a changed authorization_version at lines 107-111 and calls refresh. The inspected code patches roster data, but does not install the returned capability bits as session authority.
3. **Coordinator-provided mechanism summary:** refresh coalesces existing bootstrap/retry; otherwise it synchronously invalidates RequestScope and sets the controller's stateRef to loading before `getSession`. Successful bootstrap advances readEpoch; changed identity replaces the protected subtree with empty mailbox state, and same-identity batched recovery also renews context and re-fetches. This makes old in-flight success/error responses stale; it is not proof that every ordering has been integration-tested.
4. Re-fetch current mailbox/read state with the new authority. A private mailbox may disappear after removal; a shared mailbox can remain readable without an explicit row while compose/manage_members disappear. Removing an explicit row must not be equated with removal of all shared read access.

**Assessment:** no separate confirmed self-membership authority defect is established in these slices plus the supplied interface. The required invalidation appears present; count of `getSession` calls alone is insufficient acceptance. Processing the changed-generation branch before local roster patching is a simple implementation option if this handler is touched, but no unproven transient flash is counted as a defect.

**Tradeoff:** authoritative rebootstrap costs a session read and scoped mailbox reload after an infrequent membership edit, but avoids reconstructing effective shared/private access, other memberships and generation invalidation from one target-row result. Optimistically mutating global capability state from that result would duplicate authority rules and could permit stale reads. Keep server-authoritative rebootstrap, synchronous invalidation and fail-closed errors; do not add a client authorization engine.

## Review checklist and evidence limits

| Area from the required rubric | Evidence / result | Unassessed or remaining evidence |
| --- | --- | --- |
| Feature correctness and user intent | Exact retry separation/unknown preservation are sound in domain lines 61-102/137-148; findings 1-7 identify recovery violations | Full app flows and unrelated C/D features were not inspected |
| State transitions, idempotency, cross-feature impact | Separate scope generation, operation identity and editable intent; explicit schedules above; self-change uses refresh | Backend ledger/locking/Auth implementation, multi-process races and full Shell integration NOT_RUN |
| Null/empty/max inputs | DraftContent permits empty strings/list, nullable address components/reply; beginSave clones recipients without trimming/coercing | Schema implementation and max Unicode/byte/version boundary assertions not assigned; version maximum/consumed handling need runtime validation, not invented success |
| External validation and authority | Protected request captures generation, guards success/error, aborts unmount and removes controllers in finally; no session elevation in reviewed members handler | Finding 7 is missing result-binding validation; schema strictness/CSRF transport/backend permissions are prose interfaces, not independently verified source |
| Errors and uncertainty | Unknown leaves attempt; deliberate conflicts remain explicit | Refusal versus historical outcome and stale busy cleanup fail in findings 2/6; no swallowed exception finding beyond inspected paths |
| Simplicity, cohesion, naming, duplication | Pure draft transitions and shared protected-request hook are appropriately separated; no justified new framework/service | Consolidate similar editor recovery decisions only enough to maintain invariants; formatting/style delegated to lint |
| Comments and maintainability | Domain invariants and unmount anchor explain intent | The claims that 404 means never existed, rejected means nothing saved, and stale callback preserves the buffer are contradicted by findings 1/2/4; update these comments with repairs, preserving AIDEV intent |
| Tests: happy/failure assertions and false passes | Coordinator assertion summary identifies context test that blesses data loss and consumed test that omits its promised invariant | No test source reviewed; no coverage percentage/count inferred. All requested regressions need bounded test review and Docker execution |
| Documentation and standards conformance | Implementation report discloses NOT_RUN and context loss; accepted prose explicitly does not authorize draft loss; stricter current amendment used | Reconcile repaired behavior and authored test claims with relevant implementation docs/README/state in owner commits |
| Performance and limits | No backend loops/queries in assignment; recipient copies and roster update/sort are straightforward; controller cleanup prevents completed-request retention | Aggregate paging limits, load measurements and retention capacity are unassessed; no speculative performance defect asserted |
| Accessibility, loading/error/empty states | Loading replacement and stale busy liveness inspected | JSX, keyboard/a11y, actual layouts and visual QA not assigned; actual UI validation remains a gate |
| Generated consumer contract | Manual generated api.d.ts review exempt by dispatch | Validator must regenerate and byte-check through Docker check:api; no generated-code correctness claim |

### Required test/control quality before acceptance

- Replace the context-recovery success oracle that expects old server text with one asserting preservation of local edits and A, plus negative assertions against automatic resend and cross-owner restoration.
- Strengthen consumed-rebase tests to assert content and attempt identity, not only a disabled control and badge.
- The coordinator says the self-membership test mounts SessionProvider + MemoryRouter + MembersPage without Shell/MailboxesProvider. Its at-least-two session reads, fixture generation/flag rotation, unchecked checkbox and revision label do not prove mailbox refetch or old-response rejection. Add a full-shell case with deterministic delayed old success **and error**, verify scope invalidates before bootstrap returns, fresh mailbox capabilities govern the UI, and revoked private-mailbox data disappears. Test shared-mailbox row removal separately.
- The coordinator says an expiry test expects a distinct ID after `Start a new save...`. That is not intrinsically defective if the action establishes deliberate new intent from a successful current read. Assert no automatic replacement on expired alone, preserve unsaved content, and explicitly cover 404/503/consumed recovery without a fabricated new base.
- For binding tests, use schema-valid but semantically mismatched receipts so the test reaches reconciliation rather than merely failing schema parsing. For retry tests, assert exact call payload and number of allocated IDs, not just toast text or a final version label.
- Docker lint, strict typecheck, unit/integration/contract checks, actual application/UI verification and byte-regeneration check remain **NOT_RUN validation gates**, not application defects. No historical A/B counts establish C/D acceptance.

## Questions, assumptions and coordinator deduplication

- No additional source was requested or opened after the 386-line budget. Full response schemas, boundary parsers, JSX, session controller, Shell, mailbox provider, test code and backend internals are unassessed implementations; any claims about them above are explicitly supplied prose interfaces.
- Findings 2/4 are about refusing to turn ambiguous/unavailable evidence into negative proof. Backend error-priority conformance is assumed from the accepted contract; this report does not allege a backend failure or claim that a stale-context revocation directly returns 404.
- Finding 7 is a defensive response-correlation defect. A conforming backend should not emit the mismatched receipt; no exploit against a conforming backend or cross-user disclosure has been demonstrated.
- No additional defect is counted for shallow Object.freeze: the inspected code clones recipient objects and does not show a mutation of those clones. No additional defect is counted solely for explicit Save versus autosave; that product-scope/documentation question belongs to the coordinator rather than expanding this assignment.
- Potential related findings for deduplication: editor/data-loss reviewers may cover findings 1 and 5; domain/error-policy reviewers may cover findings 2/7; generic-404 and new-draft route reviewers may cover finding 4; state-lifetime reviewers may cover finding 6; controls/tests reviewers may cover finding 3 and the false-pass oracles. Findings 2/4 share an invalid inference from refusal but occur in different transitions and require different regressions; the coordinator should decide whether to group them in the global index.
- Final bounded accounting: **7 confirmed static defects / 386 reviewed unique source lines * 1000 = 18.134715..., reported as 18.13 defects per 1,000 lines.** Questions, missing runtime, supplied-interface limitations and test coverage gaps are excluded from the numerator. No implementation repairs were made; the coordinator owns integration into code-reviews.md, repair assignment and runtime acceptance.
