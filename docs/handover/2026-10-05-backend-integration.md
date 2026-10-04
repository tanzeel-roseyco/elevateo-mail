# Handover — backend integration milestone (5 October 2026)

Branch `design/fable-frontend`, built on reviewed commit `48c437d`. Not pushed, not deployed. The application is not complete; this milestone connects one journey to the backend foundation.

## What exists now

- `src/data/http/`: wire schemas and mappers (`contract.ts`), HTTP client with failure kinds (`httpClient.ts`), the gateway that makes requests (`httpGateway.ts`, port in `ports.ts`), the single cache owner (`live.ts`) and its instance (`instance.ts`).
- `src/domain/sendLifecycle.ts`: pure send-state rules (statuses, what may be approved, cancelled or edited, poll schedule, content check).
- `src/features/live/`: API-mode shell, sign-in, inbox, compose, send requests, connections, settings and the unavailable page.
- `integration/`: Docker harness that runs the real backend Worker with seeded synthetic data and a control port for tests. `e2e-integration/`: browser tests against it.
- Demonstration mode: `assistantQueue` and `checkAiDraft` now ignore mailboxes that are not `connected`, and permission wording no longer makes absolute claims.

## How to run

See README "Setup and run" and "Test". Evidence, budgets and production gates: [validation](../validation/2026-10-05-backend-integration.md). Contract use and gaps: [contract notes](../contracts/integration-v1-frontend-notes.md). Review record: [code-reviews.md](../../code-reviews.md).

## Things to know before changing it

- Components never write server state; add an action to `live.ts`.
- Every account-scoped async action captures `epoch` and drops its answer if the account changed.
- A send's idempotency key must be stored before the first request. Do not add a path that creates a request without one, and do not add automatic retries of approve.
- `unknown` must stay un-polled and without a resend control.
- The backend worktree was tested with uncommitted work; re-run the integration stack when it is committed.

## Not done

- Manual click-through on the laptop browser (the stack ran on the remote build host; screenshots from the real application were inspected instead).
- The five open review findings and the production gates.
- Uncommitted planning documents in this worktree (`.planning/BACKEND-STANDARDS.md`, `docs/backend-blueprint.md`, `docs/connections/README.md`, `docs/product-master-plan.md`, `docs/research/2026-10-04/README.md`) and `output/`, `tmp/` were left untouched and are not part of the commit.
