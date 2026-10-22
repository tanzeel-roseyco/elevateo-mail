# Launch sprint: app-level SSO sign-in entry (web UI)

Worker: Claude Fable 5.1 (`claude-fable-5-1`, verified from the session's model metadata before any
edit), Orca task `task_0a26cdc927d7`, worktree branch `Tanzeel/elevateo-launch-sso-fable-20261023`
over `32c76167`. Frontend only (`apps/web`); no backend code, no OpenAPI edit, no live API call, no
deployment. Backend worker `ctx_346cc2b0409f` owns the server side.

## Contract built against (confirmed by the coordinator, 2026-10-23)

| Surface | Behaviour the UI relies on |
| --- | --- |
| `GET /v1/auth/sso/status` | `{ enabled: boolean, provider: "google" \| null, password_login_enabled: boolean }`, no-store, no proof/context headers |
| `GET /v1/auth/sso/start` | full-page browser navigation (no `return_to`); the server redirects to the IdP; 503 when disabled |
| callback | sets the ordinary session cookie and redirects to `/`; on failure `/?sso_error=access_denied\|unavailable\|invalid_response` |

The contract is spelled in one module, `apps/web/src/data/ssoContract.ts` (schema, start path,
landing-error reader/stripper, generic copy). A refinement is one edit there plus the two adapters.
`contracts/v1/openapi.json` was intentionally not touched (backend-owned); `check:api` stays green.

## What changed

- `apps/web/src/data/ssoContract.ts` — zod schema (strict; unknown provider fails closed), `SSO_START_PATH`,
  `readSsoLandingError` (unknown values collapse to `unknown`, never echoed), `stripSsoLandingError`, copy.
- `MailroomGateway.getSsoStatus` in `gateway.ts`; HTTP adapter (`/v1/auth/sso/status`, 1 KiB budget) and
  fixture adapter (`sso_google_and_password` default, `sso_google_only`, `sso_password_only`, `sso_none`;
  error examples such as `temporarily_unavailable` script a failed status read).
- `apps/web/src/features/auth/SignInPage.tsx` — status read on mount (abortable, one per mount/retry);
  loading skeleton; fail-closed error card with retry; empty state when nothing is enabled; gold primary
  "Continue with Google" button that performs `location.assign('/v1/auth/sso/start')` through an
  injectable `SignInNavigation` and locks the page ("Redirecting to Google…"); password form only when
  `password_login_enabled` is true (outline submit under the Google button, primary when alone); callback
  failure shown once as a generic danger callout and removed from the URL with `history.replaceState`.
- `apps/web/src/features/auth/GoogleMark.tsx` — monochrome G mark (no blue; slate-950 on gold).
- `apps/web/playwright.config.ts` — `desktop-1440` project for the design-review width.

Not changed: the session controller, the password/recovery/completion flows and their tests, the
EmailGuard replica pages. No EmailGuard branding or copy, no `blue-*`/`sky-*` utilities
(`grep -rE "blue-|sky-" apps/web/src` is empty).

## Tests (fleet-02 Docker only; nothing ran on the laptop)

Staging: `/tmp/elevateo-sso-20261023` on fleet-02 (CRLF normalised to LF before the build; the first
`check:api` failure was the Windows checkout's line endings, not a contract drift).

| Gate | Command | Result |
| --- | --- | --- |
| Web gate | `docker build -f apps/web/docker/test.Dockerfile -t elevateo-sso-web-test .` then `docker run --rm elevateo-sso-web-test` | check:api, check:api:v2, lint, typecheck PASS; vitest 85 files / 1063 tests PASS (coverage 85.61% statements, 80.94% branches; `ssoContract.ts` 100%, `SignInPage.tsx` 94.5%); production build PASS; fixture-exclusion PASS; exit 0 (`evidence/gate4.log`, after the review fixes) |
| New unit files | `ssoContract.test.ts` 10 tests, `SignInPage.sso.test.tsx` 20 tests, `signal-propagation` +1 method | PASS |
| Browser | `mcr.microsoft.com/playwright:v1.64.0-noble`, `npx playwright test e2e/sso.spec.ts --project=desktop-1440 --project=narrow-390` against `vite --mode fixtures` | 10/10 PASS (`evidence/e2e6.log`) |

One earlier full run showed `collaborationNav.test.tsx` failing once under load (synchronous link
assertion after the nav appears); it passed on every rerun and is unrelated to this change. It is a
pre-existing flake, not fixed here.

## Visual QA (Chromium, 1440×900 and 390×844, synthetic fixtures)

`screenshots/` holds 14 captures, two widths each: Google + password, Google button focused (gold 2px
ring), Google only, redirecting/locked, callback failure callout, status failure card, nothing-enabled
empty state. All inspected by the worker: gold primary with dark text, outline password submit, visible
focus ring, red callouts for failures, dashed empty state with icon/title/one line/action.

Limits: the "Redirecting to Google…" captures were taken by Playwright's failure hook, because once
`location.assign` starts a top-level navigation the page cannot be asserted by locators (a stubbed 204
never commits); the unit test pins that state instead. The fixture session shows "Your session ended"
because the fixture refresh answers 401; production shows it only after a real expiry. The orange
"Development fixtures" pill overlaps the card footnote on the 390 landing-error capture; it exists
only in the fixture entry. No Google credentials exist yet, so no live SSO success is claimed; the
callback and cookie behaviour are the backend worker's to prove.

## Review

See `code-reviews.md` ("Launch SSO sign-in entry"). Four bounded read-only Fable reviewers (three
≤ 230-line source packets plus a design-tradeoff reviewer).
