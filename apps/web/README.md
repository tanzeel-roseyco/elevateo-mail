# Elevateo Mail web client — FE-01 read checkpoint (partial)

Strict-TypeScript React app for the accepted read contract (`contracts/v1/openapi.json`, SHA-256
`94c5f31bc5d514fed420dcbcee2f6ce49bf4254e325000ea0794fe6a1140e8ca`): session bootstrap, mailbox
list, thread summaries with the all/unread URL filter, and a paginated plaintext reader. No
composer, drafts, send, logout, attachments or collaboration mutations exist in this checkpoint;
no control pretends they do. **Nothing here has been executed by the authoring agent** — the
coordinator runs every check in Docker.

## Entry points

- `index.html` → `src/main.tsx`: production graph, HTTP gateway only. API failures surface
  deliberate errors and never fall back to fixtures.
- `dev-fixtures.html` → `src/dev/fixtureMain.tsx`: development/test graph over the canonical
  `contracts/v1/fixtures.json`, permanently labelled. Excluded from `vite build` in production
  mode (`vite.config.ts`).

## Coordinator commands (run in Docker, repository root as context)

```
docker build -f apps/web/docker/test.Dockerfile -t elevateo-web-test .
docker run --rm elevateo-web-test
```

That runs, in order: `npm run check:api` (R1 regeneration check of
`src/data/generated/api.d.ts` against the canonical schema with openapi-typescript 7.13.0),
`npm run typecheck`, `npm run test -- --coverage` (Vitest 4.1.11), `npm run build`, then a grep
asserting the production `dist/` contains no fixture entry/data (R5 build-side check; the
runtime-side negative test is in `src/data/conformance.test.ts`).

Browser checks (R6) use `@playwright/test` 1.64.0 inside
`mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e…` with `npx playwright test` from
`apps/web`; the config starts the fixture dev server on loopback port 4173 and captures
screenshots under `e2e/.results/`.

Before any of this, the coordinator must resolve and commit `package-lock.json` (`npm install`
inside the pinned Node image), then audit the resolved tree. No lock is included here by design.

## Dependencies

Accepted pins (dispatch brief): react/react-dom 19.3.0, react-router 7.18.4, zod 4.6.5,
typescript 5.9.3, vite 7.3.6, vitest + @vitest/coverage-v8 4.1.11, openapi-typescript 7.13.0,
@playwright/test 1.64.0. Radix dialog/alert-dialog 1.1.23 are **not** used (no dialog in this
checkpoint) and were omitted.

Supporting dependencies left as ranges for the coordinator to pin and audit, with purpose:
`tailwindcss` + `@tailwindcss/vite` (the extracted Ledger stylesheet is Tailwind 4
`@theme inline` tokens), `@vitejs/plugin-react` (JSX/HMR), `@types/react`, `@types/react-dom`
(strict typing), `jsdom` (Vitest DOM environment), `@testing-library/react` (session/reader
behavior tests). lucide-react was deliberately dropped; `src/ui/icons.tsx` replaces it.

## Behavior notes

- Session: `GET /v1/session` bootstrap; refresh on focus/visibility at most every 30 s; a current
  401 clears all mail state and shows session-unavailable; a 409 clears and re-bootstraps exactly
  once before an explicit retry state (`src/app/session.tsx`). The CSRF token stays in memory and
  is currently unused because the contract defines no unsafe route.
- Reads: scoped cursors with at most one automatic first-page reset on `cursor_invalid`; list and
  message pagination are independent; delayed responses are rejected by captured request
  generation plus abort; absent and inaccessible objects share one unavailable UI; GET never
  mutates anything.
- Rendering: escaped plaintext only, in a wrapping `<pre>`; no HTML/Markdown/autolinks/remote
  images; truncation and attachment counts are visible, inert indicators.

## Known gaps at this checkpoint (honest status)

- No command has run: lint config is absent (coordinator may add the standard linter), typecheck,
  unit tests, build, browser checks and the dist-grep are all **pending coordinator execution**;
  authored tests may need mechanical fixes once executed.
- Real Rails conformance (R2 second half), containerized visual evidence/screenshots (R6), the
  50-row interaction baseline measurement, and all R7 adversarial review are coordinator-owned
  and outstanding.
- Hash-based routing is a deliberate stopgap until the host serves the SPA on every route.
- Stale-response rejection across mailbox/filter switches is enforced in page code and covered
  indirectly; a dedicated UI-level delayed-response test is still worth adding.
