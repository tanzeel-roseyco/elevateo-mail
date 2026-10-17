# BE-02 mailbox membership and scoped search implementation

Dispatch: `ctx_1f3e753fc19c`; task: `task_c96f1912457e`; run: `run_5cc7ae2ab900`.

Implementation delivery is complete within the D worker scope. Runtime verification remains **NOT_RUN**: this dispatch prohibits Docker, host application tests, agents, commits, and publishing. The coordinator owns integration, Docker verification, adversarial review, and any resulting repair assignments.

The implementation follows sections 8–9 of `docs/completion/be02-cd-contract.md`, canonical contract version `1.0.0-collaboration.1`, and accepted D01–D08. It adds no dependency, index, live mail operation, frontend change, or application credential.

## Delivered behavior

### Explicit mailbox membership

- Manager-only roster reads return current-organization explicit members in ascending user UUID order, with default/maximum limit 50 and a 131,072-byte serialized budget. Cursors bind the mailbox-wide membership revision and current authority.
- PUT validates the closed three-boolean capabilities object and bounded mathematical `expected_membership_version`. DELETE accepts no body and requires the canonical decimal revision query. Targets must currently belong to the organization, including absent-row DELETE.
- Missing, foreign, inaccessible, and unauthorized resources use the shared C/D error seam and canonical generic 404. Stale revision checks precede no-op handling. Matching no-ops preserve revision and authorization generation; changed rows increment each once. The revision ceiling permits no-ops and rejects changes.
- Removing or demoting the final active explicit manager conflicts. Membership mutation holds the mailbox revision row lock while rechecking manager authority, target eligibility, revision, and remaining managers. Shared mailbox visibility remains independent of explicit membership removal; historical attribution is untouched.
- Self-demotion signs the response authorization version from fresh post-write actor metadata while the protected transaction and guards remain held. Mutation responses have a 4,096-byte serialized budget and are materialized before commit.

### Scoped search

- GET search preserves the exact query, accepts 1–256 Unicode code points, and rejects invalid UTF-8, NUL, and Unicode White_Space-only queries. Optional mailbox scope, default/maximum limit 50, and a 262,144-byte response budget follow the contract.
- Bound PostgreSQL `ILIKE` parameters escape percent, underscore, and backslash as literals. Search covers thread subjects and message bodies, sender names/addresses, and recipient names/addresses. Drafts and notes are excluded.
- `EXISTS` keeps each matching thread unique, including matches in older messages. Results reuse the B thread projection and latest-message preview, with activity descending/nulls last and descending UUID tie-breaks.
- Cursors bind the exact query, optional mailbox, resource, order, limit, and current authority. Explicitly inaccessible mailbox scope returns the canonical 404 before cursor validation. All database reads use the inherited protected-read snapshot. No total count or profile enrichment is added.

## Database and integration boundaries

Migration `20261013000006_create_mailbox_membership_writes.rb` loads the six owned SQL files under `db/be02_memberships`. The revision table and relevant owner policies retain FORCE RLS. The revision trigger performs one bounded increment for each actual membership change; the existing A generation trigger remains responsible for authorization generation, avoiding a second increment here.

The runtime API receives only narrow execute grants for the membership functions, with no membership-table DML or revision-table access. Functions use qualified names and a fixed `pg_catalog` search path; PUBLIC execute is revoked. Migration setup explicitly selects `elevateo_owner`, and grant postconditions verify the expected non-login, non-superuser, non-BYPASSRLS owner and function ownership. The down migration removes only this migration's functions, trigger, policies, and table.

The mutation routine first calls the foundation's owner-only `app_auth.assert_protected_write(digest, target)` before the mailbox business lock. That seam checks the cookie-bound current transaction proof, authenticated principal, and already-held sorted actor/target generation guards. Client headers or raw RLS settings alone cannot authorize membership mutation. Authority and target membership are checked again after waiting for the mailbox lock; the proof is read again after DML to obtain current actor metadata.

The controller uses the confirmed foundation interface:

```ruby
protected_write(allowed_query: [], required: [], max_bytes: 8192,
                budget: 4096, guard_users: nil, body: true)
# block keywords: connection:, identity:, session:, input:, query:, deadline:
# guard_users callable keywords: input:, query:
```

The actor is automatically guarded by the foundation. Membership callbacks return the canonical route target UUID after pre-lock input validation. The foundation owns session locking, ordered generation-guard creation/locking, READ COMMITTED transaction lifetime, deadline, CSRF/authentication, error rendering, rollback, and serialization-before-commit checks. No Auth HTTP call occurs in the owned mutation logic.

Shared seams were coordinated without editing shared files:

- The coordinator reported integration of GET `/v1/search` and GET/PUT/DELETE membership routes.
- `ThreadReads#cursor_scope` now permits nullable filter values in the coordinator-owned RBS, allowing exact absent-mailbox search binding.
- `config.autoload_lib` handles the new modules; explicit application requires were not requested.
- Controllers inherit `V1::WriteController` to reuse its C/D error handling and inherited protected reads. Legacy A/B `AuthError` was not widened by this worker.
- The coordinator reported updating the existing metadata privilege expectation for D's narrow grants and including the new `*_test.rb` files in the Docker suite.

These integration edits were reported by the coordinator or inspected statically; runtime loading, routes, HTTP responses, and migration execution remain unverified.

## Authored verification

There are 26 new test methods across five test files, plus two small helpers. They are authored checks, not passing evidence.

| File under `apps/server/test/be_02` | Cases | Coverage | Result |
| --- | ---: | --- | --- |
| `mail_search_test.rb` | 5 | Exact query/literal binding; Unicode and input bounds; explicit 404 priority; cursor authority/filter binding; serialized budget and null activity | NOT_RUN |
| `mailbox_membership_test.rb` | 6 | Closed inputs and decimal revisions; roster bounds/revision cursors; manager priority; fresh self-demotion response; deliberate handling of malformed database metadata and capabilities | NOT_RUN |
| `mailbox_membership_database_test.rb` | 6 | Changed/no-op/stale semantics; last manager and self-demotion; foreign/ineligible targets; explicit roster; maximum revision; runtime grants and unforgeable guarded proof | NOT_RUN |
| `mailbox_membership_concurrency_test.rb` | 4 | Simultaneous manager departures; missing guard creation; delete/re-add tombstones; observed lock wait across target delete/re-add | NOT_RUN |
| `mail_search_database_test.rb` | 5 | Literal wildcard and sender/recipient fields; older-message uniqueness/latest preview; null fields and excluded drafts/notes; foreign/private/revoked visibility and snapshots; null/tied activity keysets | NOT_RUN |

Database tests reuse the collaboration worker's `collaboration_database_helper.rb` and actual API-role connection/protected-write setup. Admin connections are limited to fixture setup, inspection, and cleanup. The concurrency test observes a PostgreSQL lock wait before releasing the competing target-membership transaction; the root suite must verify that evidence with the real foundation and database.

| Required validation | Status |
| --- | --- |
| Docker lint and RBS/type checks | NOT_RUN |
| Docker unit and database/integration tests | NOT_RUN |
| Migration up/down and runtime privilege validation | NOT_RUN |
| Actual HTTP route, status, CSRF/auth, and response integration | NOT_RUN |
| Representative search EXPLAIN/performance measurement | NOT_RUN; no speculative indexes added |
| Independent adversarial and design-tradeoff review | NOT_RUN; new agents prohibited by this dispatch |
| Actual application/visual validation | NOT_RUN; coordinator responsibility |

Static self-review corrected three grouped defects: shared projection helper argument mismatches, a message fixture that violated the existing non-null body column, and malformed database output being treated as request failure or an uncontrolled metadata lookup. At handoff, the 22 owned code/test files contain 1,003 nonblank lines: observed self-review defect density is 2.99 defects per 1,000 nonblank lines (3/1,003); this is not an estimate of remaining defects or independent review coverage. Explicit migration role selection and function-owner assertions were additional hardening. The coordinator must record independent review coverage and findings in the project review log.

## Owned files and remaining work

- Membership migration: `apps/server/db/migrate/20261013000006_create_mailbox_membership_writes.rb`.
- Membership SQL: `apps/server/db/be02_memberships/{tables,revision,reads,mutation,grants,down}.sql`.
- Services: `apps/server/lib/elevateo/{mailbox_membership_input,mailbox_memberships,mail_search,mail_search_sql}.rb`.
- Controllers: `apps/server/app/controllers/v1/{mailbox_members,search}_controller.rb`.
- Signatures: `apps/server/sig/{mailbox_memberships,mail_search}.rbs`.
- Tests/helpers: the five files above plus `mailbox_membership_test_helper.rb` and `mailbox_membership_database_helper.rb`.
- This implementation report.

No shared/root file, existing dirty work, generated contract, or reserved migration was edited by this worker. No commits, pushes, host application checks, Docker workloads, or disposable Docker resources were created. There is no remaining implementation blocker known from static inspection; the remaining work is coordinator-run integration/verification and any fixes supported by its results.
