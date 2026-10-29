# FE-02 session lifecycle frontend (BE-02A) — implementation snapshot

Status: **implemented in `apps/web`, Docker gate NOT RUN, no real-backend evidence.** Written by the Fable frontend owner (model `claude-fable-5-1`) on branch `review/ultra/frontend-reader` in `Elevateo Mail - Fable FE01 R1`, 2026-10-13. Pre-existing dirty work in the checkout was preserved; only the files listed below were created or changed by this task.

<!-- AIDEV-NOTE: Companion to be02-implementation-brief.md; records the frontend side of the A lifecycle and its open inputs. -->

## Contract pins

| Input | SHA-256 | Verified |
| --- | --- | --- |
| `contracts/v1/openapi.json` version `1.0.0-session.1` | `f6524b78e870d9af7e6b8c38bda9a327c3d05c8e2c974ef450db489d31c2a7e4` | `sha256sum` before editing |
| `apps/web/src/data/generated/api.d.ts` (coordinator generated) | `19b95855911060455ef31418e4c4cf3339b0f658e38409c24c55581b5667112d` | `sha256sum` before editing; not regenerated or edited here |

The Zod boundary schemas in `contract.ts` pin `z.infer` against the generated component types in both directions (`contract.test.ts`), so drift between the two fails typecheck. The four FE-01 read schemas are unchanged.

## What was built

**Data boundary (`apps/web/src/data`)**
- `contract.ts`: `AuthChallenge`, `AuthLifecycle` (embeds the unchanged `Session`), `AuthAccepted`, `AuthLogout`, `Organization`, `OrganizationPage` response schemas; browser-side input schemas `LoginInput` (email 1..320, password 1..1024 UTF-8 bytes), `RecoveryInput`, `AcceptInput` (≥12 code points, ≤1024 bytes), `LogoutInput`, `OrganizationInput`; byte budgets `challenge 1 KiB`, `lifecycle 20 KiB`, `accepted/logout 4 KiB`, `organizations 128 KiB`, and `MAX_REQUEST_BYTES = 8 KiB`.
- `http/transport.ts`: `requestJson` gains an optional JSON `body` (POST). Same-origin, `no-store`, `redirect: 'manual'` (redirects rejected, 303 included), 10 s deadline, bounded response stream, strict schema parse — all unchanged. New: the serialized request is bounded at 8 KiB in UTF-8 bytes *before* dispatch; the only added header is `X-CSRF-Token` supplied by the caller; `Origin` is never synthesized (browser-owned forbidden header); 202 is a success; errors never carry the request body.
- `gateway.ts`: `MailroomGateway` gains `getLoginChallenge`, `login`, `requestRecovery`, `acceptAuthEntry`, `refreshSession`, `logout`, `listOrganizations`, `switchOrganization`; proofs are passed explicitly as `CsrfProof` from component memory. The gateway reads no cookie, token or storage.
- `http/httpGateway.ts`: exact routes `GET /v1/auth/login-challenge`, `POST /v1/auth/login|recovery|accept|refresh|logout`, `GET /v1/organizations` (context headers + `cursor`/`limit`), `POST /v1/session/organization` (context headers + session proof). Inputs are validated locally first; an invalid value never leaves the browser.
- `fixtures/fixtureGateway.ts`: same operations over `fixtures.json` lifecycle examples plus synthetic `lifecycle_a/b`, `organizations`, `organizations_empty` derived from the canonical sessions. The default `refreshSession` answers 401 so a scripted 401 bootstrap ends on sign-in after exactly one refresh attempt.

**Session controller (`apps/web/src/app/session.tsx`)**
- Preserves the accepted FE-01 behaviour: one 409 recovery per allowance, 30 s freshness on timer/focus/visibility, keyed identity, request generation guards on successes *and* errors.
- New states: `refreshing` (fenced, no context), `unauthenticated` with a sign-out/session-ended notice, `no_organization` (explicit 404), `signing_out`, `sign_out_failed` (content hidden, session retained for retry only).
- **Bounded refresh:** a current 401 (bootstrap, freshness, a protected read, or an explicit action) runs at most one `login-challenge → POST /v1/auth/refresh`. The allowance is consumed by the attempt and renewed only by a successful ordinary session result, a successful sign-in/switch, or an explicit retry. A refreshed session whose next read still 401s lands on sign-in; nothing loops. Outage on the refresh (503/timeout) shows an explicit error with a user retry, not a password prompt.
- Actions return `ActionResult` (`ok | superseded | failed{code,message,retryAfterSeconds?}`), never throw, and classify by error code only (`actionFailure.ts`). Superseded late results — failures as well as successes — are dropped.
- Sign-out fences protected state (scope invalidated, content hidden) *before* the request; a 401 means the session is already gone; any other failure keeps content hidden and offers retry/return. Without a session (no-organization) it proves with a challenge.
- Organization switch uses the current context + session proof; success replaces the identity (keyed subtree remount, read epoch bump); 404 keeps the current session and reports; 401/409 go through the central policy.

**UI (`apps/web/src/features/auth`, `src/app`, `src/ui`)**
- `SignInPage`: labelled email/password form (`autocomplete` username/current-password, `noValidate`), generic rejection alert that clears the password, 503 keeps entries and says nothing was saved, 429/503 `Retry-After` disables submit for exactly that long with no automatic resubmission, recovery form with identical acceptance copy for any address, signed-out/session-ended notice.
- `AuthCompletePage`: fixed query-free form at pathname `/auth/complete` (`src/app/entry.ts`), outside the hash router and outside the session provider. Local mismatch/length checks before any request; `challenge → POST /v1/auth/accept {password}`; outcomes: set-up (link to `/`), no-organization, invalid link (generic 401), 503 keeps values. It never reads the URL, loads no external resource and stores nothing.
- `AccountSheet` (+ `ui/Sheet.tsx`, Radix dialog): actor/organization, membership list read while open (one traversal budget, ≤20 pages, honest "more exist" note), explicit switch with `aria-current`, local and global sign-out.
- `Shell`: sign-in replaces the former terminal "session unavailable" screen; new fenced states (`Restoring access`, `Signing out`), explicit no-organization and unconfirmed-sign-out screens; account trigger in the header. The FE-01 four-read visual language, tokens and components are reused unchanged.

## Changed files

Created: `apps/web/src/app/{AccountSheet.tsx,actionFailure.ts,entry.ts,entry.test.ts,session-lifecycle.test.tsx}`, `apps/web/src/features/auth/{SignInPage.tsx,SignInPage.test.tsx,AuthCompletePage.tsx,AuthCompletePage.test.tsx}`, `apps/web/src/ui/Sheet.tsx`, `apps/web/src/data/lifecycle-conformance.test.ts`, `apps/web/e2e/session.spec.ts`, this document.

Modified: `apps/web/src/app/{session.tsx,Shell.tsx,Shell.test.tsx,session.test.tsx}`, `apps/web/src/data/{contract.ts,contract.test.ts,gateway.ts,signal-propagation.test.ts}`, `apps/web/src/data/http/{transport.ts,transport.test.ts,httpGateway.ts}`, `apps/web/src/data/fixtures/{fixtureGateway.ts,fixtureGateway.test.ts}`, `apps/web/src/{main.tsx,dev/fixtureMain.tsx}`, `apps/web/src/ui/icons.tsx`, `apps/web/e2e/visual-states.spec.ts`, `apps/web/README.md` (current-state paragraph only).

Not touched: `contracts/**`, `apps/web/src/data/generated/**`, root `README.md`/`state.md`/`documentation.md`/`code-reviews.md`, backend, and the pre-existing dirty files of other owners.

## Tests written — NOT RUN in the Docker gate

| Suite | Covers |
| --- | --- |
| `contract.test.ts` (+93 lines) | two-way type pins for every lifecycle schema; canonical lifecycle examples; invalid timestamps/tokens/literals; email 320, password 1024 **bytes** vs characters, accept ≥12 code points; closed enumerations |
| `http/transport.test.ts` (+70) | POST method/headers/body, no `Origin`, GET has no body, 202 accepted, POST redirect rejected, request bound exactly 8 KiB (and in UTF-8 bytes), API error never carries the body |
| `lifecycle-conformance.test.ts` (new) | exact path/method/proof/context per operation, local validation before dispatch (no fetch), 400/401/404/429/503 status+code, malformed/oversized lifecycle bodies, Retry-After, fixture parity |
| `signal-propagation.test.ts` (+8 methods) | pre-aborted and mid-flight abort for every lifecycle method on both adapters |
| `fixtures/fixtureGateway.test.ts` (+49) | lifecycle DTO types/defaults, 401 default refresh, wrong-payload and canonical-error handling per operation |
| `app/session-lifecycle.test.tsx` (new, 431) | one refresh per 401 then sign-in; fenced `refreshing` with null context; no second refresh after a refreshed 401; renewal by ordinary success; stale 401 ignored; 404/503 after refresh; 404 session; sign-in success/rejected/429/503/400/404; **superseded late failure and success**; recovery; sign-out fence-first, upstream `pending`, unconfirmed sign-out retained session, 401 on sign-out, challenge proof without session; switch success/404/409/401; no storage/cookie writes |
| `features/auth/SignInPage.test.tsx` (new) | credentials under challenge, labels/autocomplete/noValidate, generic alert clears password, 503 keeps entries, 429 hold exact duration without resubmission, signed-out notice, recovery identical copy, recovery outage |
| `features/auth/AuthCompletePage.test.tsx` (new) | local mismatch/short rejection without request, single POST under challenge, generic 401, 404, 503 keeps values, no URL read / no storage / no external resources |
| `app/Shell.test.tsx` (+114) | sign-in form replaces terminal screen, sign-in reaches shell, no-organization with sign-out, account sheet lists/switches/closes, failed switch, fenced sign-out with notice, unconfirmed sign-out |
| `app/entry.test.ts` (new) | `/auth/complete` pathname matching |
| `e2e/session.spec.ts` (new, Playwright, fixture entry) | sign-in after one refresh with no stored credential, keyboard sign-in, rejected/503 forms, successful refresh, no-organization sign-out, recovery, account sheet Escape/focus restore/switch/sign-out, completion form, 390 px overflow |
| `e2e/visual-states.spec.ts` (+11 scenarios) | sign-in, refreshing skeleton contrast, refreshed, no-organization, rejected, unavailable-keeps-entries, rate-limited hold, success-into-shell, recovery, account sheet, signed-out notice, unconfirmed sign-out — both themes, desktop/390 |

Runtime: **NOT RUN.** No Docker, SSH or host application test was executed. Early in the task a host `tsc --noEmit` and `eslint` pass was run as a source sanity check before the coordinator ruled that all checks stay in Docker; it is not evidence for acceptance and no further host checks were run after that ruling. Root executes the gate and the browser projects with the commands below.

### Commands for root (Docker, from `apps/web`)

```
docker build -f docker/test.Dockerfile -t elevateo-mail-check .   # check:api, lint, typecheck, vitest --coverage, build, fixture-marker grep
docker run --rm elevateo-mail-check
npx playwright test e2e/session.spec.ts                             # fixture entry, server on 127.0.0.1:4173 (playwright.config.ts)
ELEVATEO_PRODUCTION_URL=<preview origin> npx playwright test e2e/visual-states.spec.ts
```

Unit suites touched by this task, for a targeted run inside the container: `src/data/contract.test.ts src/data/http/transport.test.ts src/data/lifecycle-conformance.test.ts src/data/signal-propagation.test.ts src/data/fixtures/fixtureGateway.test.ts src/app/session.test.tsx src/app/session-lifecycle.test.tsx src/app/Shell.test.tsx src/app/entry.test.ts src/features/auth/SignInPage.test.tsx src/features/auth/AuthCompletePage.test.tsx`.

## Integration inputs still needed from root/backend

1. **Serve the SPA index at pathname `/auth/complete`** (the server's 303 target). The app detects the pathname in `main.tsx`; the rest of the client keeps hash routing. The fixture entry reaches the same component via `#/auth/complete` for browser checks only.
2. **Cookie flags** per contract (`elevateo_session`/`elevateo_challenge`/`elevateo_pending`: HttpOnly, SameSite=Strict, Secure except the isolated Docker HTTP profile) and the exact configured `Origin` for the preview origin; the client sends only `X-CSRF-Token`.
3. **Real-backend browser run** of `e2e/session.spec.ts` semantics against Rails/Auth with Mailpit (invite/recovery link → `GET /auth/accept` → `/auth/complete`), including an expired access JWT reload (one refresh), refresh contention (503 Retry-After 1 is shown as "unavailable"; no automatic retry), and global logout with an expired local session (401 → sign-in).
4. Fixture examples for `AuthLifecycle`/`OrganizationPage` in `contracts/v1/fixtures.json` if the coordinator wants the synthetic ones in `fixtureGateway.ts` replaced by canonical data.
5. `code-reviews.md`: adversarial ≤200-line assignments plus the design reviewer over the files above (about 2.7 k new/changed lines) are still owed before acceptance; none were run by this worker.

## Known limits (deliberate)

- `access_expires_at` is validated but not used to pre-empt expiry; the next 401 triggers the single refresh. No timer-driven refresh exists (contract: never loop).
- A failed organization switch leaves the current identity in place and reports in the sheet; it does not re-bootstrap.
- The completion page is not wrapped by the session provider, so it never reads `/v1/session`; after success the user navigates to `/` and the normal bootstrap runs.
- Fixture-backed behaviour proves client policy, not backend integration.
