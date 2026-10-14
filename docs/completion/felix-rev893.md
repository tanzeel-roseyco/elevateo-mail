# Felix REV893: pinned Mailpit SMTP type repair

Independent static review of Rhea `afc5fd6365a31dfcb13d4257186d084c307ff4f8` against parent `c5a8737`, plus pinned upstream APIs. Actual reviewer: Orca Codex `gpt-6-sol` on local host; requested LOW tier is not independently verified billing. No application tests, Steep, builds, Docker, or network SMTP connection were run by Felix. Runtime status: **NOT_RUN**; Soren owns fleet execution.

## Exact bounded coverage

| Versioned source and integrity | Lines | Unique LOC |
| --- | ---: | ---: |
| Rhea `apps/server/lib/elevateo/send_worker/smtp_transport.rb`, Git blob `714b9b308f4502142b410f5f79a16dca2ed5ec72` | 1–90 | 90 |
| Rhea `apps/server/sig/send_worker/net_smtp_local.rbs`, Git blob `9f255538d7d46344016b3a3070402d689e3152de` | 1–8 | 8 |
| Rhea `apps/server/test/send_worker/smtp_transport_test.rb`, Git blob `94414f2f549efa2765578297ccb5f92b2ddc9246` | 1–124 | 124 |
| [net-smtp v0.5.2 runtime source](https://github.com/ruby/net-smtp/blob/v0.5.2/lib/net/smtp.rb), downloaded SHA-256 `62511f616fdab971738f7c3141b4f74e1b55ccfd7811743ba663b6250f` | 240–260, 338–375, 399–412 | 73 |
| [RBS v4.2.0 net-smtp declaration](https://github.com/ruby/rbs/blob/v4.2.0/stdlib/net-smtp/0/net-smtp.rbs), downloaded SHA-256 `2827cc2c45bee96cc058df0f601cca677529bd1f486e4cb29dffc33b21bbf6d0` | 41–53 | 13 |

**308 unique versioned source LOC** total in reads of 98, 124, 73, and 13 LOC, each below 180 and total below 350. This includes 222 project LOC and 86 upstream LOC. Upstream downloads were read only at the numbered slices; no whole-source dump or test execution. Excluded: remaining upstream implementation, other worker/profile classes and tests, compiled Steep behavior, live SMTP, and changed README/state/documentation prose beyond file-change inventory. Conclusions apply only to the covered paths.

## Findings

**Zero confirmed defects, 0.00 defects/KLOC (0/308).** The bundled RBS v4.2.0 class has only constructor and send declarations in its SMTP body (lines 41–49); the supplemental local declaration adds `disable_tls` and `disable_starttls` without replacing those methods. net-smtp v0.5.2 defines both methods (lines 360–363, 404–407). Each ends with an assignment of `nil`, compatible with the supplemental `() -> void`; `tls?` and `starttls?` expose the resulting false flags (lines 340–342, 370–372). Its constructor sets initial `starttls: :auto` without connecting (lines 240–260). Rhea's default factory constructs `Net::SMTP`, then disables both modes before `start` (transport lines 48–49, 73). The added regression obtains that factory, calls it without connecting, and asserts a real `Net::SMTP` with both flags false (test lines 43–49).

The transport still rejects a non-`SmtpProfile` and a nonlocal Mailpit profile, holds remote profiles before client creation, validates attempt and snapshot data, and rejects a non-`.invalid` recipient before delivery (transport lines 16–35, 45–53). Existing tests cover simulated acceptance, uncertain response without replay, invalid snapshot/real-recipient rejection, held remote profile, preflight failure, and expired-after-submission uncertainty (test lines 51–123). The change introduces one small type declaration and one focused regression, without new data structures, loops, hot-path queries, or duplicated policy. Names and AIDEV comments explain why the local signature and nonreplay boundary exist. Null/empty/maximum input and external authorization behavior outside these paths were not proved by this review. README, state, and documentation each changed by two lines in the commit; their prose and runtime truth require separate acceptance.

Soren must run the pinned backend Steep check and targeted SMTP transport test in fleet Docker to establish that local RBS merging and the default factory work in the application environment. No performance budget or runtime PASS is inferred from source review.
