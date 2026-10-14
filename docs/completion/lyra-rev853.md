# REV853 — Elara concurrency oracle and Theo guard typing

Independent static review by Lyra FE808, Codex worker in Orca terminal `term_e324d4a8-6f89-4c59-816b-19ff39caa104`. Exact source commits: Elara `cc2ac33cb9eab3c847b2b4e6633887d464b6a4d6` in `completion-elara-send811`; Theo `f12d25c335763a33a1a384ad8a8023e28fdac824` in `completion-theo-adm803`. No Docker, application tests, host tests, PostgreSQL race execution or production operations were performed. Formatting belongs to lint.

## Exact bounded coverage

| Source at named commit | Lines read | Unique LOC |
| --- | ---: | ---: |
| Elara `test/be_02/mailbox_membership_concurrency_test.rb` | 1–115 | 115 |
| Elara `test/be_02/mailbox_membership_database_helper.rb` | 75–93, 121–188 | 87 |
| Theo `organization_grants_controller.rb` | 152–168 | 17 |
| Theo `user_display_preferences_controller.rb` | 26–49 | 24 |
| Theo `sig/write_controller.rbs` | 1–11 | 11 |
| Theo `v1/write_controller.rb` | 1–44 | 44 |

Total credited: **298 unique versioned LOC**, with no read exceeding 180 source LOC and below the 350-LOC task target. The exact commit diffs and documentation file lists were inspected; overlapping diff/context lines are counted only once above. Uncovered: the remainder of the Elara test/helper, the SQL implementation and real PostgreSQL scheduling, other V2 controller methods, full Rails request routing, generated TypeScript contracts and Docker runtime. Those paths are not silently accepted by this packet.

## Findings and assessment

**Confirmed defects: 0; density 0/KLOC across 298 credited LOC.** This is a static finding count, not a runtime PASS.

Elara's first changed test binds the revision holder to `@identity`, the owner; its previous UUID sort could put a sales manager in that role, conflicting with SEC802's peer-rank restriction. The owner and peer both remain managers until the observed revision wait, so the test still exercises the intended business lock. In the fixed-UUID race, `tasks` now retains the target UUID beside each worker, permitting a direct winner/loser oracle. The status multiset is still checked before `find` selects winner and loser, so `.first` does not hide an empty result. In the missing-row case it requires generation 2 for the successful target and no row for the conflict target; `raw_change` rolls back non-`ok` results in the reviewed helper. In the nonmissing case the original zero-delta generation check remains. This strengthens the prior aggregate `[0,1]` oracle rather than weakening it. Only a test file changed in Elara's commit; production guards were untouched.

Theo's `target_users` RBS type requires precisely `input:` and `query:` and returns `Array[String]`. Both updated lambdas now accept those named keywords, annotate `input` as the parsed object, and return the prior target list (`[target]` for grants, `[]` for actor-owned preference). `protected_write` invokes the callback with exactly those keywords before opening the guarded transaction and validates at most two UUIDs. The preference lambda additionally rejects nonempty query input, consistent with the default empty query allowlist. The same preference body validation is repeated in the write body; no authority or field was relaxed. The two changed controller snippets contain no new loop or database query.

Tests and documentation exist in the two owner commits, but this packet did not execute them. Soren must run the affected strict typecheck/Rails tests and real PostgreSQL concurrency fixture on the exact integrated SHA; scheduling and restore/cleanup remain his responsibility. Independent source review cannot certify deterministic race timing or backend runtime correctness.
