# Validation — backend integration milestone (5 October 2026)

Branch `design/fable-frontend`. Scope: the API-backed mode (`VITE_BACKEND=api`) wired to the backend foundation, plus the AI-permission fix in the demonstration mode. This validates one integration milestone. It does not make the application complete: see "Remaining production gates".

## What was run

Everything ran in Docker on the build host (fleet-02), never on the laptop. Sources were copied there because `docker build` over the remote context failed intermittently.

| Check | Result |
|---|---|
| ESLint, `tsc` typecheck | clean |
| Unit and component tests (Vitest) | 267 passed, 13 files; domain line coverage 99.76% |
| Demonstration build + existing browser tests | 45 passed, 1 intentional mobile skip |
| API-mode build + real-backend browser tests | 20 passed (12 journey tests on desktop, 4 visual tests on desktop and phone) |

### JavaScript budget (250 KB gzip initial)

| Build | Initial JS (gzip) | Largest lazy chunk |
|---|---:|---:|
| Demonstration (`npm run build`) | 183.13 KB (`index` 70.14 + `App` 112.99) | Settings 7.25 KB |
| API-backed (`npm run build:api`) | 162.68 KB (`index` 70.15 + `LiveApp` 92.53) | Settings 4.04 KB |

Neither build loads the other's code: the mode is chosen at build time in `src/main.tsx`, so fixture data is not present in the API bundle.

## Real-backend evidence

The browser tests in `e2e-integration/` talk to the actual backend Worker (backend worktree at `49fc23e` plus its uncommitted integration work) running on workerd with local D1, its queue consumer and its `DurableFakeProvider`. `integration/harness.ts` seeds two synthetic users and exposes a control port used only to stage conditions (outage, pause, expire a session, make the provider reject or go ambiguous, simulate a crashed worker). Responses are not intercepted, except one test that deliberately drops a single answer to prove recovery and one that delays the first answer to show the loading state. Log of the final run: [real-backend-run.txt](2026-10-05-backend-integration/real-backend-run.txt).

| Requirement | Test (`e2e-integration/journey.spec.ts`) |
|---|---|
| Browse pages, lazily loaded body, compose, review, approve, track | browse pages, open a lazily loaded body, reply, approve and track to acceptance |
| Editing approved content needs a new approval | a queued request can be cancelled and edited only as a new request needing new approval |
| Quota rejection | the server refuses approval beyond the mailbox limit and the request stays unapproved |
| Unknown outcome | an unknown outcome is shown as unknown, is not polled, and offers no way to send again |
| Rejected | a provider refusal is shown as rejected, with nothing claimed as sent |
| Lost answer / reload recovery | a lost answer is recovered after reload as the same request, never a second one (the server holds exactly one intent) |
| Backend outage | a server outage shows errors, never mail or success, and recovers the pending request |
| Expired session | an expired session clears what was on screen and asks to sign in again |
| Two-tab consistency | two tabs stay consistent and a request is approved only once |
| User isolation | one user cannot see another user's mailboxes, mail or send requests |
| Bounded polling | status checks are bounded and stop when the request page closes |
| Honest unavailable areas | unsupported areas say they are unavailable and offer no working control |

Bounds: one page of at most 50 summaries is held and rendered; at most 20 message bodies are kept (least recently used dropped); status checks happen only for queued or sending requests while their page is open and visible, back off from 1.5 s to 10 s, and stop after 30 checks.

## Visual inspection

Screenshots were taken from the running application against the real backend and inspected: `docs/validation/2026-10-05-backend-integration/it-<desktop|mobile>-<light|dark>-*.png` (committed) (sign-in, loading, inbox, empty inbox, open message, offline with a failed load, compose, review, awaiting approval, queued, accepted, send list, connections, AI permissions, settings, unavailable area) plus `it-desktop-{outage-*,quota-refused,unknown,rejected,session-expired}.png`. Gold accent, white light theme, dark-grey dark theme and the transparent logo are unchanged. The phone-size screenshots inspected showed no overflow.

Not done: a manual click-through in a desktop browser on the laptop. The stack ran only on the remote build host, so inspection used the screenshots Playwright captured from the real application.

## Exact run instructions

From this worktree, with the backend worktree beside it:

```bash
# Unit, lint, typecheck, demonstration build and its browser tests
docker build -t elevateo-mail-it-web .
docker run --rm elevateo-mail-it-web

# Real backend + API-mode frontend
docker build -f integration/server.Dockerfile --build-context harness=integration \
  -t elevateo-mail-it-server "../Elevateo Mail - Backend"
docker compose -f integration/compose.yaml up --abort-on-container-exit --exit-code-from web
docker compose -f integration/compose.yaml down
```

The `web` container builds the API bundle, serves it with `/v1` proxied to the `server` container, and runs `npm run e2e:integration`. Screenshots are written to `/app/e2e-shots` in that container.

## Remaining production gates

1. The backend integration contract is uncommitted work in the backend worktree; the frontend was tested against it as it stood on 5 October 2026 and must be re-run when it is committed.
2. Sign-in is a pasted pilot session token kept in `sessionStorage`. Production needs real session issuance, ideally an HttpOnly cookie, and server-side revocation.
3. The server cannot list a user's send requests and exposes no account id, so request records (including message text) are kept in this browser's `localStorage` and are invisible on other devices.
4. Only the simulated provider exists. No Google or Resend connection, no real send, no inbox synchronisation, no search.
5. Campaigns, contacts, history import, enrichment, DNS and AI execution are unavailable in API mode by design.
6. Limits shown are the server's provisional rolling-24-hour policy.
7. No deployment, hosting, TLS, monitoring, desktop packaging or signing exists.
8. Open review findings listed in `code-reviews.md`.
