# BE03 consultation: reviewed intent and fenced dispatch

Status: independent preparation while BE02 is implemented under review. BE02 Docker evidence is not accepted; only the root coordinator can accept that dependency and open BE03 implementation. This brief authorizes design consultation only, not application changes, tests or live sending.

<!-- AIDEV-NOTE: The frozen packet records mutable BE02 bytes; its baseline is not a claim that BE02 is accepted. -->

## Assignment and identity

Task `task_f025f796addb`, dispatch `ctx_ff66dd4e3d03`, run `run_5cc7ae2ab900`. Actual synthesis runner is the supervised `gpt-6-astra` at `max` effort, verified through Orca worker metadata. Request exactly three fresh independent Claude CLI sessions: `claude-fable-5`, `claude-opus-5-5`, `claude-fable-5-1`. Record returned identity, session, process exit and hashes separately from the requested labels. No substitution, prior opinion reuse, cross-opinion sharing or extra consultation round without invalidated input.

Use installed CLI help/version preflight, the already authorized account and supported safe-mode print, disabled tools, JSON output and no session persistence. Raw prompts and logs remain in ignored `ops/local/be03-*` files; only sanitized outputs/provenance are durable project artifacts. The common packet contains actual frozen source excerpts with full-file and excerpt hashes. Each opinion gets the identical common packet and its own declared focus.

## Questions for every independent opinion

1. Specify the smallest transaction that turns an authenticated human's approval of an exact draft version into one immutable snapshot, one intent, one durable job and one approval audit event. Different approval keys for the same draft/version must converge; a consumed draft cannot send another version. Reuse BE02 ownership, operation ledger and context/session/generation boundaries without changing frozen C/D semantics.
2. Define additive, versioned review/approval/status/cancellation contracts, exact database keys/checks and an upgrade/rollback lane after BE02. Explain how a human sees the payload they approve, including sender, recipients, plaintext, reply identity, purpose, consent/suppression and absent attachments. Distinguish unsent-draft validation from send-readiness validation. Do not allow model output or a mailbox connector grant to impersonate human approval.
3. Define queue claims using SKIP LOCKED, leases, monotonic fencing generations, bounded retries and a dispatch authorization boundary ordered against cancellation, suppression and revocation. Specify transaction isolation and lock ordering compatible with BE02. No database transaction may span network I/O.
4. Persist stable `elevateo_send_id` and first-possible-attempt time before any possible submission. Show each crash window, unknown outcome, stale worker write and late authenticated observation. Stale observations must reach a fresh reconciler without giving a stale worker projection authority. Explain what a DB fence cannot prevent in the external world.
5. No fresh submission after an uncertain retry horizon expires; never fix uncertainty by rotating the key, rebuilding a payload, resetting time, cloning automatically or resetting dispatching rows on startup. Define a conservative provider-policy seam with explicit evidence gaps. Provider acceptance is not delivery. External acceptance records and outbound restore hold must survive app backup rollback.
6. Return concrete implementation slices, file ownership/dependencies, schema/SQL invariants, adversarial concurrency/crash tests and a Docker acceptance matrix. Proposed tests are NOT RUN. Give practical and theoretical tradeoffs, at least one explicit dissent/failure sequence, and a simpler alternative where useful.

## Scope and fixed constraints

- One Rails API/worker authority and one PostgreSQL migration lane; no extra language backend, Redis queue, ActiveJob-after-commit substitute or C++/motion/native/AI/mobile work.
- BE02 owns drafts and durable save-operation identity. The current canonical contract is `1.0.0-collaboration.1`; preserve its paths, shapes, validation, error precedence, replay semantics and fixtures. Consuming retains the approved content version; saving an old operation must still return its original result. Author-owned drafts do not silently become team-owned.
- Send permission is an explicit current mailbox `approve_send` capability, not a role inferred from an address; current organization/mailbox access, session, context, CSRF and authorization generations remain mandatory. Humans approve in the regular app; connector read/draft authority never confers send authority.
- Exactly-once database intent is attainable; exactly-once internet delivery is not claimed. One intent per draft is stronger than one per version. Re-sending requires an explicit new draft and new review.
- Actual provider interfaces, Resend mapping, HTTP transport and durable Express simulator are BE04. BE03 may define only a typed minimal submission seam and a deterministic local failure driver, visibly distinct from a provider simulator. No real provider request, provider credentials, host tests, Docker execution or SSH in this consultation.
- Freeze approved bytes; do not silently normalize reviewed text or derive a new message at retry time. Bound recipients/content/headers; no raw HTML or unreviewed attachments. Audit/logs must exclude bodies, addresses, tokens and raw provider responses.
- Outbound restore starts held by control outside the app backup. BE04's acceptance ledger also lives outside that backup; missing ledger or policy evidence fails closed. BE03 cannot claim the full BE04 restore drill.
- Obsidian is unavailable. The synthesis must disclose local analytical simulations as reasoning, not an Obsidian connection or executed integration tests.

## Evidence precedence and omissions

The current dispatch, accepted ADR0002 and BE02 decisions, frozen C/D contract and current orchestration override older proposal wording (including historical Devin-only execution and unimplemented status). BE02's mutable sibling is evidence of current implementation shape, not accepted behavior. Freeze the minimum relevant source and disclose dirty worktrees. Provider assumptions in old reliability prose must be checked against primary documentation, with endpoint/date/scope; a claimed 23-hour margin is a design assumption, never a provider guarantee.

Common packet omissions are explicit: historical status logs beyond current excerpts; prior raw/model-specific opinions; native/client implementation details; unrelated frontend source, secret/environment/authentication files, third-party snapshots, large fixtures and most BE02 tests. Full-file hashes identify the consulted originals even when only line ranges are supplied. No opinion may claim to inspect omitted content or run a test.

## Section-specific evaluation

Review transaction/schema, approval/canonicalization, authorization, worker/reconciliation, restore/retry and implementation/test scope separately. Return accept/change/defer judgments with exact supplied path/section evidence or a labeled gap. Do not merely vote for the initial proposal: identify missing fields/constraints, permission failures and impossible guarantees. Limit optional future abstractions; preserve dissent for Astra synthesis.

## Preparation gate

This design can be handed to the root for review. Implementation requires root's explicit BE02 acceptance, the accepted C/D bytes matched or an impact-reviewed delta, and root's BE03 dispatch. No consultation output alone accepts BE02 or completes BE03.
