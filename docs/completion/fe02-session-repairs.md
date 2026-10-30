# FE-02 session lifecycle — repairs after the first Docker unit run

Status: **repaired in source, Docker gate NOT RUN.** Fable frontend owner (`claude-fable-5-1`), 2026-10-13, branch `review/ultra/frontend-reader`. Evidence: `ops/local/fe02-first-unit-test.log` (first validator run: 4 files failed, 14 tests failed, 329 passed). No host, SSH or Docker test was executed for this repair; the validator's frozen snapshot and its report under `scripts/fleet-02-validation-20261012` were not touched.

<!-- AIDEV-NOTE: Companion to fe02-session-implementation.md; each root cause maps to one regression assertion. -->

## Root causes and fixes

| # | Failures (log) | Root cause | Kind | Fix | Regression evidence written |
| --- | --- | --- | --- | --- | --- |
| 1 | `lifecycle-conformance.test.ts` six cases at line 122 (`GatewayError … validated httpGateway.ts:36 → Object.login httpGateway.ts:79`) | `validated()` threw **synchronously** from non-async gateway methods (`login`, `requestRecovery`, `acceptAuthEntry`, `logout`, `switchOrganization`). The port promises a `Promise`; a sync throw escapes `.catch`/`rejects` consumers and would surface as an unhandled exception in any caller that does not wrap the call in its own `try`. | Product | The five validating methods are now `async`, so local validation becomes a rejection. Behaviour is otherwise unchanged: no request leaves the browser and the malformed value is never logged. | New case "a local rejection is a rejected promise, never a synchronous throw": asserts no sync throw, `instanceof Promise`, rejection `transport/malformed`, zero fetches. |
| 2 | `session-lifecycle.test.tsx` "a 404 on switch …" (`expected 'ok' to be 'failed'`); `Shell.test.tsx:152` "Unable to find role=alert" with the detached dialog frozen at "Switching…" | `runEntry` mapped **every** 404 to the `no_organization` state and returned `ok`. That is correct after login (identity without any organization) but wrong for a switch: the target merely being unavailable replaced a valid, ready session with the no-organization screen. The account sheet unmounted mid-action, which is why the test's `within(dialog)` dump shows the detached sheet still pending and no alert. | Product | `runEntry` now takes the kind into account: login 404 → `no_organization` (unchanged); switch 404 → `{ kind: 'failed', failure.code 'no_organization' }`, current identity and context untouched, sheet reports in place. | Strengthened assertion: result `failed/no_organization`, status stays `ready`, organization A and `context_A_0123456789` retained. The existing Shell case (alert inside the sheet, organization A still shown) now exercises the fixed path. |
| 3 | `session-lifecycle.test.tsx` lines 100, 132, 152, 308, 414 (`expected +0 to be 1`) | Test-harness defect: `counting()` spread `...overrides` **after** the counting wrappers, so any overridden operation (refresh, session, logout) bypassed its counter. The controller behaviour was correct; the counters measured nothing. | Test | Overrides are merged into the base gateway first, then wrapped, so counts cover overridden operations. No assertion values changed. | The five previously failing counter assertions are now meaningful; a harness comment records the ordering requirement. |
| 4 | `signal-propagation.test.ts:56` "refreshSession still resolves for a live signal" (`promise rejected "Synthetic unauthenticated"`) | The fixture default for `refreshSession` deliberately answers 401 (no cookie → a 401 bootstrap ends on sign-in after exactly one refresh). The signal-path case assumed every default resolves. | Test | The "resolves" case scripts `refreshSession: 'lifecycle_a'`; the assertion (`resolves.toBeTruthy()`) and the pre-aborted case are unchanged, and the 401 default stays because `Shell`, `session` and the Playwright fixture journeys depend on it. | Comment at the call site records why the default is not used there. |

No assertion was weakened. Two product fixes (1, 2) and two test-side fixes (3, 4); unsaved-data retention, context guards, late-response fencing and same-origin/no-storage rules are untouched by these diffs.

## Changed files

- `apps/web/src/data/http/httpGateway.ts` (fix 1)
- `apps/web/src/app/session.tsx` (fix 2)
- `apps/web/src/app/session-lifecycle.test.tsx` (fix 3 harness + fix 2 regression)
- `apps/web/src/data/lifecycle-conformance.test.ts` (fix 1 regression)
- `apps/web/src/data/signal-propagation.test.ts` (fix 4)
- `docs/completion/fe02-session-repairs.md` (this file)

## Validation status

**NOT RUN.** Nothing was executed on the host, over SSH or in Docker after the coordinator's ruling. Expected result of the next Docker run: the 14 listed cases pass plus the one new conformance case (344 total), with no change to the other 329. Commands for the validator are unchanged from `fe02-session-implementation.md` (`docker/test.Dockerfile`, then Playwright `e2e/session.spec.ts` and `e2e/visual-states.spec.ts`). Browser failures from the frozen run, if any, were not yet available to this worker and are not covered here.
