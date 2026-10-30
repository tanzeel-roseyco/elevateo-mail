# BE-02 scoped search: independent adversarial review

Review date: 2026-10-13 Australia/Sydney. Run `run_5cc7ae2ab900`; task `task_9185c38895d2`; dispatch `ctx_111ec8c3c048`; reviewer terminal `term_946ba7a2-8835-4588-8d16-dabfb358b60c`.

<!-- AIDEV-NOTE: This bounded static review is source evidence; runtime acceptance and shared dependencies remain separate. -->

**Result: one medium-severity test-oracle defect. Runtime: NOT_RUN.** The assigned production logic appears consistent with the search contract under its published dependency interfaces, but this review does not establish application acceptance. No additional production-code defect was observed in the assigned lines; zero observed is not proof of absence.

## Scope and accounting

Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. Paths below are relative to `apps/server`. Files were counted and SHA-256 hashed before source review. Physical LOC include comments and blank lines. Context documents and repeated reads do not increase unique code coverage.

| Pass | File | Reviewed lines | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `lib/elevateo/mail_search_sql.rb` | 1–49 | 49 | `1BE834D88C85E0DF88F327A62C5B63544BDA6B3EDD8396FDAD008308235B2BEE` |
| 1 | `lib/elevateo/mail_search.rb` | 1–38 | 38 | `9736A68EA06A74B2D66A7B16AFA9FCAE1DBF60E197095FCED5C1F1D8BE61CDD1` |
| 1 | `sig/mail_search.rbs` | 1–15 | 15 | `E352E7796F7D4C334607860C7AD7455D6277AA4C1451212C95BD7E375E3CD192` |
| 1 | `app/controllers/v1/search_controller.rb` | 1–14 | 14 | `06C8C95CC51F985BE08BB1DED4CA2DD71AABCB8902EFA3704211B17642055F85` |
| 1 | `test/be_02/mail_search_test.rb` | 1–70 | 70 | `0E45351FDBE55F3F79EBBEA1C3F76784B95D8573F10C47DB4F6C10DA6AB5077F` |
| 2 | `test/be_02/mail_search_database_test.rb` | 1–102 | 102 | `F249904B0D54A4842EC250E1A702339CAD5FD629A3AFF4F49DFE945019D349D9` |
| 2 | `test/be_02/mailbox_membership_database_helper.rb` | 1–89 | 89 | `F614F0309E1840F3944E9BDC9C3F962BEAF7603F5D4A21A8129B594804C12568` |

Pass 1: **186** physical LOC. Pass 2: **191** physical LOC. Total: **377 unique physical LOC**, comprising 116 production/signature LOC and 261 test/helper LOC. Each pass is below 200; assignment total is below 400. Observed defects: **1** (critical 0, high 0, medium 1, low 0). Observed defect density: **1 / 377 × 1,000 = 2.65 defects/KLOC**. This denominator measures inspected source, not estimated remaining defects or runtime coverage. Final rehash at 2026-10-12 22:57 UTC confirmed all seven physical line counts and SHA-256 values unchanged from intake.

The user's full review rubric, project `AGENTS.md`, governing README/state/documentation and `.planning/STANDARDS.md` informed the review. Required context included `docs/completion/be02-implementation-brief.md`, `be02-cd-contract.md`, `be02-drafts-implementation.md`, `be02-membership-search-implementation.md`, `be02-write-boundary.md`, and accepted `.planning/consultations/results/be-02/decisions.md`. Canonical C/D version is **`1.0.0-collaboration.1`**. AIDEV anchors in the assigned SQL, service, controller and database helper were read and preserved.

## Finding S-01 — medium: empty-cursor test requires the wrong C/D error

**Location:** `apps/server/test/be_02/mail_search_test.rb:25–28`. Related call sites, not an independently proven production defect: `lib/elevateo/mail_search.rb:13`, `:18–23`, `:32–35`.

**Evidence:** The invalid-query matrix includes `{ "cursor" => "" }` in the same loop as invalid limits, malformed mailbox IDs and unknown keys; the loop requires `request_invalid`. The frozen contract, `docs/completion/be02-cd-contract.md:58`, assigns invalid/expired/mismatched cursors **400 `cursor_invalid` after current authentication/context/scope**. The companion draft implementation handoff at line 16 explicitly includes empty and overlong supplied cursors in that rule. Empty text is a present invalid cursor, not an omitted cursor.

**Concrete failure scenario:** For a current authorized search with valid `q=needle` and `cursor=`, compliant handling returns `cursor_invalid`, but this test expects `request_invalid`. If the implementation follows the test, it publishes the wrong C/D error code; if the implementation follows the contract, the test rejects correct behavior. The existing hidden-mailbox precedence test uses `cursor=invalid`, so it does not catch early rejection specifically of empty or overlong cursor text.

**Minimal fix:** Remove the empty-cursor case from the `request_invalid` matrix and assert `cursor_invalid` separately for an otherwise authorized search. Add the associated authority-priority cases. If those assertions expose inherited early cursor rejection, have the boundary owner correct C/D cursor validation and error mapping after scope, preserving the explicitly unchanged A/B contract. Do not change the frozen contract to satisfy this test.

**Regression:** With valid q, test empty and 2,049-character cursors against (1) current readable/all-mailbox scope → 400 `cursor_invalid`; (2) current-context inaccessible/foreign explicit mailbox → generic 404 `not_available`; (3) revoked local session plus stale context → 401; and (4) valid session plus stale context → 409 `context_changed`. Run service cases and actual HTTP cases inside the coordinator's Docker suite. Keep omitted cursor successful and prove the 2,048-character limit independently of token validity.

**Evidence level:** Static test-oracle mismatch, high confidence. The inherited `query_limit` implementation and unit helper are unassigned and were not inspected; no claim is made about their current execution result. Runtime reproduction: **NOT_RUN**. Reported promptly through Orca status message `msg_9036644fb15b`.

## Review checklist and observations

All observations below are static unless explicitly stated otherwise. Authored assertions are not passing test evidence.

| Area | Reviewed evidence and assessment |
| --- | --- |
| Exact query / Unicode | `mail_search.rb:10–15,21,24,29` preserves term text, uses the exact specified White_Space set, binds exact q and echoes it. Text length/encoding validation delegates to `WriteInput.text`. Unit lines 6–29 specify non-BMP limits, invalid UTF-8/NUL, empty/nil, whitespace-only rejection, and valid U+200B/U+0001. No normalization or trimming was introduced. Validator implementation remains unreviewed. |
| LIKE literal escaping / SQL parameters | Service line 24 uses a block substitution to prefix each backslash, percent and underscore; caller text becomes a bound value, not SQL text. SQL lines 21–30 use the same parameter and explicit backslash escape for every searchable field. The Ruby heredoc and PostgreSQL escape-string layers are consistent on static inspection. Unit lines 6–15 check the bound literal; database lines 6–26 specify wildcard decoys, ASCII case insensitivity, and each sender/recipient field. Runtime collation and actual escaping remain NOT_RUN. |
| Scope and hidden resources | SQL constrains organization, optional mailbox and message/thread/mailbox relations; unread state additionally binds actor. `mail_search.rb:18–20` checks explicit mailbox visibility before `position`. Actual row authority depends on inherited RLS and the protected-read wrapper. Database lines 54–81 specify private, foreign and missing cases plus revocation. No new actor/org request field or SQL interpolation was observed. |
| Revocation and error priority | Controller invokes `protected_read`; the owned search issues no writes. Database lines 71–78 deliberately retain one old snapshot across a membership removal and require denial in a new snapshot, consistent with D05. This does not establish the complete HTTP 401/409/404 ordering, authentication policy, or 10-second bound. See S-01 for empty-cursor priority. |
| Older matches / unique thread result | SQL `EXISTS` locates any matching authorized message without joining each match into the result set. Separate latest-message selection determines preview, sender and activity. Database lines 28–37 specify two older matching messages, one newer nonmatching message, exactly one thread, canonical latest preview and no match excerpt. |
| Nulls, empty lists and excluded content | Null SQL text does not satisfy ILIKE; empty recipient arrays contribute no match. Latest-message left join supports threads without messages; preview defaults to empty text. Only subjects/messages appear in search SQL, so notes/drafts are not searchable. Database lines 40–51 specify these cases; unit lines 31–36 specify empty readable mailbox results. Canonical array/schema invariants remain an unreviewed dependency. |
| Ordering / keyset | SQL lines 18,31–35,46 use activity DESC NULLS LAST and UUID DESC. With nonnull cursor activity, the predicate admits older timestamps, lower UUIDs at a tie, then nulls; with null cursor activity, it admits only nulls with lower UUIDs. Database lines 84–100 specify newer, equal-time and null groups across one-item pages with a terminal null cursor. No offset paging or obvious skip/duplicate predicate was observed. |
| Cursor filters / authority | Service lines 21–23,31 provide resource `search`, exact q, nullable mailbox, order and effective limit to inherited cursor helpers. Unit lines 39–52 specify case/space-sensitive q changes, mailbox, limit, context and generation mismatches. Signing, expiry, actor/org binding, cursor schema and request-context checks remain unreviewed. Service-level changed metadata is not evidence that stale HTTP context should return `cursor_invalid`. |
| Response shape / budget | Service fetches limit+1, uses B's ThreadProjection and supplies q/mailbox plus session envelope to ReadResponse with THREAD_BYTES. Controller passes the same budget. Unit lines 55–68 specify actual serialized bytes ≤262,144 with heavily escaped fields, nonempty whole-entry shrinkage and a continuation at the last included null-activity row. Exact closed wire shape, 50-entry cap, terminal behavior and serializer failure handling depend on unreviewed shared code. |
| Actual API role fixtures | Assigned helper lines 75–78 call the service inside inherited `scope(write: false)`; message inserts use a separate `@admin` fixture connection. The AIDEV note and implementation handoff state reuse of an actual-login/API-role harness. The connection's actual login role, FORCE RLS, transaction mode, generation guard and parent cleanup cannot be established from these assigned lines and were not certified. |
| State and fixture effects | Production search contains no mutation. Fixture membership changes go through inherited `member_change`; teardown resets revisions only for IDs captured in `@owned_boxes`, then invokes parent cleanup. Parent fixture initialization, privileges and cleanup ownership remain unreviewed. No observed additional scoped defect. |
| Maintainability / type surface | Small SQL/service/controller separation and one RBS signature fit the bounded feature; no new dependency, backend, cache, speculative index or general query framework was introduced. Shared projection/cursor/response code is reused. AIDEV comments describe coupling and snapshot intent. Formatting was not assessed; strict RBS checking is NOT_RUN. |
| Performance | Search executes one parameterized page query plus an optional mailbox authorization query. Latest-message lookups and participant matching occur inside SQL; the final correlated message count is limited to page candidates (at most 51 before budget trimming). Large authorized datasets may still scan substantial text. No EXPLAIN or latency evidence was produced, so no speculative index recommendation or performance guarantee is made. |
| Tests and documentation | Five unit and five database search test methods were inspected, including happy paths and multiple failure cases; S-01 requires correction. Implementation handoffs accurately reserve runtime checks for integration. Source/report review does not replace Docker lint, types, HTTP, real-role, concurrency or serializer validation. |

## Published interfaces relied on, not reviewed

No source outside the seven-file manifest was added to code coverage. These boundaries were treated as contracts from the required handoffs and assigned call sites, not as verified implementation:

| Unreviewed boundary | Published interface / dependency |
| --- | --- |
| `ThreadReads` and inherited SQL | Initializes connection/identity/session/cursors; supplies `query_limit`, `request_uuid`, `rows`, `MAILBOX_SQL`, `cursor_scope`, `position`, `encode_position`, and `session_envelope`. Current mailbox authority and cursor handling depend on these. |
| `WriteInput` / query parsing | Validates bounded exact Unicode text, query syntax and UUIDs; the shared controller owns duplicate decoded keys, percent decoding, body restrictions and transport-before-auth ordering. |
| `WriteController` / `ReadController` | Published C/D errors plus inherited `protected_read` block yielding connection, identity, session and query; current authentication/context/RLS snapshot, headers, serialization lifetime and deadline belong here. |
| `Cursors`, `ThreadProjection`, `ReadResponse` | Signed expiring authority-bound tokens; unchanged B ThreadSummary; complete bounded JSON envelope and last-included continuation. These implementations and their tests were not opened. |
| Schema, grants, RLS, routes, collation | Required constrained canonical rows, actual restricted API role and mounted GET route are outside this assignment. The SQL is not authorization proof without these foundations. |
| Parent test helpers / session and membership services | `MailboxMembershipUnitCase` supplies fake connections/search/assertions; `CollaborationDatabaseCase` supplies actual-role scope/login fixtures and guarded changes according to the handoff. `SessionPresentation`, `SessionCrypto`, membership mutation SQL and `MailboxMembershipInput::FLAGS` are used by the assigned helper but were not source-reviewed. |

The direct database test's empty result after organization membership removal (`mail_search_database_test.rb:80–81`) is only a service/RLS assertion. It is not evidence that a protected HTTP endpoint may return an authorized empty page after losing organization membership. Likewise, the unit test that changes session metadata directly tests cursor binding rather than header conflict priority.

## Executed evidence and coordinator follow-up

| Activity | Result |
| --- | --- |
| Count/hash assigned files before reading; read two bounded passes and AIDEV anchors; compare to required handoffs | Executed static inspection; 377 unique physical LOC |
| Recount and rehash all seven source files after review | Executed; all seven match intake; no source drift observed |
| Orca inbox checkpoints, finding status and review heartbeat | Executed; finding message recorded above |
| Application execution, SQL execution, unit/integration tests, actual HTTP/Auth/API-role checks | **NOT_RUN** — prohibited by this dispatch |
| Docker, host application tests, lint, RBS/typecheck, EXPLAIN, frontend/visual validation | **NOT_RUN** — coordinator-owned |
| Model/agent calls, design consultation, Obsidian simulation, SSH, commits, publishing or live sends | Not performed |
| Source edits, unrelated reports, aggregate `code-reviews.md` edits | None; only this assigned report is written |

The coordinator should correct S-01, run the two search suites with the real restricted database role inside Docker, and exercise the actual search controller against the frozen response/error contract. Include before/after-snapshot revocation, current versus stale context, literal Unicode and wildcard searches under the pinned collation, cursor invalidity/expiry/filter binding, maximum escaped output, and null/tied/subsecond activity pagination. Reuse already available shared-boundary evidence where applicable; absence of that code from this assignment is a coverage limit, not an additional counted defect.

No acceptance, deployment readiness or throughput claim is made. Dedicated cross-system design review and the aggregate review ledger remain coordinator-owned.
