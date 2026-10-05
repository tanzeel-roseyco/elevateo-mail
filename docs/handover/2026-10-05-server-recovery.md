# Server-owned send recovery handoff — 2026-10-05

Backend branch: feature/backend-foundation, continued from 5fe7193. Frontend reference: design/fable-frontend 5973eb4 and documentation a5aa594. No frontend worktree changes.

## Contract and frontend changes

Canonical handoff: [integration-v1](../contracts/integration-v1.md). Portable strict runtime schemas: backend/contracts/v1.ts; cookie-default consumer: backend/integration/client.ts.

- GET /v1/me supplies a stable opaque accountId and session expiry. Use this identity to scope UI state and discard stale asynchronous responses on account changes.
- GET /v1/send-intents supplies owner-only summaries, descending immutable creation time plus ID, limit 1–50 (default 25), and paired before/beforeId cursors. Refresh the first page for new requests; this is not a snapshot.
- GET /v1/send-intents/:id/content lazily supplies the saved immutable recipients, subject and plaintext body, with digest validation. Existing status-only GET /:id remains unchanged.
- POST /v1/send-intents/:id/replace atomically cancels an eligible predecessor and creates one unapproved successor. Send revision plus a complete draft with a new idempotency key. Identical retries return the saved successor; competing content/key returns replacement_conflict. Follow successor_id after a lost response. Never retry with fresh keys blindly.
- POST /v1/session/logout revokes this session and expires its cookie. It accepts no body or query.

Remove recipients, bodies and bearer tokens from frontend persistent storage. Load requests from the server after account discovery and fetch content when opening one. Small UI preferences may remain locally; do not infer approval from them. Clear prior sensitive browser records during frontend migration. Preserve account-epoch guards and render plaintext only. These changes address the frontend handover's localStorage recovery, tab replacement and JavaScript bearer findings; frontend implementation/visual verification remains its owner's task.

## Session boundary and fixture run

Follow [Docker fixture instructions](../integration-fixtures.md). Build backend/Dockerfile, run the check image, then run its fixture command with port 8787 mapped to 127.0.0.1. Preserve Host through the frontend same-origin proxy for both /v1 and /__fixture.

Docker's separate proxy provisions alice/bob with POST /__fixture/session and X-Elevateo-CSRF: 1. Tokens appear only in Secure, HttpOnly, SameSite=Strict, Path=/ cookies, never JSON or frontend configuration. Sessions last fifteen minutes, are checked against D1 on every request, and cannot be revived after expiry/revocation. Unsafe cookie requests require matching Origin and the CSRF marker; cross-site metadata is rejected. No CORS support or production session minting exists. Production IdP/HTTPS integration remains separate.

## Safety, bounds and migration

Replacement cannot affect dispatched, accepted or unknown outcomes and cannot approve, reserve quota or send its successor. Existing exact-content approval, permissions, suppression, pause, quota reservation and bounded reconciliation remain authoritative. AI read/draft/send permissions remain separate.

Migration 0008 adds stable account identities, immutable created_at and an owner-scoped successor mapping. Legacy creation times use migration-time updated_at values rather than reconstructed history. Indexed list reads return at most 51 rows; content reads one owned envelope only. Replacement uses one three-statement D1 transaction and fixed-size lookups, with no unbounded retry loop. No hosting price or production concurrency guarantee is inferred.

Design simulations: identical tabs converge on one successor; differing tabs produce one winner and one conflict. Dispatch winning first prohibits replacement; replacement winning first cancels the parent and leaves a draft. A request inserted between pages is found by a first-page refresh; tied timestamps use the ID tie-breaker. Revocation after provisioning prevents the cookie from authorising a request. Local reasoning was used because no Obsidian connection is available.

## Combined run and remaining gates

Run the frontend against this backend's cookie proxy, verify browser cookie acceptance/HttpOnly isolation, reload recovered drafts, account switching, two-tab replacement conflicts, logout/expiry, plaintext previews and pending/error states. Backend HTTP tests replay cookies through the real proxy; actual browser acceptance and visual QA are not claimed here.

This is an integrated simulated backend milestone, not production readiness. Real OAuth/IdP, live providers, inbox synchronisation, campaign wizard execution, history import, desktop/AI bridge, independent backups and cloud load validation remain incomplete. Agree production quota/authentication/AI scopes; complete combined browser QA and staging recovery; supply least-privilege credentials last. External sending, DNS changes, push and deployment remain disabled.
