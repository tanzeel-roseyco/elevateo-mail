# Handover — server-owned send requests and cookie session (5 October 2026)

Branch `design/fable-frontend`, on top of `a5aa594`. Backend `2305895`. Not pushed, not deployed. The application is not complete. This supersedes the "Not done" list in the [previous handover](2026-10-05-backend-integration.md).

## What changed

- `src/data/http/live.ts` was rewritten. It holds one page of request history, up to twenty opened requests with their saved content, and the unanswered submissions. It no longer stores send records in the browser.
- `src/domain/sendLifecycle.ts`: local-only statuses (`local_draft`, `unconfirmed`) and the stored record type are gone. New: `pendingKeySchema`, `MAX_PENDING_KEYS`, `canStartSubmission`, `canReplace`.
- `src/data/http/httpClient.ts` sends the cookie and the CSRF marker; there is no token anywhere. `httpGateway.ts` gained `me`, `logout`, `listSendRequests`, `getSendContent`, `replaceSendRequest` and the fixture sign-in.
- Pages: `SignInPage` (no token field), `ComposePage` (memory-only form; `?replace=<id>`), `SendsPage` (server-paged list, unconfirmed panel, earlier-version panel), `paging.ts` (cursor-in-URL helper shared with the inbox).
- `integration/harness.ts` runs the backend's own `startBrowserFixture`; `integration/compose.preview.yaml` serves the stack for a manual click-through.

## Things to know before changing it

- The pending key must be stored before the request leaves. `safeStorage` refuses writes when storage is unavailable, so a submission is refused rather than made untraceable.
- A pending key is removed only when the request has been found or read, or when the end of the server's list proved it absent and the person dismissed it.
- Do not add a path that deletes `elevateo:sends:*` records other than `discardLegacy` and the content-verified match in `serverHolds`.
- Every async action captures `epoch`; `dropAccountData` bumps it. Request-state reads are also ordered per request (`beginRead`/`latestRead`).
- The router is mounted only while the session is `ready`, so anything typed in Compose is unmounted when the account changes.
- Review tooling: reviewers are started directly and stopped only by their own recorded process id. Never stop processes by image name.

## Not done

- Production sign-in (no server route exists).
- The open P2 and the gates listed in [validation](../validation/2026-10-05-server-recovery.md).
- Campaigns, contacts, assistant, provider connections, DNS, enrichment and search remain unavailable in the API build.
- Uncommitted planning documents in this worktree (`.planning/BACKEND-STANDARDS.md`, `docs/backend-blueprint.md`, `docs/connections/README.md`, `docs/product-master-plan.md`, `docs/research/2026-10-04/README.md`) and `output/`, `tmp/` were left untouched and are not part of these commits.
