# Frontend notes on the integration-v1 contract

The contract itself is owned by the backend: `docs/contracts/integration-v1.md` and `backend/contracts/v1.ts` in the backend worktree. This file records how the frontend uses it and what it does not provide. Tested against backend `49fc23e` plus that worktree's uncommitted integration work on 5 October 2026.

## Routes used

| Route | Used for |
|---|---|
| `GET /v1/capabilities` | sign-in check, simulated/paused banners, feature availability |
| `GET /v1/mailboxes?after&limit` | mailbox inventory (up to three pages of 100; more is reported as an error, not cut off) |
| `PATCH /v1/mailboxes/:id/permissions` | connected, send, AI read/draft/send switches; the list is always re-read afterwards |
| `GET /v1/mailboxes/:id/quota` | available capacity and held reservations |
| `GET /v1/messages?mailboxId&before&beforeId&limit` | one page of at most 50 summaries; the cursor is kept in the page URL |
| `GET /v1/messages/:mailboxId/:id` | a body, only when opened; must be `text/plain` |
| `POST /v1/send-intents` | create under an idempotency key; replayed with the same key after a lost answer |
| `POST /v1/send-intents/:id/approve` | approve the exact revision hash |
| `POST /v1/send-intents/:id/cancel` | cancel before dispatch |
| `GET /v1/send-intents/:id` | status |

No other endpoint is called and none is invented. Every response is parsed with zod in `src/data/http/contract.ts`; a response of the wrong shape is an error, never rendered.

## Behaviour the frontend relies on

- Creating with an existing idempotency key and identical content returns the original intent. This is the only recovery path when the create answer is lost, because the intent id is not yet known.
- `approve` on an intent that is no longer a draft is refused; the frontend then reads the status instead of approving again.
- A 401 on any request ends the session; all cached account data is dropped.
- `unknown` is terminal for the client: it is never polled and never offers a resend.
- Provider references are never shown as proof of delivery; only the diagnostic correlation id is shown, for `unknown`.

## Gaps (needed before production)

1. No session issuance: a pilot token is pasted and kept in `sessionStorage`. An HttpOnly session cookie would remove the token from script reach.
2. No account id and no endpoint listing send intents. Records are therefore kept in `localStorage` under a hash of the token, are per-browser, and contain message text.
3. No search (`q` must be empty), so the inbox offers none.
4. No way to edit a draft intent or supersede one atomically: editing is cancel, then a new key and a new approval. Two tabs can each create a successor draft; each still needs its own explicit approval.
5. No push channel; status uses bounded polling.
6. Release time of held reservations is not always known; the UI says so rather than showing a countdown.
