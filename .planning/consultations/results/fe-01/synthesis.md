# FE-01 three-model synthesis

Outcome: accept a bounded shell/inbox/plaintext-reader implementation checkpoint under the canonical session/read contract. Do not dispatch draft/send code against partial prose contracts, and do not close full FE-01 with a fixture application. The actionable instructions are in `dispatch-brief.md`; final decisions are in `decisions.md`.

## Gate and provenance

The three successful, independent exact-model runs were `claude-fable-5`, `claude-opus-5-5`, and `claude-fable-5-1`, each observed as canonical model/provider `firstParty`, exit 0, subtype success, is_error false and completed terminal status. All used the same 138523-byte common packet, SHA-256 `fbf683bf40f34fbf654be29cb0d02fa56587064c3d4db626ed9dfae86d7b91e6`; each had a separate single-turn session and retained model-specific prefix. No opinion was an input to another. All ten source bodies/hashes were checked against the immutable packet. Full opinions, input reconstruction, raw-result/status hashes and execution metadata are preserved, not just selected quotations.

Actual synthesis owner is `/root/plan_synthesis`, spawned as `gpt-6-astra` with effort `max` and fork none. The coordinator observed the tool's override confirmation; no opaque execution ID was returned. This is execution evidence rather than a model identity claim. The three runs reported total list cost USD 2.91077765; this is neither billing reconciliation nor a worker budget. No app build, test, visual check or live backend integration was performed by this synthesis.

The subsequently completed frontend runtime audit was not in the opinion packet. `frontend-runtime.snapshot.md` preserves that later evidence, separately hashed in `metadata.json`, including the advisory-driven Vitest replacement and newly researched generator/browser pins. Original packet bytes are unchanged. Root's later operational direction assigns the writer file read/edit tools only and coordinator-owned Docker/source export; it is reflected in the dispatch brief, not retroactively attributed to a consultant.

## Section-specific dispositions

Each row resolves substantive recommendations; grouped recommendations share a disposition and reason. F5 = Fable 5, O55 = Opus 5.5, F51 = Fable 5.1. Later-feature deferral is a scope decision, not rejection of final acceptance. Full opinions retain wording and dissent.

| Section / source | Recommendation | Disposition and reason |
|---|---|---|
| Scope — all; F5 strongest objection | Avoid a second mock application; freeze contracts before coding | **Accept.** Four reads, one canonical schema, common adapter conformance and no production fixture fallback. |
| Scope — F5 | Prefer shell/reader before drafts | **Accept.** Smallest independently reviewable checkpoint; dependency integration remains open. |
| Scope — O55/F51 | Include session/read/draft/send/job skeletons together | **Adapt.** Freeze only complete read contracts. Skeleton mutation types would manufacture agreement where recovery remains unsettled. |
| Scope — F5 | Treat F07 as partial and stop it blocking task closure | **Reject closure reduction.** F07 remains a full FE-01 requirement; only checkpoint acceptance is smaller. |
| Scope — F51 | Fixture results may close F01/F03/F08/F09 | **Adapt.** Read portions of F01/F03 and corresponding checks can pass; whole-product F08/F09 remain pending later surfaces. |
| Contract — all | Canonical machine-readable OpenAPI and one owner | **Accept.** JSON OpenAPI 3.1.1 instead of YAML is an encoding choice, not competing schemas. Coordinator owns subsequent changes. |
| Contract — all | Generated/derived types and fixtures, consistent server/client hash | **Accept.** Pinned openapi-typescript generates paths/components; runtime validation and conformance remain mandatory. It is not an executable generated SDK. |
| Contract — F51 | BE-02 gate may amend the design | **Accept.** Explicit new hash/regeneration rather than freezing a frontend guess over backend review. |
| Session — all | Concrete session/actor/org/capability DTO before UI | **Accept with adaptation.** Session has actor/org/context/version/CSRF; GET mailboxes alone lists capabilities, avoiding duplicate lists. |
| Session — O55 | Per-session CSRF token plus exact Origin | **Accept.** Authenticated bootstrap defined; future login bootstrap remains a separate requirement. |
| Session — F51 | Origin or Sec-Fetch-Site with existing fixed marker | **Reject weaker alternative.** Fixed marker is not a per-session token; metadata headers are additional defenses, not replacements. |
| Session — O55/F51 | Expired/revoked session stable behavior | **Accept with one code.** All authentication failure is 401 unauthenticated; clear mail/cache/request generations. Separate error codes would not change safe UI behavior. |
| Authorization — O55 | 403 mailbox_forbidden | **Adapt to F51.** Absent/inaccessible mailbox/thread returns identical 404 not_available; 409 context_changed is for stale valid context only. |
| Session — O55/F51 | Cache keys include actor/org/session/mailbox; invalidate late results | **Accept.** Authorization version, filters and local request generation are included. Aborting alone cannot prevent late completion. |
| Session — O55 | AuthTransport seam for later native bearer/PKCE | **Adapt.** Keep gateway/transport injectable; do not implement an unused multi-auth framework or native credentials. |
| Read — O55/F51 | Scoped cursors and invalid-cursor reset | **Accept.** One reset preserving filters; repeated failure gives retry, not loops. |
| Read — O55/F51 | Null header fields and separately paged/possibly empty message list | **Accept.** Exact schemas and placeholders; never index the last element without an empty check. |
| Read — O55 | 64 KiB summaries, 2 MiB detail, per-message cap/truncation | **Adapt.** 256 KiB summaries support 50 bounded rows; 2 MiB detail retained. Actual serialized byte cap overrides count and requires a cursor; truncation is visible. |
| Read — all | No HTML/Markdown/unsafe links | **Accept.** Escaped plain text, no autolinks, remote loads or richText reuse. |
| Draft — all | expected_version JSON and 409 draft_conflict | **Accept for later contract.** Coordinator reconciles old 412 prose. No draft endpoint in the first checkpoint. |
| Draft — O55 | Conflict metadata and separate fresh draft read | **Accept design direction.** Keep error bodies bounded and retrieve current authorized content explicitly. |
| Draft — F51 | Full current draft in conflict error | **Reject in favor of bounded metadata.** Prevent large accidental disclosure and avoid coupling generic error handling to sensitive snapshots. |
| Draft — O55 | One in-flight autosave, coalesce later edit, preserve local conflict buffer | **Accept for later implementation.** No silent overwrite, retry of a changed payload or false saved indicator. |
| Draft — O55/F51 | Last mutation/request ID resolves lost save response | **Adapt.** Helpful correlation but insufficient after concurrent later writes. Require durable lookup/idempotency semantics before draft code. Counterexample retained in tradeoffs. |
| Draft — O55 | Server limits rather than copied legacy constants | **Accept direction.** Freeze explicit write limits in the later canonical contract; current read limits are already explicit. |
| Review — F5/F51 | Separate authorized review for a stated draft version | **Accept direction, defer route.** Separates review eligibility/freshness from normal draft editing. A partial route shape is not enough to start code. |
| Review — O55 | Review envelope embedded in normal draft GET | **Reject as preferred design.** It blurs editing reads and approval freshness; exact review DTO still needs backend gate. |
| Send — all | Stable client ID, same intent retry, consumed draft links job | **Accept with bounds.** Same ID/payload under the server contract, current authorization, durable recovery and one consumed intent; no new ID after uncertain outcome. Link alone is not a universal recovery proof. |
| Send — O55 | Persist per-revision request ID in sessionStorage | **Adapt/defer.** A nonsecret operation ID may later be retained if required; never mail/auth data. Cross-device recovery cannot depend on one browser's storage. |
| Send — F51 | Second device with different ID gets consumed conflict and existing job | **Accept behavior direction.** Existing authorized job recovery, not a second send. Exact dedup/conflict responses belong to BE-03's contract. |
| Jobs — O55/F51 | State, approved version, cancellation boundary, delivery facts, bounded polling | **Accept for later checkpoint.** Queue acceptance is not delivered; unknown stays reconciling, late cancellation conflicts trigger refresh. Exact poll/backoff fields remain unimplemented. |
| Attachments — O55/F51 | pending/released/quarantined/rejected states and current-authorized download | **Accept BE-05 requirement.** No guessed content endpoint or attachment action in read checkpoint. |
| Collaboration — O55 | Defer mutation controls in first checkpoint | **Accept.** Do not replace them with fake success controls; preserve final collaboration/search acceptance. |
| Settings — O55 | Session read-only view, appearance/reduced-motion controls | **Adapt.** Read/session identity may display; preserve existing OS reduced-motion support. Settings controls remain later surfaces, not new scope for this checkpoint. |
| State — all | Router/component/gateway first; avoid Zustand without need | **Accept.** Also defer O55's custom useSyncExternalStore until a concrete shared-state requirement exists. |
| Reuse — all | Extract primitives, reject legacy authority/store/composer assumptions | **Accept.** Exact blobs and lock evidence distinguish real paths/symbols from guessed names. |
| Fixtures — O55/F51 | Separate entrypoint and no production fallback | **Accept.** Negative API failure test plus output/import inspection; a sentinel-string search alone is insufficient proof. |
| Conformance — F5 | Test both adapters from first checkpoint | **Accept.** HTTP controlled-transport tests now; real Rails tests separately later. Avoid adapter-specific DTOs. |
| Hosting — F51 | Same-origin reverse proxy required | **Adapt.** Same origin is required; Rails static serving or a fixed local development proxy can satisfy it without another permanent service. |
| Motion/native — O55 | None now; later 120–220ms transforms/opacity, truthful save/status, no C++/Qt/WebGPU | **Accept scope boundary.** Specific timing/motion plan remains FE-02's fresh Opus-owned decision, with reduced-motion/focus/teardown checks. |
| Runtime — all | Verify Node, exact lock, advisories and licenses | **Accept.** Later primary-source audit resolves pins, not executed compatibility/full-tree audit. |
| Tests — all | Delayed context, unsafe content, fixture absence, null/empty/bounds, actual responsive keyboard UI | **Accept.** R1–R7 make the read subset concrete; later conflict/lost-save/lost-approval tests remain required, not falsely run now. |
| Tests — O55 | 50-row INP/long-task baseline | **Accept measurement.** Record actual environment/results; no invented performance pass. |
| Gates — F51 | Verbatim review rubric absent in packet might block review | **Historical concern resolved.** The full rubric is supplied by the user/coordinator; apply it to all review assignments. No claim it was in the original packet. |

## Risks, evidence and next owners

The largest remaining risk is an attractive fixture UI being mistaken for working real mail. The dispatch keeps development labels, production exclusion, shared conformance and explicit unclosed full acceptance. Current authorization still depends on BE-02's real session and RLS work; a frontend context header supplies no permission by itself. Draft recovery remains a deliberate contract gap and cannot be solved by UI optimism. The generated types cover wire shapes; runtime validation and backend execution are separate proofs.

Coordinator actions: commit/freeze these artifacts and schema; record issue/base/session/tool bounds; export exact source; generate `apps/web/src/data/generated/api.d.ts` with pinned tooling in Docker; provide file-edit-only Fable the generated output; own dependency resolution and all checks. Relay session/read contract and later draft/review design directions into the fresh BE-02/03 gates. Reconcile shared 409/412 language and track the partial checkpoint in state/README without closing full FE-01. No shared document is edited by this synthesis owner.

The Obsidian tool/connection remains unavailable in the observed tool catalog. `tradeoff-scenarios.md` is reasoned scenario analysis, not executed Obsidian simulation. No claimed frontend/application acceptance depends on pretending that capability exists.
