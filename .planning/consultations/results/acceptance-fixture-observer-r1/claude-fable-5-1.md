Opinion delivered below as a tools-disabled, read-only consultation on the frozen packet. No file was read, no command ran, no runtime result is claimed.

**Verdict: support task 2 with changes.** The smallest maintainable solution is an additive seed-contract version 2, a Ruby observer sidecar that reuses the seed's existing database runtime over a private socket with a fixed query catalogue, isolated fixture stacks for any case that mutates an actor's global authorization or credential state, and Playwright route forward/hold/abort as the only transport control. One confirmed source inconsistency exists inside the supplied text. Eight paths remain NOT_RUN by design; they are missing controls, not defects. The private-schema CREATE failure is the schema worker's prerequisite and is counted once, as a blocker.

## Recommendations

**F51-01. Additive contract v2 for extra memberships** (adapt proposal). Bump `schema_version` to 2 and add two typed sections. First, two new mailbox aliases in the primary organization: `secondary` and `excluded`. Second, an `extra_memberships` list of `{actor, mailbox, capabilities}` with exactly one entry: `composer` on `secondary` with `["read"]`. The base `capabilities` field keeps its primary-mailbox meaning, so every existing alias reads unchanged. The seed inserts the extra rows after base memberships, and `verify_actors` replaces the single-row check at `acceptance_seed.rb:139` with set equality over sorted `(mailbox, caps)` tuples built from base plus extras. Publication adds a per-actor `mailbox_memberships` array. Evidence: `seed-contract.json:2` is version 1, `acceptance_seed.rb:163` derives one mailbox per scope, and `acceptance_seed.rb:146` compares a single capability list. Counterexample: an uninspected consumer asserts a one-element mailbox list for `composer`, or the T0 loader rejects version 2. Verification: inspect the shared loader and every reader of `actors.*.mailbox` before editing; inspect the runtime's publish method so the new array is emitted, not dropped.

**F51-02. No runtime membership creation for shared actors** (new recommendation, resolving the controls document's open question). The seed shows that every membership insert or delete advances the actor's organization-level generation: two insert/delete pairs add four at `acceptance_seed.rb:69`, and a compose toggle pair adds two at `acceptance_seed.rb:98`. The published `authorization_version` is derived from that generation at `acceptance_seed.rb:150`. A case-private mailbox created at runtime for `composer` therefore stales `composer`'s version for every other case in the stack, including primary-mailbox cases. Per-mailbox isolation does not isolate the generation. Decision: all mailbox and membership rows exist before publication. Verification: confirm on the Rails side that the version header check compares against the current generation; that code is uninspected.

**F51-03. Three stack classes per engine attempt** (new recommendation). Stack A holds every case that mutates only case-owned drafts, operations and read state: READ-001-P, READ-002-F2, DRAFT-001-F1/F2, DRAFT-003-P/F1/F2, DRAFT-008-F2. Stack B holds AUTH-006-P alone, because recovery changes `auth.users` state and may revoke or create Auth sessions for the actor. Stack C is the existing-case worker's revocation stack. Each stack is a fresh seed run, which the seed already demands at `acceptance_seed.rb:15`. Cost is one extra seed and Auth dataset per engine. Dissent preserved: running AUTH-006-P as the terminal case of Stack A is cheaper and works if the one-time entry does not change the password. I reject it because it reintroduces order dependence, which invariant 3 forbids.

**F51-04. Recovery preparation for AUTH-006-P** (adapt proposal). Use `reader`, an active actor with a protected read to prove afterward. The sequence is: record the actor's Mailpit message count through Mailpit's internal HTTP API; trigger recovery through the real UI control if one exists, otherwise through Auth's public recover route from the runner; poll Mailpit for exactly one new message to that address within the five-second watchdog; extract the action link inside the runner only; navigate the browser to it; let real Auth verification and the server-staged handoff run; complete the explicit acceptance POST through the UI; perform one protected read; log out. Exported facts are booleans and counts only: one new message, link host equals the private Auth host, final URL has empty query and empty fragment, acceptance POST observed, protected read succeeded. The observer adds `auth.users.recovery_sent_at` set, Auth session count zero to one, and app session count zero to one, in that order. Likely failures: the link lands tokens in the URL fragment rather than the query, which is still a secret in browser history and must fail; or Mailpit receives nothing within the watchdog, which is an infrastructure failure, not a product failure. Verification: the staging route, the completion page, the Auth link format and Mailpit's reachability inside the private network are all uninspected. Freeze them before authoring.

**F51-05. Observer as a Ruby sidecar reusing the seed runtime** (adapt proposal). The seed already opens a database connection through `Runtime#database` at `acceptance_seed.rb:14` and reads `auth.users` and `app_auth` rows, so a privileged connection path exists in reviewed code. Build the observer in the same BE02 ops directory, reuse that runtime for configuration and connection, and listen on a unix socket mounted only into the runner container. Protocol is newline-delimited JSON, one request per line: `{query_id, attempt_id, phase, scope}` in, `{proof_ref, proof_sha256, facts}` out. Each request opens a new connection, runs `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, sets a two-second statement timeout, executes one parameterized query from a fixed catalogue, writes the full record to a task-private directory, and returns typed facts. Reads take no row locks, so the observer cannot inflate the one-second protected-write lock budget. Rejected alternative: a Node `pg` client inside the runner. It is smaller but puts a database credential into the Playwright process and duplicates connection logic that already exists in Ruby. Counterexample: both draft tables use `FORCE ROW LEVEL SECURITY` at `tables.sql:43` and `tables.sql:45`, and the private schema revokes application roles at `tables.sql:3`. A role without bypass sees zero rows and would report "absent" as a false no-effect proof. Mitigation: at startup the observer must assert that `pg_roles.rolbypassrls` is true for its role and that it can count both seeded drafts. Verification: the runtime's connection construction, its role, and whether a second connection can be opened are uninspected; request allocation of `acceptance_seed_support` for that review.

**F51-06. Fixed query catalogue** (new recommendation). Six queries, all keyed by synthetic IDs the case supplies:

| Query | Scope | Exported facts |
| --- | --- | --- |
| draft_state | org, mailbox, draft | exists, version, state, digest matches for subject/body/recipients |
| operation_outcome | org, actor, operation | exists, outcome enum, draft/mailbox binding match, detail present |
| operation_count | org, actor | count |
| read_state | org, mailbox, thread, user | exists, is_read, updated_at unchanged flag |
| membership_set | org, user | sorted mailbox/capability tuples, generation |
| session_state | user | Auth session count, app session count, recovery mark set |

The case supplies SHA-256 digests of the exact strings it submitted. The observer computes digests over the stored columns and exports equality booleans; raw digests stay in the private record. Do not compare `payload_digest` against anything the case computes, because the application's digest input is uninspected; export only existence and outcome for that column.

**F51-07. DRAFT-003-P contract** (accept proposal, sharpened). Steps: observer draft_state and operation_count baseline; Playwright `route.fetch` forwards the authentic PUT and receives the real response; the harness holds it; observer operation_outcome must report applied, draft_state must report version plus one and all digests matching F; only after that proof reference arrives does the harness abort delivery; the UI must show uncertainty; the page performs the real lookup of the same operation; the UI reconciles F and keeps the later buffer L unsaved; operation_count must still equal baseline plus one. The only transaction-completion signal available without a backend hook is receipt of the real response, which is valid only if Rails commits before writing the response. The observer step itself tests that assumption: an applied row with the response still held proves it. Likely failures: the client's ten-second abort fires before the proof arrives, which is still a real loss but must be recorded as client-initiated; or the observer sees unknown while the response is in hand, which is a product defect to report, not retry.

**F51-08. DRAFT-003-F1 contract** (accept proposal, sharpened). The forwarding gate is `route.abort` on first match followed by unrouting, with the page's network error observed as the completion signal. The settled-transaction requirement is vacuous here because no request reached the proxy, and the case must say so rather than claim rollback coverage. Proof: operation_count unchanged, draft_state version n with unchanged digests, taken after the page error. The real lookup returns the unknown outcome per `operations.sql:13`. The UI must keep the operation identity and text and must not mint a replacement operation; a second operation_count after lookup proves that. Likely failures: the route matcher is too broad and aborts an unrelated GET, or the UI silently retries with a new operation.

**F51-09. DRAFT-003-F2 contract** (accept proposal). Session B saves version n plus one; observer records B's digests. Session A submits with expected version n and its own operation; `route.fetch` receives the real conflict response; the observer must report an operation row with outcome `conflict` and draft_state still equal to B's digests; then the response is dropped; lookup returns the conflict detail. Evidence: the ledger accepts `conflict` at `tables.sql:37` and the lookup returns stored detail at `operations.sql:21`. Likely failures: the conflict path rolls back the ledger insert so lookup returns unknown, which is a recorded-conflict product gap and must not be replaced by an expiry sample; or the UI overwrites A's text with B's on conflict.

**F51-10. DRAFT-008-F2 contract** (accept proposal). Repeat F51-07 through the drop, then reload. Pass requires the UI to resume with the original operation identity, perform the lookup, and present F as saved and L as unsaved, matching the observer's draft_state. If the reload discards the operation identity, or presents server state with no uncertainty and loses L, record the matrix-required product gap. Likely failures: the UI stores the pending operation only in memory; or it claims L was saved.

**F51-11. Boundary and hostile samples** (adapt proposal). Seed them in a new typed `hostile_messages` section inserted during seed content so `verify_rows` confirms them. The seed's `IS NOT DISTINCT FROM` predicate at `acceptance_seed.rb:114` already verifies NULL columns correctly. Allowed nulls come from the supplied tables: null sender at `be02_threads/tables.sql:18`, null sent_at at line 20, null thread subject at line 6, empty recipients and empty body. Hostile literals: script tag, image tag with a remote host, a bare remote URL, a `javascript:` scheme, an encoded-word literal, a right-to-left override and zero-width characters. Assert `textContent` equality, zero requests to any non-`app.test` host via a request listener, and read_state unchanged across the GET. If the UI issues a separate mark-read write after the GET, record it as a distinct request; the invariance claim covers the GET only. Over-limit samples use the CHECK bounds at `be02_drafts/tables.sql:10` and `tables.sql:12`: subject 998 and 999, body 65536 and 65537 characters, plus 65536 four-byte code points as a byte-budget probe whose result is unknown. Whether HTTP validation rejects before the database, and whether a rejection records an operation, are uninspected; export both facts.

**F51-12. Transport control stays in Playwright routes** (accept proposal). No generic fault server, no product-route hooks. Each case records mechanism, phase and whether the client timeout fired.

**F51-13. Report integration** (adapt proposal). Request from root two additive fields in the case record: `db_proof_refs` as a list of `{proof_id, query_id, phase, sha256}` and `transport_injection` as `{phase, mechanism, client_timeout_fired}`. Proof records enter `artifacts.json` with a task-private sensitivity class. Schema edits belong to T0; this worker supplies the proposal and a validation sample.

**F51-14. Race-worker handoff** (accept proposal). The race worker receives session_state and draft_state only, with the same phase-acknowledgement rule. No barrier placement is designed here.

**F51-15. Confirmed inconsistency** (new recommendation). The seed inserts `read_state_version` into `app.thread_read_states` at `acceptance_seed.rb:108`, but the supplied table at `be02_threads/tables.sql:31` defines no such column. Either a later migration adds it outside the packet, or the seed fails at that insert with a redacted exit 1. Reconcile before any fixture extension. This is the one confirmed code-level defect in the inspected text.

## Blockers and defects

Defect count from inspected source: one, F51-15. Missing future controls: eight paths, all NOT_RUN. Unresolved blockers, each needing allocation or a root decision:

- **Private schema creation** under the restricted migration role, owned by the schema worker.
- **Seed runtime support file**: connection construction, role, second-connection ability, publish shape.
- **Row-level security policies** for both draft tables; observer role bypass must be proven, not assumed.
- **Draft PUT endpoint, validators, status codes and byte budgets**; the lookup endpoint that fronts `app.draft_operation`.
- **Auth staging and completion routes**, recovery link format, Mailpit API reachability.
- **Commit-before-response ordering** in the draft controller, tested by F51-07 but unverified.
- **UI uncertain-state storage** across reload, likely to expose a product gap.
- **T0 loader strictness** on seed schema version.

Review slices, each at most 200 lines: seed contract v2 plus loader change; seed membership and verification diff reviewed against the full 181-line seed; observer process; runner socket client; draft-loss spec covering DRAFT-003 and DRAFT-008-F2; boundary and hostile spec; recovery spec with Mailpit client; report schema delta with its validation test. This worker owns fixture, observer and case files. Root owns compose wiring, socket mounts, schemas and Docker execution. Application tests run only under root-controlled Docker.

## Decision table

| ID | Topic | Disposition | Dependency to inspect |
| --- | --- | --- | --- |
| F51-01 | Contract v2 additive memberships | adapt | T0 loader, publish method |
| F51-02 | No runtime shared-actor memberships | new | Rails version check |
| F51-03 | Three stack classes | new | root reservation cost |
| F51-04 | Recovery via Mailpit, query-free entry | adapt | staging route, link format |
| F51-05 | Ruby observer sidecar on socket | adapt | runtime support, RLS bypass |
| F51-06 | Fixed six-query catalogue | new | payload digest algorithm |
| F51-07 | After-COMMIT loss | accept | commit-before-response |
| F51-08 | Never-forwarded loss | accept | route matcher scope |
| F51-09 | Recorded conflict loss | accept | conflict ledger write |
| F51-10 | Uncertain reload | accept | UI pending-operation storage |
| F51-11 | Null, hostile and limit samples | adapt | HTTP validators |
| F51-12 | Playwright-only transport control | accept | none |
| F51-13 | Report fields | adapt | T0 schema |
| F51-14 | Race handoff | accept | none |
| F51-15 | read_state_version delta | new | later migration |

Obsidian was unavailable; every tradeoff above is analytical. No test described here has run.
