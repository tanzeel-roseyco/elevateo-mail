# QA-817 independent FE806/FE807 bounded source review

Reviewed Mira `bae1ae610ac518ba6cd4bfcb83867203b15fabb9` in `completion-mira-fe806` and Celeste `25849a64467449817a68fa5077a89149b621ca56` in `completion-celeste-fe807`. Reviewer runtime identity: Codex `gpt-6-sol`, task `task_c22652d95d64`, dispatch `ctx_4525180f69f2`. Static source review only; Felix ran no test, build, Docker job, browser, or benchmark.

## Exact coverage and budget

| Exact source | Numbered lines read | Unique LOC | SHA-256 |
| --- | --- | ---: | --- |
| Mira `apps/web/src/features/thread/MessageAttachments.tsx` | 1–145 | 145 | `50f78ee1145c240b917fcb051e91a6d36462e159905e7eb8617dc3b6cb55cb99` |
| Mira `apps/web/src/features/thread/MessageAttachments.test.tsx` | 1–35, 72–145 | 109 | `94542cbc6c8be6e43358ccb2784e919dcc3a94dde41d87da974e8c0f7e3f67f7` |
| Celeste `apps/web/src/app/features/index.test.tsx` | 1–96 | 96 | `7806b7604a63839475c576d50660cda32fe9c5c2bdf0221a7ebd18e532ea5c56` |

Three source reads of 145, 176 and 29 LOC; **350 unique versioned LOC**, exactly the assigned cap and each read at most 180. Excluded at cap: Mira test lines 36–71 and 146–168, component callers/DTO adapters, Celeste route implementation, and all other source/tests. No additional code was read. **One confirmed static test defect / 350 LOC = 2.86 defects per 1,000 reviewed LOC**; runtime defects and performance are unknown.

## Finding

**MEDIUM — Celeste preferences test does not prove current session context.** In `index.test.tsx` lines 65–81, the fetch stub echoes the request's `X-Session-Context` and `X-Authorization-Version` into its response, then the test checks only that `Fixture user A` renders and a GET occurred. It never asserts either header is present or equals the fixture's current context/version. A missing or stale header can be echoed while `display_name` still renders, so the test can pass without the behavior named in its title. **Fix:** assert the exact expected current context and version from the fixture, or switch context and prove the request changes; retain the display-name happy-path assertion. Celeste and root were notified immediately in `msg_8c2eadd4a32b` and `msg_75a75213906b`. No application runtime has established failure; this is a confirmed oracle weakness.

## Purpose, boundaries and remaining evidence

Mira's component allows bytes only for exactly `clean` rows with a safe filename and integer size 1 through 10 MiB (component lines 26–35). Rejected zero-byte rows render a generic blocked message with no download button and no rejection reason (37–43, 135–139), directly exercised by the new test (test lines 87–98). An unknown runtime status fails closed: it is not `clean`, gets the generic unavailable label, and cannot reach `download` through the rendered button. That fallback is source-supported but an explicit unknown-status test was not present in the reviewed slices. The clean branch still presents the download button and checks the returned Blob size before creating a URL (83–115, 135–139); the clean test's final assertions fall in excluded test lines 36–71, so its complete oracle was not reviewed here.

The component uses bounded page size 50 and a 1,000-item local cap, deduplicates by ID, validates filenames at the boundary, fences duplicate clicks, and revokes temporary blob URLs on owner exit. No unbounded loop, direct secret exposure, or new authorization bypass is evident in this packet. The gateway is responsible for fresh authorization and clean verdict; that server/adapter boundary was excluded. Clear naming and why-comments describe the privacy and lifecycle intent. The branch includes tests for rejected, pending, malware, invalid filename, zero-byte clean, held byte proxy, Blob mismatch and revoked session in the reviewed slices; Soren must execute them. No measured hot-path budget or browser acceptance is inferred.

Celeste's route test explicitly counts **12** Outreach paths and requires the campaign sequence route (lines 43–49), preserving that contract. Its campaign happy path and unavailable fallback are asserted (52–63). The separate real V2 adapter case expects no dispatch and the owner's unavailable status (87–94); this does not weaken the route-count or current-context requirement. Null/empty/max handling in the route implementation, and whether the preference response rejects missing context, remain outside the source cap.

**Soren fleet request:** run exact integrated affected frontend test/type/lint gates; retain the rejected zero-byte, unknown-status, clean-download, route-count/sequence and current-context assertions. Report exact SHA and observed cases; no Felix test or performance number is claimed.
