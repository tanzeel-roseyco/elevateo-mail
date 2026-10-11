# FE-01-R1 analytical design scenarios

Status: consultation input proposal; no implementation selection or executed simulation claim.

<!-- AIDEV-NOTE: The timelines expose recovery and freshness coupling without introducing a general client state framework. -->

The Obsidian connection is unavailable. The following is a bounded analytical comparison using the existing four-GET contract and reviewed implementation. It does not substitute for the required Docker/browser regressions or pretend that a connected simulation was performed.

## 1. Explicit retry survives automatic refresh triggers

Trace: ready session A issues request R1; current R1 returns 409; the client clears protected data and performs its sole automatic rebootstrap; ready session A or B issues R2; current R2 also returns 409; the UI shows explicit retry. Advance more than 30 seconds, dispatch focus/visible events and an active timer tick. None may issue session or protected-data requests or reset recovery eligibility. User retry may begin a new bounded attempt.

An unqualified `bootstrap(false)` call from each event is small but bypasses the recovery limit. A single automatic-refresh eligibility predicate plus a distinct explicit-retry transition is proposed. A large reducer/state library may make transitions formal but adds a dependency and more surface than this checkpoint needs. Prefer the smallest explicit state/guard representation that makes this trace inspectable and testable; exact representation is for synthesis.

Failure tests: a simultaneous timer/focus burst yields no request while blocked; duplicate current 409s do not each start a rebootstrap; a stale previous-generation error cannot exhaust the replacement session's allowance.

## 2. Unchanged session refresh overlaps a read

Trace: ready identity A starts a slow mailbox/inbox/detail read; the active refresh runs; session GET returns identical actor/organization/context/version; the initial read resolves afterward. The UI must finish with current content rather than remain loading because the refresh invalidated its generation while leaving a ready dependency unchanged.

Option A preserves request ownership until session identity actually changes. It avoids unnecessary reloads but requires the identity comparison and required-invalidating transitions to be precise. Option B deliberately advances ownership on every refresh and signals all relevant consumers to restart. It gives one invalidation rule but creates extra requests and must prevent periodic refresh starvation. Both must suspend content during required recovery and reject old-identity responses. The opinion should select one explicit policy and explain why its existing component dependencies implement it.

Acceptance observes actual deferred read requests and final DOM, not only the session controller's status. Timer-driven refresh cannot overlap indefinitely or leave obsolete readers alive after unmount.

## 3. Identity changes before effect cleanup

Trace: mailbox data for actor A has rendered; the session is lost or replaced by B; React renders the Shell before its mailbox-clearing effect executes. No mailbox name or reader content owned by A may be visible in that render. A later A success and A 401 must both be ignored.

A render-time ownership check keeps existing component instances but requires every protected view to check the right ownership. A keyed protected subtree can make identity lifetime explicit and reset view state together; it can also remount navigation/focus if keyed more broadly than necessary. Select a stable identity boundary covering actor, organization, context and authorization version. Mailbox/filter request ownership still belongs to their narrower scopes, and frontend checks do not grant backend permission.

Measure the tradeoff with a deferred response, an observed replacement render and keyboard focus after replacement. Current 401 clears the current protected state and cancels requests; an old 401 cannot erase B.

## 4. Cursor recovery changes append into replace

Trace: accumulated rows/messages contain page 1 and page 2; page 3 returns `cursor_invalid`; one request starts at the beginning; the response contains changed rows and a fresh cursor. The rendered collection must equal the reset first page, not the prior collection plus that page. Preserve the selected unread filter. A second cursor failure surfaces manual retry and sends no further automatic request.

An outer `append` boolean retained across an internal retry hides the changed meaning of the result. Returning an explicit reset outcome or making reset a distinct load transition exposes the behavior. Sharing a tiny reset policy across existing pagers is reasonable only if it preserves their separate cursors and collection semantics; a general pagination framework is unnecessary.

Variants: valid empty page plus non-null cursor; zero-message conversation; duplicate summary IDs after normal continuation; context/filter change during the retry; independent mailbox and message pagination. None implies a snapshot-isolation promise from the server.

## 5. Cancellation and size limits after response headers

Trace: fetch resolves status 200 and JSON headers; the body emits a small first chunk, then stalls or rejects. Caller abort or the original 10-second deadline must cancel body consumption and settle through the typed gateway error path. A pre-aborted signal must send no request. A lying Content-Length cannot hide an over-limit stream.

Wrapping only the initial fetch is insufficient. A single deliberate classification/cleanup boundary around the whole lifecycle minimizes inconsistent errors; helpers can retain one responsibility for streaming and JSON/schema validation. Preserve classified errors rather than collapsing every failure into network failure. Confirm cleanup through instrumentation and fake timers in Docker, not real ten-second sleeps in every test.

Variants: legitimate JSON charset, deceptive `application/jsonp`, exact UTF-8 byte limit versus one extra byte, oversized error response, schema-valid but operation-wrong fixture data, redirect, malformed body and rate-limit headers.

## 6. Mobile modal implementation cost

Trace: keyboard user opens the mailbox drawer at 390 px; focus enters its meaningful first target; Tab and Shift+Tab remain inside; background links cannot be activated; Escape dismisses; focus returns to the invoking control. A route selection closes the drawer without leaving focus behind an invisible element.

An approved Radix dialog primitive centralizes well-known focus/background behavior but adds the used dependency and still needs correct labels and route integration. Hand-maintained containment appears smaller initially but requires careful handling of focusable elements, visibility changes and restoration. Prefer the existing approved primitive if its dependency is actually used and the coordinator verifies its exact lock; no second modal framework is needed. Confirm the final choice with actual keyboard traversal and accessibility observations.

## 7. Explicit test cleanup and honest fixture proof

Trace: one test mounts a ready session; the next mounts an unauthenticated session; the third mounts another ready session. Only the current test's root may remain. The authored setup has no cleanup hook and the runtime retained multiple `status:ready` elements.

An explicit imported `afterEach(cleanup)` in one small setup file makes lifecycle ownership visible while keeping globals disabled. Enabling all global test APIs also enables automatic cleanup but changes the test environment unnecessarily. Per-file cleanup works but is easy to omit in the next component suite. The shared setup is the proposed minimal repair; tests using fake timers or mocks must restore their own extra state deliberately.

A fixture adapter test can prove adapter validation and rendered examples. It cannot prove HTTP request details or production exclusion. Use controlled transport conformance for HTTP boundaries, import/output inspection for bundling and a failing-API test against the served production artifact for absence of fixture fallback. Keep these evidence claims separate.

## Decision record expected from synthesis

For each scenario, record the selected policy, rejected alternative, failure case and proving test. Resolve implementation ownership and exact affected files alongside the decision. If the selected solution requires a new API, backend session meaning, framework, production dependency outside the approved option or broader feature scope, stop that dependent change and return to the task gate.
