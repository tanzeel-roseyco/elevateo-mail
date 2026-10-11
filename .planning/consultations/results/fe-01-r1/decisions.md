# FE-01-R1 accepted repair decisions

Status: **accepted by actual Astra MAX after the three independent opinions**. These decisions resolve the frozen brief's proposals; the brief and opinions remain unchanged historical inputs. Application acceptance is pending V1-V10.

<!-- AIDEV-NOTE: Automatic events cannot replenish retry allowances; explicit user retry starts a new bounded attempt. -->

## D1. Scope and ownership

Repair issue [#8](https://github.com/tanzeel-roseyco/elevateo-mail/issues/8) against source `d7eac0791fd6483e47677fe8faa26c70a6522485`. The four existing GETs and canonical schema hash `94c5f31bc5d514fed420dcbcee2f6ce49bf4254e325000ea0794fe6a1140e8ca` remain unchanged. Preserve exact accepted core dependencies, generated types, same-origin cookie model and plaintext-only rendering. No backend, provider, sending, desktop, mutation or broader product work.

Use serialized actual Astra LOW data/setup repair, then exact Fable 5 lifecycle/UI repair. Coordinator owns package/configuration/locks, commands, Git, evidence, shared documentation and acceptance. No concurrent application writers or overlapping file ownership. Narrow follow-up fixes use LOW under the existing workflow; a change to the accepted boundaries needs a fresh task gate.

## D2. Session transitions and retry ownership

Use a small typed discriminated state with distinguishable initial loading, ready, recovering, retry-required, unauthenticated and error states. State naming is implementation detail; the transitions below are binding. Recovery allowance and in-flight session ownership must update synchronously with the transition so duplicate callbacks cannot each dispatch work. No state-management dependency is needed.

| Event | Required transition |
|---|---|
| Provider initial mount | Start one session request with a fresh allowance; guard duplicate/stale completion and supply an abort signal. |
| Explicit user retry/check again | Invalidate/cancel old ownership, hide protected content, start a fresh bounded attempt and replenish the one recovery allowance. Coalesce repeated clicks while that explicit attempt is in flight. |
| Timer, focus or visibility | Shared eligibility: ready, document visible, no session request in flight, at least 30 seconds since the last freshness request. No automatic work in loading/recovering/retry-required/unauthenticated/error. An active visible session refreshes every 30 seconds subject to an existing in-flight request; resume visibility checks the same schedule. |
| Unchanged successful freshness response | Preserve protected generation, subtree key, read-context object identity and active/accumulated reads. Harmless fresh display metadata may update without changing read dependencies. Preserve the recovery allowance. |
| Changed successful freshness response | Invalidate/cancel old reads before committing the replacement identity, replace the keyed protected subtree and start its initial loads. Preserve the recovery allowance: this automatic event does not renew it. |
| First current canonical context error (409 / `context_changed`) | Atomically consume the allowance, invalidate old ownership, hide protected content and perform one session recovery request. Concurrent old-generation errors are stale. A successful recovery may return either the same or a changed identity; it does not replenish the allowance. |
| Second current canonical context error | Invalidate/cancel and enter retry-required. Timer/focus/visibility and successful reads cannot leave this state or issue requests. Only explicit user retry starts a new attempt. |
| Current 401 / unauthenticated | Invalidate/cancel and hide protected state immediately; enter unauthenticated. It has priority over trying context recovery. No automatic login/re-entry. |
| Current session read failure | Set a deliberate non-ready error/unauthenticated state and invalidate protected reads as appropriate; do not leave private data indefinitely displayed after failed session validation. |
| Stale success or failure | Ignore it. A stale actor-A 401 or 409 cannot clear actor B or spend B's current recovery allowance. |
| Unmount/replacement | Abort owned session/read work and remove timers/listeners. Late completion must still fail ownership checks even if cancellation was ignored. |

The canonical status/code pairs must be present in fixtures and tested through the transport/rendered read boundary. Malformed status/code combinations must not be used to demonstrate canonical recovery. Client headers, phases and generations are consistency controls, never authorization grants. The session GET checks the server-held session; it does not log a user in.

Only initial mounting or explicit user retry renews recovery. This deliberately retains Opus's availability dissent: a later second access change may require manual retry even if a previous read succeeded. Automatic renewal after a read or identity change is outside this repair.

## D3. Protected rendering and request freshness

Derive a collision-safe identity key from actor ID, organization ID, context ID and authorization version. Keep the router and URL outside the key. Place mailbox state, drawer state and routed protected content inside the component owning that key. A gate renders no protected subtree while non-ready. A new identity therefore begins with fresh component state in its first committed render; clearing state in a passive effect is insufficient.

Use stable read context for unchanged identity. Preserve monotonic ownership checks for both success and failure. Mailbox/filter/thread changes need narrower current-owner/request-generation checks before rendering or applying data; they do not invalidate unrelated sidebar requests. Abort supplements ownership checks and releases resources; it is not the sole freshness proof. Preserve filter/navigation in the URL.

On a protected subtree replacement, put focus on a meaningful surviving main/status target. An old menu trigger may no longer exist, so unconditional focus restoration to it is insufficient. Unchanged freshness must not remount views, lose pagination or steal focus. Do not introduce a second broad permission guard framework.

## D4. Cursor policy

Use one small typed page-read helper where it removes the existing reset-policy duplication; its explicit result includes whether the caller must replace accumulated data. Fable owns `src/lib/readPage.ts` and its tests. The helper does not own collections, React state, caching or resource-specific pagination loops.

Each mailbox-list traversal, inbox traversal and reader traversal owns a separate one-reset allowance. A noninitial cursor failure may consume it and fetch the first page once. Clear accumulated items on that reset and replace them with the successful first page. Continuing afterward does not replenish the allowance. A second invalid cursor surfaces manual retry; it must not trigger another automatic restart. Initial requests with no cursor do not recursively retry `cursor_invalid`. Explicit user retry or a changed resource identity starts a new traversal.

For Shell's automatic mailbox loop the allowance covers the whole loop, including pages after a reset. On reset, discard the local accumulator and restart from page one; a helper invoked per page must not secretly grant a fresh budget. Check current ownership before any reset request and before applying its result; old errors cannot launch new reads. Keep cursors separate and opaque. Summary ID deduplication remains; do not infer snapshot consistency.

Continuation controls depend on `next_cursor`, not item count. Distinguish empty page with continuation, terminal empty mailbox, and zero-message conversation. Preserve all/unread in both conversation links and return links. Loading/retry controls must prevent duplicate concurrent continuation requests.

## D5. Transport and fixture typing

Keep the existing `GatewayError` vocabulary and schemas. Pre-aborted caller signals must reject as `aborted` before fetch. Hold the original 10-second deadline across fetch and body consumption; settle caller abort as `aborted`, deadline as `timeout`, and otherwise unclassified fetch/body failure as `network`. Preserve intentional classified failures. Cleanup must not mask the primary error or leave the operation pending indefinitely.

Use an exact normalized media type comparison with `application/json`; permit legitimate parameters and case differences. Do not permit `application/jsonp` or add `+json` variants. Enforce byte limits incrementally before JSON/schema parsing, regardless of Content-Length. Clean up unfinished response readers, abort listeners and timers on success/failure/cancellation, including early header rejection; deliberate cleanup failures must not replace the primary request outcome.

No limits change: 16 KiB session, 128 KiB mailboxes, 256 KiB summaries, 2 MiB detail, 4 KiB error; 50/50/20 entry caps; canonical same-origin paths/credentials, no-store, redirect rejection, context headers and bounded rate-limit handling. Preserve actual request/response conformance for all four operations.

Make the fixture resolver generic over a concrete Zod schema passed for each operation, returning that schema's validated output. No unsafe operation-return assertion, parallel DTO or schema weakening. Data error/contract definitions stay read-only unless new evidence proves a necessary correction and coordinator explicitly reassigns the file within the gate.

## D6. Accessibility and styling

Use the approved `@radix-ui/react-dialog` 1.1.23 primitive for the mobile mailbox drawer, with meaningful title/labels and explicit route-close integration. Coordinator resolves/audits the exact lock. Do not add alert-dialog unless actually used, a second modal framework or handwritten focus trapping.

Prove initial focus, forward/backward containment, background exclusion, Escape and dismissal restoration through real browser keyboard events at 390 px. Route selection closes the drawer with focus on a meaningful visible target. Identity replacement also handles disappearance of the original trigger. Resize while open must not leave an invisible modal trapping desktop interaction.

Choose the dark accent token by measured computed styles on the actual surfaces: normal and active text, focus indicators and states in both themes. Meet the approved accessibility contrast bar; the proposed light-gold value is not pre-approved evidence. Retain Ledger styling and reduced-motion behavior. No new motion work or dependency belongs here.

## D7. Test/configuration foundation and acceptance

Shared `src/test/setup.ts` explicitly imports Vitest `afterEach` and React Testing Library `cleanup`; keep globals disabled. Tests restore their own mocks/fake timers, and verify no owned timers/listeners remain before restoration can conceal leaks. Keep singular queries; do not mask retained DOM with plural queries or weaken isolation.

Coordinator selects exact compatible/audited Node-type and minimal lint package pins, with per-dependency reasons. Keep Node configuration typing separate from browser application globals using a narrowly scoped tooling tsconfig. Retain strictness and all accepted core pins. Add small ESLint/TypeScript/React-hooks checks; avoid unrelated formatting churn. Vite references the LOW-owned setup file; coordinator owns that configuration edit.

Every code defect receives a meaningful regression. Run the brief's V1-V10 matrix inside Docker against exact repaired bytes, including production-artifact failure/no-fixture fallback, hostile plaintext/no remote loading and actual visual inspection. The 50-row interaction/long-task baseline must record method/environment and observations; it is not an unmeasured Core Web Vitals claim. Native host metadata/hash scripts are not application tests.

Review all changed non-generated code/test/configuration and affected couplings through fresh adversarial assignments of at most 200 lines, plus a dedicated design reviewer. Record unique reviewed LOC, deduplicated defects/density, dispositions and exact final source hashes. Generated/lock changes receive regeneration, dependency and provenance checks rather than fabricated hand-review coverage. Keep full FE-01 and real Rails integration open until their own evidence exists.
