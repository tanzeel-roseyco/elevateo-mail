# REPLY901 — conversation reply entry

Owner: Mira FE806. Base: Mira `813fa10dbff9089f20103919210cf684bb6c8123`, aligned with Cassian integrated `215080a4ed74a56f33c06113ea616170443a91f2`. Actual author identity: Codex GPT-6 in Orca; service tier and billing are unverified. No host/application tests, Docker, browser requests, live mail or credential work by Mira.

## Change

`apps/web/src/features/thread/ThreadPage.tsx` now routes the top Reply as draft control through the same `replyToMessage` function used by each message. Without a URL selection it chooses the latest loaded message with a usable sender. With `?message=UUID`, it only uses that selected loaded or authorized direct-read message; loading, missing, denied and senderless selections cannot fall back to a different sender. A disabled action has a visible explanation. The existing draft intent retains the bounded `Re:` subject, sender address and `reply_to_thread_id` only after an authorized draft read; no recipient or subject is placed in the URL. No Reply All, API, gateway, attachment or send change.

`ThreadPage.test.tsx` adds source regressions for the top happy path without implicit save, missing sender, conversation loading/error, selecting a loaded older message, selected direct message pending then resolved, and denied direct message. Existing per-message reply, permalink and context tests remain in place.

## Verification request and limits

Soren alone should run on the exact source SHA in a fleet-02 Docker container: `cd apps/web && npm run typecheck && npm run lint && npm run test -- src/features/thread/ThreadPage.test.tsx`. On Cassian's integrated successor, request the affected draft editor/thread suite and browser checks: top reply from a two-sender conversation, selected deep-link after reload, unavailable selected message, and a 390px layout with keyboard focus. Ask for exact SHA, command exits, logs and disposable cleanup receipt. These are **REQUESTED, NOT_RUN** by Mira; no runtime PASS is claimed.

Independent bounded adversarial review is pending. Review the changed `ThreadPage.tsx` source and focused tests for selected-message ownership, stale direct responses, sender validation, draft intent binding, URL back/filter behavior and disabled accessibility; record covered lines and defects/KLOC in `code-reviews.md`. Cassian owns central integration and any conflicting shared documentation.
