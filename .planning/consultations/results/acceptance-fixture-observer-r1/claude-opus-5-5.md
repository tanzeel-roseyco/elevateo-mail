# ACCEPTANCE-FIXTURE-OBSERVER-R1: Opus 5.5 independent opinion (task 2)

**Basis.** This opinion uses only the frozen packet. No tools were run and nothing was executed, so every runtime claim below is NOT_RUN. The Obsidian connection is unavailable, and the tradeoff simulations below are analytical only. Recommendation IDs use the prefix **O55-**.

**Verdict: change.** The design is supportable as a small extension. It needs:
- a versioned seed (v2),
- one private read-only observer sidecar with a fixed protocol,
- per-case-class fresh stacks,
- Playwright route gating with recorded provenance.

Two prerequisites block implementation. Each is cited below with its evidence:
1. The private schema creation, which is owned by the schema worker and **not counted here**.
2. The observer's read privilege on a FORCE RLS private schema.

---

## Defect accounting

- **Confirmed code defects: 0.**
- **Candidate defect or schema delta: 1 (O55-02).** `acceptance_seed.rb:107-109` inserts `read_state_version` into `app.thread_read_states`. The supplied DDL (`be02_threads/tables.sql:31-43`) has no such column. A later migration that was not supplied may add it. Until that is reconciled, the seed either fails, or the observer's read-state facts are defined against the wrong shape.
- **Missing future acceptance controls:** the 8 assigned paths and the observer handoff. These are controls, not defects.

---

## Recommendations

### O55-01: Lifecycle is fresh stack per (engine × attempt × isolation class). Adapt proposal.

**Evidence**
- `acceptance_seed.rb:15-16` refuses a used Auth fixture.
- Generations are keyed per `(organization_id, user_id)` (`:155-157`).
- Revocation advances them by 4 (`:69`).
- The authorization version is frozen at seed time (`:149-151`).

**Design.** Define three isolation classes:
- **SHARED-RO:** READ-001-P, READ-002-F2, DRAFT-008-F1 reads.
- **CASE-MUT:** DRAFT-001-F1/F2, DRAFT-003-*, DRAFT-008-F2. These mutate only case-owned drafts with fresh UUIDs, so generations are untouched.
- **ACTOR-GLOBAL:** AUTH-006-P (credential change), READ-001-F2 revocation, and later session races.

Every ACTOR-GLOBAL case gets its own fresh stack. SHARED-RO and CASE-MUT share one stack per engine × attempt.

**Why not isolated resources.** A second mailbox for a revocation victim still bumps the actor-global generation. That invalidates the `authorization_version` held by every later case for that actor. Per-mailbox resources alone do not isolate this.

**Counterexample.** Suppose READ-001-F2 runs before DRAFT-003-P on the same stack, with the actor `composer` revoked. The next save fails as an authorization mismatch, not as the scenario under test. The result then depends on test order.

**Analytical tradeoff.** If seeding takes S seconds and there are k ACTOR-GLOBAL cases, the added time is about k·S per engine. This is acceptable under sequential execution, and it is far cheaper than debugging order-dependent failures. Generation rewinds are rejected outright.

**Verification.** Each case record carries a `stack_id`. T4 rejects any ACTOR-GLOBAL case whose `stack_id` appears on another case.

**Owner.** Root (topology and namespaces).

**Slice.** Launcher namespace change, ≤120 lines.

### O55-02: Reconcile the schema delta before any seed v2 edit. New recommendation.

**Evidence.** `seed.rb:107-109` conflicts with `tables.sql:31-43`, as described above. The packet also warns that tables may change after this snapshot.

**Requirement.** Before editing, the fixture worker obtains the post-repair DDL for these tables:
- `thread_read_states`
- `thread_assignments`
- `thread_notes`
- `organization_memberships`
- `mailbox_memberships`
- `app_auth.*`

The worker records a column-by-column delta table and its hashes in the PR.

**Failure.** The observer reports `is_read` unchanged but ignores a `read_state_version` bump, so a GET that mutates state passes as invariant.

**Owner.** Fixture worker, with input from the schema worker.

### O55-03: Seed contract v2 is additive, typed, and exactly verified. Adapt proposal.

**Evidence**
- `scope_ids` covers one mailbox per org (`:163`).
- `seed_scopes` creates exactly primary and other (`:42-48`).
- `verify_actors` requires `rows.length == 1` (`:139`).

**Design.** Bump to `schema_version: 2`. The nine actors and their base `organization`/`mailbox`/`capabilities` stay byte-identical. Add:
- `mailboxes.primary_secondary` and `mailboxes.primary_restricted`, both in the primary org.
- An `extra_mailbox_memberships` array of `{actor, mailbox, capabilities}`. Initially it has one entry: `approver → primary_secondary: ["read"]`. That gives the actor a different set from their primary set `{read, compose, approve_send}`. No actor gets `primary_restricted`.
- `data.thread_primary_hostile` (see O55-05).

**Verification change.** `verify_actors` compares the **complete set** of `(mailbox_id, capability-set)` rows to base plus extras. It does not loosen the `length == 1` check to "at least one". Base meaning is still checked against the base mailbox row.

**Choice of actor.** The actor `approver` is chosen because DRAFT-008-F1 depends only on their primary-mailbox compose role. The actors `revoked`, `disabled`, `no_membership` and `other_org` must never receive extras, and the verifier enforces that.

**Generations.** The extra membership is inserted inside the seed transaction, before `verify_actors`. The published `authorization_version` therefore already reflects it.

**Failures**
- (a) A future edit adds an extra for `revoked`, silently changing READ-001-F1 meaning. The verifier must reject it with `base_actor_meaning_changed`.
- (b) Loaders that still parse v1 accept v2 while ignoring the extras. The loader must reject unknown versions.

**Verification (NOT_RUN)**
- Seed succeeds on a fresh stack.
- A mutated contract with a duplicate extra fails.
- Mailbox listing for the actor `approver` returns exactly 2 mailboxes with exact capability sets, and excludes `primary_restricted`.
- `manager_primary` must still see only what their memberships grant.

**Owner.** Fixture worker. The T0 owner approves the contract.

**Slices.** Seed changes ≤150 lines; contract and loader ≤100.

### O55-04: Private observer as a sidecar with a fixed line protocol over a socket. New recommendation, choosing between candidates.

**Evidence.** There is no inspected existing observer or barrier harness; the controls design lists BE02 barriers as unchecked. A fixed-protocol private file/socket control is therefore justified, and it must not invent harness functions.

**Design**
- **Location.** One container on the task network with a Unix socket on a volume mounted **only** into the runner container. It publishes no TCP port. Browser contexts cannot reach it.
- **PG access.** It holds PG credentials, which never go to the runner.
- **Transactions.** Each request opens a **new connection** with `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, runs fixed parameterized queries, and closes.
- **Timeouts.** It sets `statement_timeout` to 2s and `default_transaction_read_only=on`.
- **Request format:** one JSON line `{v:1, op, stack_id, case_id, phase_ack, ids{…}, expect_sha256?}`. The op is one of the fixed set below.

| op | Typed facts returned |
|---|---|
| `draft_state` | exists, `version`, `state`, `actor_matches`, `content_sha256_matches` (computed over subject, recipients and body in a fixed canonical form), `updated_at_changed` |
| `operation_state` | exists, `outcome ∈ {applied, conflict, null_detail}`, `binding_matches` (mailbox and draft), `expired` |
| `read_state` | row exists, `is_read`, plus the reconciled version column per O55-02 |
| `session_state` | `auth_session_count`, `app_session_count` for one actor. This is the handoff point (O55-10). |

- **Scope checks.** It rejects any ID whose organization is not one of the two seed orgs for this `stack_id`, and any actor not among the nine.
- **Response:** `{proof_ref, snapshot_taken_at, facts}`, where `proof_ref` is a SHA-256 over the request, facts and a stack nonce.
- **Content stays private.** Exact content is compared inside the observer against the runner-supplied hash of the frozen submission. Content is never returned.
- **Errors.** Timeouts, errors and scope violations return `{error_code}` only. The runner maps them to `blocked` or `failed`, **never** to absence.

**Privilege.** This is the blocker. The private schema revokes PUBLIC/api/worker access (`drafts/tables.sql:3`), and both tables are `FORCE ROW LEVEL SECURITY` (`:43,45`). Even a granted SELECT sees zero rows without a policy or BYPASSRLS, and zero rows is exactly the false absence proof that invariant 5 forbids.

Options:
- **(a) Recommended:** a test-profile-only role `elevateo_acceptance_observer`. It is created by root's fixture bootstrap rather than the product migration lane. It has LOGIN, BYPASSRLS, SELECT on the named tables only, and USAGE on the two schemas, and it does not exist in production images.
- **(b) Rejected:** a test RLS policy inside the migration, which puts test authority into product schema.
- **(c) Rejected:** calling `app.draft_operation` with the actor's GUCs set. That conflates observer authority with API authorization, and its `STABLE` definer semantics and `draft_scope` are uninspected.

**Dissent preserved.** BYPASSRLS is broad within its database. A reviewer may prefer a SECURITY DEFINER read function owned by a test-only role. That shifts the problem to function review without removing it.

**Failures**
- (a) The observer silently returns zero rows because of RLS. The bootstrap must self-check that it can see the seed's `draft_primary` and `operation` schema, or refuse to start.
- (b) The runner passes an arbitrary draft ID from another stack. The scope check returns `scope_violation`.

**Verification (NOT_RUN).** Unit tests with real PG, in Docker:
- each op happy path;
- the RLS self-check failing closed;
- out-of-scope ID rejection;
- the socket unreachable from a browser context (attempt `fetch` from the page; it must fail);
- no credential in any artifact (canary scan).

**Owner.** Root (container, role, socket). The fixture worker owns the query file.

**Slices.** Protocol and queries ≤180 lines; bootstrap role ≤60; tests ≤200.

### O55-05: READ-002-F2 uses a dedicated hostile thread and the observer for GET invariance. Adapt proposal.

**Evidence.** These fields are allowed to be null or empty:
- `threads.subject` is nullable (`:6`).
- `messages.sender` is nullable (`:18`).
- `sent_at` is nullable (`:20`).
- `body_text` defaults to `''` (`:22`).
- `recipients` is `'[]'` (`:19`).

The seed already carries literal `<b>` (`seed:86`).

**Design.** Add `thread_primary_hostile` with three messages:
1. All allowed nulls and empties.
2. Hostile plaintext: script tags, `<img src=http://tracker.invalid/x>`, `javascript:` link text, a bidi override, and a 998-character subject.
3. A null-`sent_at` ordering probe.

`sender.display_name` hostility depends on `app.thread_address_valid`, which is uninspected. Its sample stays NOT_RUN until that function is reviewed.

**Proof sequence**
1. Call `read_state` for `reader` × the hostile thread → before.
2. Run the real UI GET.
3. Call `read_state` again → after. All fields must be equal.
4. Check the browser request log for zero requests to non-`app.test` origins and zero `dialog`/console script markers.
5. Assert the DOM `textContent` equals the literal text, and that no `<a>` exists for the link-like text.

**Failures**
- (a) The detail GET marks the thread read. The observer shows `is_read` flipped, and the test fails.
- (b) The ordering differs for null `sent_at`. The ordering comment (`threads/tables.sql:46`) is evidence only, not an HTTP contract.

**Owner.** Fixture worker for the data; lane author for the case.

### O55-06: DRAFT-001-F1/F2 prove no overwrite through observed persisted state. Accept proposal.

**F1 (stale version CAS).** Two contexts for `composer` and a case-owned draft at version n.
1. Context B saves, and `draft_state` shows n+1 with content hash H_B.
2. Context A saves at n.
3. Assert the authentic conflict UI, retained local text, `draft_state` still at n+1 and H_B, and no applied operation row for A's operation (`operation_state` shows outcome `conflict` or absent; record which one).

**F2 (over-limit).** Use subject 999 characters and body 65 537 characters, together with 998 and 65 536 controls. These SQL limits are known (`drafts/tables.sql:10,12`). The HTTP validator, its status code and its byte budget are **not inspected**, so the test asserts "rejected without mutation", not a specific status.

**Edge samples.**
- Character counts versus bytes: use astral code points at the boundary. `char_length` counts code points.
- The direct API probe is labelled separately when frontend validation blocks dispatch.

**Failures**
- (a) The backend truncates rather than rejects. The hash mismatch shows it.
- (b) The UI disables Save, so no request reaches the backend. That is not proof of backend rejection, so record a separate sample.

**Owner.** Lane author.

### O55-07: DRAFT-003-P after-COMMIT loss uses a forward/hold/observe/ack/drop contract. Adapt proposal.

**Mechanism.** Use a Playwright `route` handler:
1. `route.fetch()` forwards the real request.
2. The runner awaits `operation_state` and `draft_state` and receives `{applied, binding_matches, version n+1, content matches F}` with a `proof_ref`.
3. The runner writes a `commit_observed` ack into the case log.
4. Only then does it call `route.abort()`.

Visibility on a new READ ONLY connection proves COMMIT; a held status code does not.

**Ordering.** The required order is `commit_observed → abort → lookup(O)`. Then:
- the UI shows uncertainty;
- the real lookup returns `applied` for the same O;
- a newer local buffer L stays unsaved;
- any same-O retry yields no n+2 (re-observe).

**Provenance risk.** `route.fetch` is issued by Playwright's network layer, not the page. Cookie, Origin, CSRF and header fidelity must be verified and recorded as `transport_provenance: route_fetch`. If the backend rejects it, or headers differ, the fallback is a root-owned gate in the private proxy. That is a dissent option, not a public route.

**Failures**
- (a) The observer times out. The case is `blocked`, and the held response is aborted with outcome `unknown_commit`. It is never reported as passed.
- (b) Observed `outcome=conflict`. The case fails with that real fact.

**Timeouts.** The 1s protected-write lock timeout is not stretched. The observer runs **after** Rails has responded, so it never sits inside the write transaction.

### O55-08: DRAFT-003-F1 no-forward loss uses a sealed gate. Accept proposal.

**Mechanism.** Abort in the route handler **before** any fetch, then seal the handler state to `CLOSED_FOREVER`. The seal is a closure flag, and any later invocation throws.

**Settled-path proof.** Unrouting is not the proof. The root proxy access log for this `stack_id` must show zero requests carrying the case's request marker. That marker is a harness header, recorded only if the proxy logs it, which is to be inspected. Then:
- `operation_state` and `draft_state` show absence, with version n unchanged.
- The real lookup returns `outcome: unknown` (`operations.sql:13`).
- The UI keeps O, F and the text, and stays uncertain.

The harness knowledge of non-commit never reaches the client assertion.

**Failures**
- (a) The proxy log lacks a correlatable marker. The result is NOT_RUN, not passed.
- (b) Retry middleware in the app resends the request. A second route invocation hits the sealed handler and fails the case.

### O55-09: DRAFT-003-F2 lost conflict response and DRAFT-008-F2 reload under uncertainty. Accept F2; adapt 008-F2.

**F2.** Run the O55-06 F1 race. Fetch A's request, then observe `operation_state` `outcome: conflict` with the draft unchanged. Ack, then abort. The lookup of the same O must return `conflict` within 7 days (`tables.sql:35`). Never use the `expired` branch.

**008-F2.** Create uncertainty as in O55-07, then reload. Assert one of two outcomes:
- (i) The UI issues a lookup carrying the **same** O (request log) and reconciles honestly.
- (ii) Record `PRODUCT_GAP: no durable uncertain-operation recovery`.

The status is failed with the gap code, not skipped. Client persistence (session storage or IndexedDB) is uninspected.

### O55-10: AUTH-006-P is a real recovery entry via private Mailpit on an ACTOR-GLOBAL stack. Adapt proposal.

**Design**
1. In its own stack, the runner triggers supported recovery for `reader` through the real UI.
2. The runner reads the message through Mailpit's API. That API is reachable only on the task network from the runner.
3. The runner drives the browser through the emailed flow into Rails `/auth/accept` → `/auth/complete` (query-free) → explicit POST acceptance.

**Artifacts.** Only the Mailpit message-ID hash, the step names and the final session fact (`session_state`) are recorded.

**Uninspected.** All of the following are uninspected, so implementation is blocked pending review:
- the recovery endpoint;
- the email link shape;
- whether the link transits a token-in-URL hop before staging;
- whether recovery forces a password change.

**Failures**
- (a) The link places a token in the browser URL. Fail and report a product gap against "no Auth token in browser".
- (b) No mail arrives within the watchdog. The case is `blocked`, not retried with a new actor.

**Session-race handoff.** `session_state` is the only shared op. The race worker owns the barriers, the lock-wait signals and their placement. The observer answers only after the ack the race worker supplies.

### O55-11: Root report integration. Accept proposal.

Each case record adds:
- `stack_id`
- `isolation_class`
- `transport_provenance` (`route_fetch` | `aborted_preforward` | `proxy_gate`)
- `phase_acks[]`
- `observer_proof_refs[]`
- `selected_branch`
- `product_gap_code?`

T4 rejects these records:
- a DRAFT-003-P record lacking `commit_observed` before `abort`;
- an F1 record lacking a `CLOSED_FOREVER` seal and a proxy zero-count;
- any proof_ref whose `stack_id` mismatches the case.

**Slice.** Schema plus validator ≤150 lines.

### O55-12: Reject a generic fault server or observer-as-API. Reject proposal.

Do not expose the observer through Rails, the proxy or a browser-reachable port. Do not let the observer accept SQL or table names.

---

## Unresolved blockers

1. **Private schema creation.** Owned by the schema worker, as noted above.
2. **Observer read privilege under FORCE RLS** (O55-04). This needs a decision and review.
3. **`read_state_version` schema delta** (O55-02).
4. **`route.fetch` header and cookie fidelity** against Rails CSRF/Origin/session-context checks.
5. **Uninspected dependencies:** the recovery flow and email link, `draft_scope`, `context_uuid`, `thread_address_valid`, HTTP validators/statuses/byte budgets, the proxy access-log format, `acceptance_seed_support`/publish, and client uncertain-state persistence.

## Decision table

| ID | Disposition | Owner | Gate |
|---|---|---|---|
| O55-01 Stack per isolation class | Adapt | Root | `stack_id` validator |
| O55-02 Schema delta reconciliation | New | Fixture + schema worker | Before seed edit |
| O55-03 Seed v2 exact extras | Adapt | Fixture worker | Fresh-stack seed + mutation tests |
| O55-04 Sidecar observer, socket, BYPASSRLS test role | New (dissent kept) | Root | RLS self-check |
| O55-05 READ-002-F2 hostile thread | Adapt | Fixture + lane | `thread_address_valid` review |
| O55-06 DRAFT-001-F1/F2 | Accept | Lane | HTTP validator review |
| O55-07 DRAFT-003-P ack-before-drop | Adapt | Lane + root | `route.fetch` fidelity |
| O55-08 DRAFT-003-F1 sealed gate | Accept | Lane + root | Proxy log marker |
| O55-09 F2 conflict / 008-F2 gap | Accept / adapt | Lane | Client persistence inspection |
| O55-10 AUTH-006-P | Adapt | Fixture + lane | Recovery flow review |
| O55-11 Report fields | Accept | Root (T4) | Validator tests |
| O55-12 No generic fault/API observer | Reject | All | — |

**Top three recommendations:**
1. Fresh stacks for actor-global mutations (O55-01).
2. Make COMMIT visibility on a new READ ONLY connection the only release condition before a drop (O55-07).
3. Resolve the observer's RLS privilege explicitly instead of letting it read zero rows as absence (O55-04).
