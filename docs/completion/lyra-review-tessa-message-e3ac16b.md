# QA816 bounded adversarial source review — logout readiness and message permalink

Reviewer: Lyra FE808. Exact candidate: Tessa `e3ac16b9ebc9665db5f634fab612e63dc0df62ec`, with the logout repair from ancestor `c151ecd`. Static source review only; no Docker, browser, application test, source-owner edit, or screenshot acceptance was performed.

## Coverage and read limit

- `tests/acceptance/playwright/qa816-outreach.e2e.ts`: `c151ecd` **15 changed LOC** in imports and logout case; bounded context through lines 81–112 (within the 90-line context limit).
- `tests/acceptance/playwright/qa816-message.e2e.ts`: exact `e3ac16b` lines 1–59 (**59 new LOC**), SHA-256 `9567464119cdbf4c1c60f14ee74f8792ca79b39dc011ca17861fcb697f84e502`.
- `tests/acceptance/playwright/screenshots.ts`: exact `e3ac16b` three-ID allowlist delta (3 changed LOC); bounded lines 26–44 only.
- Supporting source context: `support.ts` lines 1–28, `transport-barrier.ts` lines 1–50, current integrated V2 gateway lines 37–51, and current integrated `App.tsx` lines 17–34. Approximately **230 unique versioned code LOC** were inspected in all, below the 250 packet target and 350 hard cap; no individual read exceeded 180 LOC. No other screenshot/visual packet was reviewed; Ada ADV050's D/B coverage was not repeated.

## Result

**Zero confirmed defects across 77 unique changed/new LOC = 0 defects/KLOC.** This is a source-only judgment, not runtime PASS.

The `c151ecd` logout case observes an authenticated `/v2/organizations/{id}/grants` 200 response, parses a nonempty UUID grant item, waits for that exact UUID to be visible in People, then signs out and checks sign-in plus absence of the marker on both protected deep links. The marker is real response data, so an unpopulated loading state cannot satisfy the pre-logout witness; the post-logout assertions check rendered cache absence and `/v1/session` 401.

`SCN-QA-823-P` checks a same-page message link, keyboard activation, selected seeded plaintext, reload, focus and mobile screenshot. It intentionally does **not** claim a direct-message endpoint read. `SCN-QA-823-F1` starts `responseAt` before navigating to a URL with an absent message UUID and requires an exact-path `/v2/threads/{thread}/messages/{message}` 404 plus unavailable UI. `SCN-QA-823-F2` intercepts that exact GET path with a no-forward transport loss, checks the error, then requires an explicit retry to reach the real endpoint and return 404. The integrated gateway constructs the same path; `responseAt` compares origin, pathname and method. Missing feature-gateway injection or absent route would make these cases time out/fail rather than pass silently.

The three new screenshot IDs match the three uses in `qa816-message.e2e.ts` and enter the existing allowlist; this review did not inspect or claim the full screenshot persistence/privacy implementation. The direct URL success case for a seeded later-page message, real browser execution, exact server route activation, mobile visual acceptance, and no-live-sending behavior remain outside this packet's runtime evidence. The tests rely on the accepted real-auth seed and optional V2 feature gateway being installed in the integrated app; source inspection alone cannot prove those dependencies at runtime.

No source repair is requested from Tessa on this packet. Root/Cassian were sent the static result; Soren alone can run the fleet acceptance container and report actual statuses, screenshots and cleanup.
