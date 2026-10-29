# BE-02 draft schema and operation ledger review

Review date: 2026-10-13 (Australia/Sydney). Run: `run_5cc7ae2ab900`; task: `task_867d7a1e9934`; dispatch: `ctx_c0d0505cf9a5`.

## Result and evidence limits

**Zero observed defects in 259 unique physical code lines; observed defect density: 0 / 0.259 KLOC = 0 defects/KLOC. Runtime: NOT_RUN.**

The assigned SQL and migration are statically consistent with the draft save, ownership, operation replay, and retention requirements of C/D contract **1.0.0-collaboration.1**, subject to the published dependencies below. This is a bounded static review, not proof that the application works or an approval to publish. No defect finding with a concrete failure scenario was established in these lines. There are consequently no severity-rated findings or proposed code fixes in this report.

Only the eight assigned files were reviewed as code. No unassigned dependency or test implementation was inspected. No application, SQL, migration, Docker, host test, linter, typecheck, agent/model invocation, SSH operation, commit, or frontend check was run. Shell execution was limited to reading documentation/source, counting physical lines, hashing files, and Orca coordination. The only file written is this report. The coordinator owns consolidation into `code-reviews.md` and the separate design review; neither a separate reviewer nor an Obsidian tradeoff simulation was invoked in this assignment.

## Governing context

Consulted the project `AGENTS.md`, `.planning/STANDARDS.md`, current README/state/documentation checkpoints, `.planning/README.md`, `.planning/AGENT_ORCHESTRATION.md`, and local-completion instructions. Feature context came from `docs/completion/be02-implementation-brief.md`, `be02-cd-contract.md`, `be02-drafts-implementation.md`, and accepted `.planning/consultations/results/be-02/decisions.md`. The published write-boundary, session/database-interface, and runtime-harness documents supplied dependency contracts only. Historical state-log entries are not claimed as exhaustive coverage.

The supplied adversarial rubric was applied to the bounded scope. Existing `AIDEV-*` anchors were searched before review and their intent considered. Formatting belongs to linters and was not a review finding category.

## Coverage and integrity

Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex/apps/server/`.

Physical counts include blank lines and comments. Counts and SHA-256 hashes were obtained before reading code; a final metadata pass reproduced every count and hash. Documentation and repeated reads are excluded from unique code LOC. Pass 1 contains 126 physical lines and pass 2 contains 133; neither exceeds 200 and total unique coverage is 259, below the 400-line assignment ceiling.

| Pass | Source path relative to source root | Inclusive range | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `db/migrate/20261013000004_create_app_drafts_operations.rb` | 1–18 | 18 | `EF47E2BBC9ECD2FEE1FBAD78D0249BEDBD4384517C3FE1AB06C8E4686259D8F8` |
| 1 | `db/be02_drafts/tables.sql` | 1–45 | 45 | `C2C507D3D301703ECA1091B7E5243242BBDB76B3FFE6E1F592FAD362F4947CF1` |
| 1 | `db/be02_drafts/policies.sql` | 1–30 | 30 | `059696491B0BEE3F60D6E7DB665E10EEAEC2CEFED85CB02D4BC02DF9A35A38C7` |
| 1 | `db/be02_drafts/scope.sql` | 1–12 | 12 | `0412B8A8F12BA7CFE5FC05D8B3208E5801E1C731CA3987E3F25C36B5250D22E2` |
| 1 | `db/be02_drafts/grants.sql` | 1–10 | 10 | `5BEF9B13237E5DFB7D0EA53D6AD87988370847A58136079CDC5DA7087D642058` |
| 1 | `db/be02_drafts/down.sql` | 1–11 | 11 | `366B25B0CCBC783BD0CF6AE319E5293C51425771EE7D3A7FEE50FCC76BA164EA` |
| 2 | `db/be02_drafts/save.sql` | 1–87 | 87 | `9709C44E1FB4FA981AC2DC96C199869C11DE00A7D5A4F2FACD715B105BC4A815` |
| 2 | `db/be02_drafts/operations.sql` | 1–46 | 46 | `09EB3AAD0B4B868BB946AB828D73EE3885A1B89E77756FF3C69A0504F5735B42` |

## Review checklist

All checks below describe static inspection, not executed assertions. Paths without a directory prefix are under `db/be02_drafts/`.

| Area | Static assessment and limits |
| --- | --- |
| Migration ordering and rollback | `20261013000004_create_app_drafts_operations.rb:5–10` installs tables, policies, scope, save, lookup/compaction, then grants. `down.sql:1–11` removes the feature functions, data tables/schema, and added owner-read policies. Rollback is explicitly destructive and was not executed. Existing role/prerequisite setup is unreviewed. |
| FORCE RLS | `tables.sql:42–45` enables and forces RLS on both drafts and the private ledger. `policies.sql:21–30` separates actor/compose-scoped reader access from broad owner access needed inside the definers. FORCE RLS does not itself validate the external role graph; that remains a dependency. |
| Definer privileges | Private-schema and table revocations plus `grants.sql:1–10` deny direct runtime ledger access and restrict execution: API save/scope/lookup, worker compaction. Definers use a fixed search path beginning with `pg_catalog` and qualify application objects. Correct effective ownership and runtime roles are not proven by these files alone. |
| Ownership and non-disclosure | `scope.sql:4–11` requires current actor/organization mailbox access and compose capability, rejects an existing foreign draft ID, and permits an unclaimed ID. `save.sql:30–37` checks scope again after locking. `operations.sql:7–16` checks scope and maps a known operation's binding mismatch to unavailable, not an existence-bearing result. HTTP 404 serialization is outside scope. |
| Null, empty, and maximum inputs | `save.sql:24–28` rejects required nulls, negative expected versions, malformed digests, and excessive subject/body lengths; PostgreSQL integer parameters bound the upper integer domain. Empty subject/body are allowed. Recipient shape/count, including an empty list, depend on the published validator. `operations.sql:32–34` rejects null compaction limits and limits outside 1–1000. JSON syntax, UUID parsing, Unicode/U+0000 handling, and request byte limits belong to the unreviewed boundary. |
| Permanent idempotency identity | `tables.sql:26–38` keys the ledger by organization, actor, and operation, independent of mailbox/draft. Binding and digest columns are non-null and are retained without cascading foreign keys. The only maintenance mutation in scope clears detail. No normal purge or identity deletion path is present. |
| First terminal outcome | `save.sql:39–51` reads a prior result before evaluating current draft version/state or current reply validity. `save.sql:67–84` writes both applied and conflict detail. Terminal conflict returns deliberately require the caller to commit; that caller was not inspected. |
| Conflict, consumed, and version exhaustion | `save.sql:58–79` treats absence as version 0, prioritizes consumed over stale expected version, records the conflict's original metadata, and changes neither draft nor version on conflict. A matching version at 2147483647 returns temporary unavailability before mutation or a new ledger row. Fresh successful saves increment even when field values are unchanged. |
| Operation mismatch | `save.sql:42–51` rejects changed mailbox/draft binding, changed digest, and expired reuse without replacing the ledger. An identical unexpired replay returns its original applied version or conflict code. Current scope is checked first, preserving unavailable-resource precedence. |
| Reply target coupling | `save.sql:53–57` validates the current reply target only for a new operation. An identical recorded replay can therefore survive deletion of the old reply target. The draft foreign key's nulling behavior is declared in `tables.sql:20–21`; the thread deletion implementation is unreviewed. |
| Concurrency and revocation | `save.sql:17–22` requires the protected-write assertion before business work. Operation then draft advisory locks serialize duplicate identities and same-draft writes; scope is rechecked after waiting and the existing draft is row-locked. The preceding session/generation locks and read-snapshot rules live outside this scope. No revocation or concurrency race was executed. |
| Retention and compaction | `tables.sql:34–41`, `save.sql:41–45,81–83`, and `operations.sql:17–23,35–44` use the stored first outcome time plus 604800 seconds. The cutoff includes equality; expired lookup returns only IDs/outcome and expired save reuse is rejected. Bounded compaction uses `FOR UPDATE SKIP LOCKED`, clears detail only, and preserves identity/binding/digest. Expiry behavior does not wait for compaction. |
| Wire shape and budgets | The successful save JSON contains the four required fields. Lookup builds the required identity fields plus unknown/expired outcome, or persisted applied/conflict metadata and UTC timestamps; it does not emit content or the digest. The 2048-byte stored-detail check leaves room within the 4096-byte operation response budget. Complete HTTP envelopes, status mapping, fresh request IDs, exact error text, and final serialized-byte enforcement remain unreviewed. |
| Maintainability and performance | The migration and SQL parts have bounded responsibilities. Anchors explain transaction commit, lock order, replay, and retention constraints. Lookup uses the ledger primary key; draft listing and pending compaction have indexes. No unbounded application loop or repeated per-recipient query is present in scope. Query plans, lock contention, compaction scan cost, and real latency were not measured. |
| Tests and documentation | The implementation documentation describes corresponding behavior and test areas. Test source and execution were excluded from this assignment, so happy-path/failure coverage, regression completeness, and passing status are not independently verified. |

## Analytical scenario checks

These are source traces only; every runtime result is **NOT_RUN**. They identify the focused cases the coordinator should reconcile with actual test evidence, not additional defects.

| Scenario | Expected trace in assigned source | Runtime |
| --- | --- | --- |
| Absent draft, expected version 0, empty editable fields | Subject/body empties pass local checks; a valid empty recipient list depends on the validator; insert version 1 plus applied ledger detail. | NOT_RUN |
| Absent draft with positive expected version | Record `draft_conflict` with current version 0/state null; do not create the draft. | NOT_RUN |
| Successful A, later successful B, identical retry A | Return A's recorded version before comparing current draft version. | NOT_RUN |
| First stale-version conflict, later draft update, identical retry | Return original conflict; lookup retains original expected/current version and state while detail is live. | NOT_RUN |
| New save against consumed draft with stale expected version | Persist `draft_consumed`, taking precedence over stale-version conflict. | NOT_RUN |
| Original applied save followed by consumption or reply deletion | Identical replay returns the original applied metadata, provided current authorization and binding still permit access. | NOT_RUN |
| Same operation ID with changed digest or authorized changed binding | Save returns `operation_mismatch`; lookup with a mismatching known binding returns unavailable; original row remains unchanged. | NOT_RUN |
| Just before, exactly at, and after the 604800-second cutoff | Live detail before cutoff; expired lookup and mismatch on save at/after cutoff, before or after compaction. | NOT_RUN |
| Compact expired detail, then reuse the identity | Only detail is erased; retained row prevents reexecution and preserves expired lookup. | NOT_RUN |
| Matching expected version at maximum integer version | Return temporary unavailability with no draft mutation and no new ledger entry. | NOT_RUN |
| Concurrent same operation / different operations on one draft | Operation/draft locks and the post-lock reads serialize permitted writes; actual scheduling evidence is required. | NOT_RUN |
| Revocation or context change wins before write guards | Published guard must supply the corresponding status; business code is skipped. HTTP 401/404/409 and opposite-order race results require integration evidence. | NOT_RUN |

## Unreviewed dependencies and acceptance work

The following are published interfaces, not reviewed implementations. They are not counted in the 259 LOC and are not asserted correct:

| Dependency | Required contract |
| --- | --- |
| Migration harness and role bootstrap | Run migrations under the intended NOLOGIN `elevateo_owner` ownership context, with the documented migrator assumption, existing schemas/tables/roles, appropriate runtime membership, and no runtime RLS bypass or owner escalation. The new function/table ownership is otherwise determined by the creating role. |
| `app_auth.assert_protected_write` and write wrapper | Bind the current session and actor to an authenticated, live protected transaction; establish required session and sorted generation guards under READ COMMITTED; return documented non-null statuses; hold guards through commit; deliberately commit persisted terminal conflicts. |
| Read wrapper and authorization resolution | Validate cookie/session/context/resource priorities, bind trusted transaction-local context, and provide the required REPEATABLE READ READ ONLY snapshot so revocation races return one coherent authorized response. |
| Existing membership/mailbox/thread relations and `app.context_uuid` | Provide the documented organization, membership, visibility, and capability semantics that the owner-read policies and scope function use. |
| `app.thread_recipients_valid` | Validate the canonical Address array shape, null-name allowance, count/field limits, and empty-array case. Its implementation was not opened. |
| Request parser, canonical digest builder, service, and serializer | Enforce the closed input shapes and mathematical integers, canonical ordered semantic digest, request size, Origin/CSRF, exact status/error precedence, safe error messages, fresh request IDs, and all final response budgets. SQL trusts the provided validated digest; it does not independently canonicalize the payload. |
| External draft state transitions and test suite | Preserve the documented mutation/locking protocol when consuming/deleting resources; exercise the real database roles, commit behavior, conflict/replay cases, compaction boundary, and deterministic revocation races. No such implementation or tests were reviewed here. |

Remaining acceptance evidence is therefore the coordinator's Docker-based migration/role checks, targeted database and integration tests, HTTP shape/budget assertions, and deterministic race/expiry checks. Their absence from this deliberately static assignment is an evidence limit, not an observed code defect. No runtime pass, whole-feature certification, or publication readiness is claimed.
