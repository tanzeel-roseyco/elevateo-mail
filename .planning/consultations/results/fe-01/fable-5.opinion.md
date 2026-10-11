# FE-01 independent opinion — claude-fable-5

Runtime confirmation: I am running as `claude-fable-5`, the exact requested model. No substitution blocker. This is read-only advice; no files were edited and no checks were run.

## 1. Verdict

**Support with changes.** The two-phase structure (freeze contract, then fixture checkpoint, then dependency-ordered real integration) is sound and correctly subordinated to Rails authority. Two prerequisite blockers before any implementation dispatch:

- **Blocker A — contract freeze is genuinely incomplete in two places.** The session/capability DTO (BE-02 boundary) and the send-review envelope fetch route are both marked "to resolve" but are load-bearing for the gateway's type system. Fable cannot implement a typed `MailroomGateway` port when the shape of "current actor + capabilities" and "review envelope" is unknown; everything else hangs off those two. Freeze at least those two before dispatch, or explicitly scope checkpoint one to inbox/reader/draft only and exclude send review from the first checkpoint.
- **Blocker B — no pinned Node runtime or reproduced lockfile.** The brief correctly says the audited versions are inspected source, not a reproduced installation, and forbids inventing a pin. That means dependency resolution, advisory review and the Node container pin are a coordinator task that must complete before the F09 Docker checks are even definable. Record it as a named pre-dispatch gate, not an implied step.

Everything else below is improvement, not prerequisite.

## 2. Recommendations with rationale

**Settle 409 + `draft_conflict` body, not 412/If-Match.** The brief leaves 409-vs-412 open. Recommend the proposed canonical-JSON `expected_version` with HTTP 409 and a stable machine-readable `draft_conflict` code. Rationale: one versioning mechanism across drafts and send (`expected_version` appears again in the send command in `docs/contracts-and-reliability.md`), no ETag plumbing in the HTTP client, and a structured error body the UI can branch on without status-code overloading (409 is also the duplicate-idempotency-key conflict in the send contract — the stable `code` field disambiguates, which bare status codes cannot). Affected contract: draft PATCH and send submission. This also matches the existing error convention `{code, message, request_id}` accepted in B01-07.

**Make the review envelope a separate endpoint, not the draft read.** The exact-send review must show the *server-authorized sender* and attachment identities at one saved revision — data the draft read contract doesn't naturally own (sender identity is derived from the mailbox per the reliability doc, not stored on the draft). A dedicated `GET /v1/drafts/:id/review?version=N` (or equivalent) lets the backend return the frozen, authorization-checked envelope and refuse when capability is absent, instead of the UI assembling the envelope from draft fields and inferring the sender. That assembly path is exactly how a UI ends up displaying something other than what the server will send. Affected contract: send-review boundary with BE-03. Evidence gap: BE-03 hasn't designed the snapshot yet, so this can be frozen as a route shape with the DTO marked pending.

**Lost-submission reconciliation needs one concrete rule now.** The brief rightly forbids inventing a new send request, but the gateway needs an implementable procedure: on timeout/5xx after `POST /v1/drafts/:id/send`, re-submit the *identical* `client_request_id` (the contract already defines duplicate-key-same-payload as returning the same job), and if that also fails, fall back to a draft-status read showing whether the intent was consumed. That requires the draft read DTO to expose consumption state ("this draft has a send job: id X"). Freeze that field with BE-02/03; without it the UI has no non-heuristic recovery path and F05's lost-response check is untestable.

**Task ordering is right; one sequencing fix.** Extracting presentation primitives and the shell before BE-02 lands is genuinely parallel-safe, since the audit pins exact blobs. But put the *fixture adapter conformance tests* (same test suite run against both fixture and HTTP adapters, per F09) in checkpoint one, not integration time. If the fixture adapter is built without the shared conformance suite, fixture drift from the frozen schema is discovered only at BE-02 integration — the exact failure mode the AIDEV-NOTE warns about.

**Devin/Fable implementability from the brief.** The brief is implementable for checkpoint one *except* the two blockers above and one ambiguity: "Prefer the smallest existing React state arrangement" plus "URL state is not duplicated as an independent source of navigation truth" doesn't say whether Zustand (locked 5.0.15 in source) is in or out. Recommend an explicit default: router state + component state + the gateway, Zustand only if a concrete cross-route need is recorded. A 30-minute first checkpoint will otherwise burn time on this decision.

## 3. Strongest objection and simpler alternative

**Objection:** The fixture checkpoint risks becoming a second mock application — the brief itself warns "fixture success never proves real backend integration," yet checkpoint one builds inbox, reader, drafts, *and* all the error/permission/conflict states against synthetic fixtures. The failure scenario: the fixture adapter encodes assumptions (cursor semantics, conflict payload shape, capability flags) that BE-02 contradicts, and FE-01 then carries a rework tax plus a plausible-looking demo that stakeholders read as progress. The old application already demonstrates this hazard — its `connected && sendEnabled` capability assumptions are explicitly flagged in the audit as things that didn't survive contact with a real backend.

**Simpler alternative:** shrink checkpoint one to shell + routing + reader against fixtures for *read-only* surfaces only, and defer draft/conflict presentation until the BE-02 draft contract is frozen (not implemented — frozen). Tradeoff: less parallel progress and the composer arrives later, but the surfaces most likely to diverge (optimistic revisions, conflict recovery) are built once against a settled schema instead of twice. If the coordinator values the parallelism more, the mitigating minimum is the shared conformance suite recommendation above.

## 4. Acceptance checks and residual uncertainty (all proposed, none run)

- **Contract freeze check:** schema revision hash recorded by coordinator; fixture adapter and HTTP adapter pass one shared runtime-validation suite against that hash. Failing this, no integration claim.
- **Conflict path check:** fixture-driven two-editor scenario produces 409/`draft_conflict`, UI preserves the unsaved buffer, displayed saved revision does not advance; repeat against real BE-02 before F04 closes.
- **Context-switch check:** initiate a slow thread fetch, switch mailbox/logout, assert the late response is discarded and no stale detail renders (F02). Needs deliberate fixture latency injection — specify that capability in the fixture adapter now.
- **Reader safety check:** hostile-string fixtures render as inert text in the actual served app with network logging proving zero remote requests (F03).
- **Production-mode check:** with fixtures compiled out or disabled, a failing API request must surface an error, never fixture data — test the production build configuration specifically, since the brief makes this a hard rule.

**Residual uncertainty:** whether locked React 19.3.0/Vite 7.3.6 resolve cleanly in a currently supported Node container (unverified — the audit is source inspection only); whether BE-02's session facade will match the same-origin cookie assumption baked into the extracted httpClient; whether the collaboration/search surfaces (F07) land in FE-01 at all — the brief sensibly allows omission, but the backlog row for FE-01 says "integrate BE-02 through BE-05," so the coordinator should record now that F07 partial completion does not block FE-01 closure, or the task has no reachable end state.

## Top three cross-task recommendations

1. **Freeze the session/capability DTO and review-envelope route (with BE-02/BE-03) before Fable dispatch** — these two shapes gate the typed gateway; everything else can follow fixtures.
2. **Require one shared adapter-conformance test suite from checkpoint one**, run against both fixture and HTTP adapters at the frozen schema hash, so fixture drift is caught before integration.
3. **Record the dependency-resolution gate (Node pin, lock reproduction, advisory/license review) as a named coordinator deliverable with its own evidence**, since the brief forbids the implementer from inventing it and F09 cannot be specified without it.

**Hard contradiction to resolve:** TASK_BACKLOG's FE-01 acceptance ("integrate BE-02 through BE-05, no disconnected mock completion") versus this brief's allowance to defer collaboration/search/attachment surfaces with "explicit recorded scope." Both are reasonable; they cannot both be the closure rule. The coordinator should amend the backlog row or the brief so FE-01's done-condition is unambiguous before implementation starts.

*(~1,250 words. Advice only; no implementation performed or claimed.)*
