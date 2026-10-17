# REV875 — Tessa later-page acceptance and Cassian missing-parent regression

Independent static review by Lyra FE808, Codex worker in Orca terminal `term_e324d4a8-6f89-4c59-816b-19ff39caa104`. Exact sources: Tessa `bc02fc1b929dc05061fbda3335d71f43770eca6f` and Cassian `6e987853be5e81e717e8e8312e38d89702586089`. No application test, Docker, browser, Rails request or PostgreSQL execution was performed; Soren alone schedules fleet runtime. Formatting belongs to lint.

## Exact coverage and provenance

| Source | Versioned lines | Unique LOC | Git blob |
| --- | ---: | ---: | --- |
| Tessa `tests/acceptance/qa816-later-page-seed.rb` | 1–88 | 88 | `84acc459f45a50edddc90b5770f2baef00f3cf15` |
| Tessa `tests/acceptance/playwright/qa816-later-page.e2e.ts` | 1–43 | 43 | `2c71463e3fe215fde10013f32d67019e2f4fb289` |
| Tessa `tests/acceptance/playwright/screenshots.ts` | 76–78 | 3 | `9e47e781de65960d4018e3d16da7c38c08c5b56d` |
| Cassian `apps/server/test/outreach_sequence/controller_test.rb` | 14–41, 45–110 | 94 | `494be3e74c2f72d41f1eef4a8ad569ded7cb5df7` |
| Bounded context, Tessa `apps/server/lib/elevateo/thread_reads.rb` | 50–105 | 56 | Not hashed in this packet |
| Bounded context, Tessa `ops/tests/be02/acceptance_seed.rb` | 85–110 | 26 | Not hashed in this packet |
| Bounded context, Tessa `tests/acceptance/playwright/support.ts` | 12–23 | 12 | Not hashed in this packet |

Total **322 unique versioned LOC**, with each read at most 134 source LOC and below the 350-LOC target. Tessa's Packet F manifest at `a269cac` records the three file SHA-256 values `561b2f0a94da32b1c4ebb91ef7bf23a1898bc9f14b5d9076f9d28d85e679d933`, `c9a881ef916dd5015023fa0706499cc1189d7bd6e6d892270f87079269d62ee5`, and `2feb44dafe05fcee7031504498c89a031d6e9701a909374e35db1a4e666f0c72`, respectively. These are manifest assertions, not independently recomputed byte hashes in this review.

## Result

**Confirmed defects: 0; density 0/KLOC over 322 credited LOC.** This is static evidence only.

Tessa's seeder requires local mode, outbound hold, the fixed private `db:5432` admin endpoint, a private `/acceptance` directory and a valid base runtime seed. It checks the target thread has exactly one message, inserts 20 UUID-identified synthetic messages in one transaction, verifies a count of 21 and writes a mode-0600 sidecar exclusively. Failure rolls back the transaction while inside it; failures after commit print a discard instruction for the entire disposable fixture. There is no in-place deletion, shared-data cleanup or destructive prune in the reviewed source. The run plan in the packet manifest assigns disposable stack cleanup to Soren; that cleanup was not executed here.

The base seed's primary message uses `ordered_at`; all 20 inserted messages have strictly later timestamps. The reviewed V1 message query sorts `sent_at ASC, id ASC` with a 20-item first-page maximum. Thus the target `ids.last` is the 21st message, outside that first page. The browser case registers `responseAt` before navigating directly to a hash URL with the target message ID; the observer requires the exact V2 pathname, method GET and app origin. It asserts HTTP 200, the selected message's unique marker, a 21-message count, a visible “Show more messages” control and the marker again after reload. These oracles cannot pass solely from the first-page list or an unrelated direct GET, although real FE806 navigation and Auth/API behavior remain unexecuted.

Cassian's regression resets the fake draft repository in setup, makes the campaign repository raise `not_available` on detail, then dispatches a real controller `PUT` with current session, context and CSRF headers. It asserts a 404 `not_available` result, exactly one parent lookup and no draft save. The existing happy path and malformed input tests remain; the new oracle is specific to a missing/inaccessible parent. It does not prove database rollback or a real tenant boundary because the repositories are fakes.

Excluded: full Playwright support/case machinery, actual browser screenshot/privacy admission, every live route flag, real database seeding/cleanup, real tenant/permission checks, full sequence controller implementation and integrated runtime. Soren fleet execution and exact disposable resource absence are pending.
