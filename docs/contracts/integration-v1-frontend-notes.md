# Frontend notes on the integration-v1 contract

The contract itself is owned by the backend: `docs/contracts/integration-v1.md` and `backend/contracts/v1.ts` in the backend worktree. This file records how the frontend uses it and what it does not provide. Written against backend commit `2305895` ("Add server-owned send recovery and Docker browser sessions"), 5 October 2026. The tested commit pair is in [validation](../validation/2026-10-05-server-recovery.md).

## Routes used

| Route | Used for |
|---|---|
| `GET /v1/me` | whose session the cookie is; scopes and clears what the page holds |
| `POST /v1/session/logout` | sign out; the page stays signed in if this fails for any reason other than 401 |
| `GET /v1/capabilities` | simulated/paused banners, feature availability |
| `GET /v1/mailboxes?after&limit` | mailbox inventory (up to three pages of 100; more is reported as an error, not cut off) |
| `PATCH /v1/mailboxes/:id/permissions` | connected, send, AI read/draft/send switches; the list is always re-read afterwards |
| `GET /v1/mailboxes/:id/quota` | available capacity and held reservations |
| `GET /v1/messages?mailboxId&before&beforeId&limit` | one page of at most 50 summaries; the cursor is kept in the page URL |
| `GET /v1/messages/:mailboxId/:id` | a body, only when opened; must be `text/plain` |
| `GET /v1/send-intents?limit&before&beforeId` | request history, 25 per page; also searched (50 per page) for an idempotency key after a lost answer |
| `GET /v1/send-intents/:id/content` | the exact saved content, read when a request is opened or edited |
| `POST /v1/send-intents` | create under an idempotency key; repeated with the same key and content after a lost answer in the same tab |
| `POST /v1/send-intents/:id/replace` | edit: atomic cancel plus one successor under a new key |
| `POST /v1/send-intents/:id/approve` | approve the exact revision hash |
| `POST /v1/send-intents/:id/cancel` | cancel before dispatch |
| `GET /v1/send-intents/:id` | status, server reason and diagnostic reference |
| `POST /__fixture/session` | Docker fixture builds only: start a session for synthetic user alice or bob |

No other endpoint is called and none is invented. Every response is parsed with zod in `src/data/http/contract.ts`; a response of the wrong shape is an error, never rendered. Requests are same-origin with credentials; every non-GET sends `X-Elevateo-CSRF: 1`. No `Authorization` header is ever sent.

## Behaviour the frontend relies on

- Creating or replacing with an existing key and identical content returns the original result.
- `replacement_conflict` means a successor already exists; the frontend reads the predecessor's `successor_id` and opens that request.
- `approve` on a request that is no longer a draft is refused; the frontend then reads the status instead of approving again.
- A 401 on any request ends the session; all account data is dropped from memory.
- `unknown` is terminal for the client: never polled, no resend, not replaceable.
- The list is ordered by immutable `(created_at, id)`, so a search that continues from a saved cursor does not skip older requests.

## Observed, for the backend's attention

- `POST /:id/cancel` on another account's request answers 409, the same as for an id that does not exist. The contract text says missing or foreign requests return 404. No information leaks (the two cases are indistinguishable, which the browser suite asserts), but the status differs from the text.
- The fixture's refusals use `{error:"code"}` rather than `{error:{code,requestId}}`. The frontend reports them as a generic failure to start the fixture session.

## Gaps (needed before production)

1. No production sign-in or session issuance. Outside the Docker fixture the app can only say "You are not signed in".
2. No lookup of a request by idempotency key. Recovery after a reload reads the list page by page (500 requests per check).
3. Responses do not say which account they belong to. A tab learns of an account change from another tab's marker, from a 401, or by asking `/v1/me` when it becomes visible.
4. No search (`q` must be empty), so the inbox offers none.
5. No push channel; status uses bounded polling.
6. Release time of held reservations is not always known; the UI says so rather than showing a countdown.
