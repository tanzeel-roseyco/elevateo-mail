# Validation: server-owned send requests and cookie session (5 October 2026)

This records what was run and inspected. It does not claim the application is complete: only the areas the backend serves today (sign-in by fixture, inbox, messages, compose, send requests, mailbox list) were exercised, against a simulated provider. No real email was sent, nothing was pushed or deployed.

## Tested revisions

| Side | Commit |
| --- | --- |
| Frontend (`design/fable-frontend`) | `0eb6bfcd5ec148cba4093a201e4a61e551927614` |
| Backend | `2305895322873187cec6520ed1a5f103531c4f19` |

Both were exported with `git archive` from those exact commits and built in Docker on fleet-02; no working-tree files were included. The commit that adds this file changes documentation and evidence only, so the tested frontend source is `0eb6bfc`.

## Automated checks (Docker, fleet-02)

| Check | Result |
| --- | --- |
| Lint, typecheck | clean |
| Unit and component tests | 294 passed |
| Demo-build browser tests | 45 passed, 1 intentionally skipped |
| Real-backend browser tests | 25 passed of 25 (2.8 min) |
| JS gzip, demo build | 70.14 KB + 112.99 KB |
| JS gzip, API build | 70.14 KB + 94.78 KB (budget 250 KB) |

The full real-backend run is in [real-backend-run.txt](2026-10-05-server-recovery/real-backend-run.txt). Its last line, `server-1 | npm error command failed`, is the backend container being stopped after the tests finished, not a test failure.

What the real-backend suite covers:

- **Concurrent tabs:** two tabs replacing the same request end with one successor, which still needs its own approval; two tabs approving at once approve once; a change in one tab appears in the other; signing out or switching account in one tab ends the other.
- **Lost responses:** the answer to create, approve and replace is dropped after the server acted; "Check again" finds the server's result without repeating the action. A submission the server never received is reported as not saved.
- **Reload:** an unanswered submission is recovered from the server list after a reload.
- **Expired session:** the next request returns to sign-in and account data is cleared from memory.
- **Account isolation:** the second account sees none of the first account's messages or requests, and cannot read, cancel or replace them by id.
- **More than 100 unfinished requests:** 106 are paged from the server, none dropped, none written to browser storage.
- **Legacy browser records:** removed only when the server holds the same content under the same key; otherwise kept and counted until explicitly discarded.
- **Also:** server outage, bounded status polling, unavailable areas, and visual states in both themes at desktop and phone sizes.

## Live click-through

The same commit pair was run as a Docker stack on fleet-02 and opened at `http://localhost:4174` through an SSH port forward, in an isolated browser context. Each stop below was reached by clicking through the application and its screenshot was looked at.

**Desktop 1440×900, light**
- Fixture sign-in screen, loading skeleton, inbox with 50 rows.
- After sign-in: `sessionStorage` empty, `document.cookie` empty (session cookie is HttpOnly), `localStorage` holds only the account marker.
- Open a message, Reply: browser history state holds only the mailbox id and message id.
- Compose, review, submit: "Awaiting approval". Approve: "Accepted by provider" with the "Simulated provider · no real email" label.

**Desktop 1440×900, dark**
- New compose and submit. "Edit as a replacement" opens the form filled from the server's saved content.
- Review and replace: the successor is "Awaiting approval"; the list shows the old request as "Cancelled · Replaced"; the old request shows an "Open the replacement" link and no action buttons.

**Phone 390×844, dark**
- `/sends` reloaded: three rows read from the server. Open the successor and approve: "Accepted by provider".

**Phone 390×844, light**
- Accepted request detail. Connections → Mailboxes shows "28 of 30 available · 2 accepted · 0 held".
- Sign out: `/v1/me` returns 401 and storage holds only markers. Sign in as the second fixture account: only that account's inbox, zero send requests, nothing from the first account.

No horizontal overflow at any stop. One observation: send-request list rows show no subject, because the server list does not return one.

Not clicked through by hand (covered by the automated suite only): lost responses, outage, expired session, the 106-request list, legacy records.

## Screenshots

In [2026-10-05-server-recovery/](2026-10-05-server-recovery/), taken by the real-backend suite on the tested pair: sign-in, loading, compose, review, send lists, accepted, replaced, unconfirmed, not saved, outage, session expired and the 106-request list, across light and dark, desktop and phone.

## Reviews

Scoped adversarial reviews and the design-tradeoff review are recorded in [code-reviews.md](../../code-reviews.md): 15 confirmed source defects in 2,571 lines (5.8 per KLOC), 14 fixed, 1 open. Each reviewer was started as its own process and stopped by its recorded process id; no process was stopped by name.

## Cleanup

- Removed on fleet-02: the preview stack and its containers, images `elevateo-mail-it-web` and `elevateo-mail-it-server`, the dangling images from this task's builds, and the exported source copies under `~/elevateo-it2`.
- Kept on fleet-02: `~/elevateo-it2/*.log` and `revisions.txt` (152 KB).
- No volumes were pruned and no other task's containers, images or caches were touched. Disk after cleanup: 141 GB used, 274 GB free.
- Local: SSH forwards stopped by their own process ids; the browser page closed.

## Remaining findings

Open defect:
- **P2:** the limit of 20 unanswered submissions per account is not atomic across tabs, so two tabs submitting at the same moment can reach 21. Nothing is lost.

Limits that need the backend:
- There is no production sign-in; only the Docker fixture session exists.
- There is no lookup by idempotency key, so recovery reads up to 500 list rows per check.
- Responses carry no account id, so an account change is detected by `/v1/me` and the cross-tab marker rather than per response.
- List rows carry no subject.
- Cancel returns 409 for a foreign or missing id where the contract says 404.
- The fixture sign-in error shape differs from the `/v1` error shape.

Frontend limits:
- Legacy browser records beyond the first 200 are not checked in one pass; they are kept, not deleted.
- Compose text is held in memory only and is lost on reload, by design.

Not available in the API build: campaigns, contacts, the assistant, connection setup, DNS checks and search. Real providers remain disabled.
