# Suggestions after the backend integration milestone (5 October 2026)

Everything here is a proposal. Nothing in this file has been approved or built. Evidence for the milestone itself is in [validation](../validation/2026-10-05-backend-integration.md); the review record is in [code-reviews.md](../../code-reviews.md).

## 1. Backend contract changes (highest value)

These remove four of the five open review findings. They are requests to the backend owner, not frontend work.

| # | Suggestion | What it fixes |
|---|---|---|
| 1 | Add `GET /v1/send-intents` (paginated, owner-scoped) and return an account id from `/v1/capabilities` or a `/v1/me` route | Send requests no longer need to live in `localStorage`: message text leaves browser storage, requests appear on every device, and the cross-tab write race disappears |
| 2 | Issue sessions from the server as a short-lived HttpOnly, SameSite cookie with CSRF protection and server-side revocation | The token is no longer readable by script; the pasted pilot token goes away |
| 3 | Add a revision-checked draft update, or an atomic "supersede" that cancels one intent and creates its single successor | Two tabs can no longer create two successor drafts; editing stops needing cancel-and-copy |
| 4 | Add lookup of an intent by idempotency key | Recovery after a lost create answer becomes a read instead of a replayed create |
| 5 | Report the release time of held reservations whenever it is known | The UI can say when capacity returns instead of "no known release time" |
| 6 | Add message search (`q`) | The inbox can offer search; today it says search is unavailable |
| 7 | Add a batch status route, later a push channel (SSE) | Fewer requests when several sends are in flight; polling stays as the fallback |
| 8 | Commit the integration contract in the backend worktree and version it | The frontend was tested against uncommitted backend work; a committed contract makes the test result repeatable |

## 2. Frontend follow-ups

| # | Suggestion | Reason |
|---|---|---|
| 1 | Guard send-record writes with the Web Locks API until suggestion 1.1 lands | Closes open finding 1 (two tabs writing at the same instant) |
| 2 | Refuse a new draft once 100 unfinished requests exist, with a clear message | Closes open finding 5 |
| 3 | Add an expiry and a "forget requests on this device" control for stored send records, and say plainly on the Send requests page that message text is kept in this browser | Reduces exposure of open finding 2 until the server can list requests |
| 4 | Enforce the response size cap while streaming, not after reading | A response with no declared length is still read in full before being refused |
| 5 | Add browser tests for: session expiry seen from a second tab, an account change without sign-out, and markup in a message body shown literally | Gaps recorded in the review; covered today only by unit tests, the schema and the plain-text element |
| 6 | Wire campaigns, contacts and the assistant to the server one area at a time, each behind its capability flag, keeping the unavailable page until the route exists | Keeps incomplete features honest |
| 7 | Add a Content-Security-Policy to the API build (no inline script, same-origin connect only) | Limits what injected script could do while the token is still in `sessionStorage` |
| 8 | Decide whether the demonstration build should keep shipping once the API build covers the same areas | Two builds double the browser-test surface |

## 3. Testing and tooling

| # | Suggestion | Reason |
|---|---|---|
| 1 | Run the integration stack in CI on every push to either repository | Local Docker runs are not a substitute for a required remote check |
| 2 | Pin the backend commit the integration tests ran against in the validation file each time | Makes results traceable |
| 3 | Fix `docker build` over the `fleet02` SSH context (it failed intermittently with "file already closed"); sources were copied to the host by tar instead | Removes a manual step |
| 4 | Fix the Codex sandbox on this laptop (it could not start a shell: "ShellExecuteExW failed to launch setup helper: 1223") | Reviewers had to be given code inline and could not open other files, which produced three false findings |
| 5 | Agree a scoped Docker cleanup rule for the shared build host | The standing rule asks for global `builder prune -a` and `image prune -a`; on a shared host those can disturb another task's build, so only this task's named resources were removed |
| 6 | Do a manual click-through of the API build in a desktop browser | Visual checks so far used screenshots captured from the real application on the build host, and only a sample was inspected by eye |

## 4. Decisions needed from Tanzeel

1. Approve or amend the backend contract requests in section 1, and say which come before the first real provider connection.
2. Whether keeping message text of send requests in the browser is acceptable for the ten-user pilot, or whether suggestion 1.1 must land first.
3. Whether signing in as a different account on a shared browser should keep deleting the previous account's stored requests (current behaviour, as required) even when one of them is still unconfirmed.
4. Whether a mailbox needing re-authorisation should lose AI access (it now does in the demonstration build).
5. Approval of `.planning/BACKEND-STANDARDS.md`, which is still a draft.

## 5. Process note

While stopping a stuck reviewer on 5 October, every `codex.exe` process on the laptop was killed, not only the reviewer's. Three processes ended. If another agent was running under Codex at that moment it was interrupted. Future runs should stop reviewers by process id.
