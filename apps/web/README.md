# Elevateo Mail web client - FE-01 read checkpoint

Strict TypeScript React client for the frozen `contracts/v1/openapi.json` read contract: session, mailboxes, thread summaries and a paginated plaintext reader. Composer, sending, attachments and collaboration mutations are not implemented. This checkpoint is not accepted for publication.

## Current state

**BE-02A session lifecycle (2026-10-13, Docker gate NOT RUN):** sign-in/recovery, the fixed `/auth/complete` password form, one bounded challenge+refresh after a 401, explicit no-organization state, account sheet with organization switch and local/global sign-out are implemented against `contracts/v1/openapi.json` 1.0.0-session.1 (SHA-256 `f6524b78…`). Typed gateway methods, 8 KiB bounded JSON POST with `X-CSRF-Token` only, and fenced late-response guards are covered by new unit, component and browser specs that have not yet been executed in the container. Details and open integration inputs: `docs/completion/fe02-session-implementation.md`. The host must serve this SPA at pathname `/auth/complete`.

**BE-02 C/D collaboration (2026-10-13, Docker gate NOT RUN):** actor-owned durable drafts with operation-id save attempts (exact-payload retry, ledger lookup, conflict rebase/adopt, consumed read-only), explicit read state, revisioned assignment, immutable plaintext notes, mailbox member administration with the last-manager guard and authorization-version re-bootstrap, and scoped literal search are implemented against `contracts/v1/openapi.json` 1.0.0-collaboration.1 over 13 new typed gateway methods and a stateful fixture (`src/data/fixtures/collaborationState.ts`). New unit, component and browser specs are authored but not executed. Details: `docs/completion/fe02-cd-implementation.md`. The first frozen Docker stage failed on 27 lint errors (unused type-pin bindings, `no-control-regex` for U+000B) and one `tsc` error (a union-spread operation fixture); all are repaired without relaxing any rule or assertion, with a vertical-tab regression added, and the rerun is pending root receipts: `docs/completion/fe02-cd-runtime-fixes.md`. The design review's seven draft-recovery defects are repaired (Docker gate NOT RUN): unsaved text, raw recipient input and the exact unresolved save attempt now live in a session-scoped in-memory `DraftIntentProvider` (`src/app/draftIntent.tsx`) above the router, re-presented only after a current authorized read by the same actor/organization/mailbox/draft and dropped on sign-out or identity change; a refused retry (400/404) keeps the attempt unresolved; an exact retry ignores newer invalid local edits; an unavailable or consumed server copy never rebases, adopts or re-keys by itself; busy state is per request; save results and ledger receipts are applied only under the attempt's full binding. The frozen lint-fix rerun's four unit failures (ambiguous `Fixture inbox` text, two last-manager self-delete expectations, a repeated rebase id fixture) and four browser failures (`mailboxes-empty` counting the global Search link) are repaired with semantic selectors and stronger assertions, and the C/D browser captures are now per-route, project-qualified and include dark-theme and full editor-state images. Details, hashes and bounded review slices: `docs/completion/fe02-cd-recovery-repair.md`.

FE-01-R1 stage A repairs transport cancellation/MIME handling, operation-specific fixture typing, contract tests and shared DOM cleanup. Coordinator Docker checks on Node 24.21.0/npm 11.19.0 pass strict typechecking, API regeneration, all 123 unit tests and production build. The production output contains none of the three tested fixture markers; this is not runtime isolation proof. Lint still fails on an unused session-test import assigned to Fable's next repair stage. Session lifecycle, pagination, modal accessibility, contrast, browser QA and real Rails integration remain open.

## Setup and verification

The production PWA uses `scripts/pwa/build.ts` and `worker.js`, with install/update UI in `src/pwa`.
The user guide is [install-app.md](../../docs/product/install-app.md). No API or authenticated response is cached.
Serve the entire `dist` atomically, including versioned shell HTML, at the origin root over HTTPS.
Keep old versioned assets available while old windows remain open. Serve `sw.js` and the manifest with revalidation;
serve authentication/API/attachment responses with `Cache-Control: no-store`. These hosting checks remain server follow-ups.

Set `DOCKER_CONTEXT=desktop-linux` for all local Docker commands. In the existing web test container, install
Chromium with `npx playwright install --with-deps chromium`, then run
`apt-get install -y xvfb xauth`, then `xvfb-run -a npx playwright test --config playwright.pwa.config.ts`
after `npm run build`. The standalone checks install and launch real Chromium app windows using disposable profiles.
This separate suite serves production output on container loopback, with no host server or real mailbox.
`node e2e/pwa/capture.mjs` captures public manifest screenshots against that server; rebuild after capturing.
On a busy shared Docker engine, `npm run test:coverage -- --maxWorkers=1` avoids resource-driven timeouts.
Remove generated coverage before repeating lint in the same disposable workspace.

All package versions and the resolved tree are committed in `package.json` and `package-lock.json`. Run application checks inside Docker, from the repository root:

```sh
docker build -f apps/web/docker/test.Dockerfile -t elevateo-web-test .
docker run --rm elevateo-web-test
```

The target runs API regeneration, lint, strict typecheck, unit tests with coverage, production build and the fixture-marker check. Its accepted image is pinned by digest. Remove only task-owned disposable containers/images/cache after verification, preserving persistent data.

The coordinator used equivalent read-only source mounts and disposable tmpfs workspaces for stage A to limit local disk use. The full gate still includes lint and browser tests. No host tests are accepted.

## Architecture and entry points

- `index.html` and `src/main.tsx` use the HTTP gateway exclusively; API failures must never select fixtures.
- `dev-fixtures.html` and `src/dev/fixtureMain.tsx` provide a separately labelled development graph. Vite production configuration excludes that entry.
- `src/data/gateway.ts` defines the boundary; HTTP and fixture implementations validate the frozen DTOs. Fixture behavior does not establish backend authorization or pagination fidelity.
- Message content is escaped plaintext. No HTML, remote images or attachment execution is supported.

## Dependencies

Core pins include React 19.3.0, React Router 7.18.4, Zod 4.6.5, TypeScript 5.9.3, Vite 7.3.6, Vitest 4.1.11, Playwright 1.64.0 and openapi-typescript 7.13.0. See the package manifest for exact supporting versions. Node declarations support tooling typechecks; ESLint and its TypeScript/hooks integrations enforce the required lint gate. Radix Dialog 1.2.0 powers the accessible mobile drawer (`src/ui/Drawer.tsx`). Tailwind/Vite plugins, DOM testing tools and React declarations support the existing client. The resolved 325-package audit reported zero vulnerabilities during stage A; that is a point-in-time result.

## Outstanding acceptance

Fable owns the accepted FE-01-R1 session/UI repair. As of the r11 fleet-02 validation (2026-10-12), the in-scope evidence is complete: lint `--max-warnings 0`, strict typecheck, 209 unit tests with coverage, production build and the browser matrix (163 passed / 0 failed / 50 expected skips) all pass, covering 409 retry-budget behavior, stale identity exclusion, cursor-reset replacement, preserved URL filters, keyboard modal behavior, production-artifact API-failure isolation and hostile plaintext checks; all 112 both-theme visual-state captures were individually inspected with zero defects, and computed contrast is machine-asserted statically within the opaque-hex theme scope (no perceptual ΔE/WCAG claim). This is read-checkpoint verification, not whole-application acceptance: real Rails conformance, mutation flows and the jobs scheduler remain open (see `docs/fe-rails-integration-packet.md`). Hash routing remains the current hosting convention.
