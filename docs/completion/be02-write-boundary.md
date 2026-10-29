# BE02 C/D protected-write boundary

<!-- AIDEV-NOTE: Boundary handoff only; draft/collaboration integration and runtime QA remain coordinator-owned. -->

Implemented against D03/D05 and `be02-cd-contract.md`, canonical SHA-256
`859041382484a3a001ae087ca88e02eeb23540f2cf46aec795b064aa8ea66073`.
All added tests are **NOT_RUN**: this dispatch forbids host tests, Docker/SSH,
agents and paid calls; the coordinator owns Docker execution and acceptance.
No commit, push, live send, or production activation was performed.

## Controller and service interface

`V1::WriteController < V1::ReadController` provides:

```ruby
protected_write(allowed_query: [], required: [], max_bytes: 8192,
                budget: 4096, guard_users: nil, body: true) do
  |connection:, identity:, session:, input:, query:, deadline:|
  Elevateo::WriteResponse.new(json: serialized_string, status: 200)
end
```

`guard_users` is an optional **keyword** callable receiving `input:` and
`query:` and returning at most two target user UUID strings. The actor is
always added and guarded by SQL. UUIDs are canonicalized before binding;
duplicates do not create extra locks. Bodyless DELETE uses `body: false`,
rejects even one actual body byte and yields `{}`. PUT/POST accept only the
exact required JSON keys. Query keys are closed; duplicate decoded keys and
malformed percent escapes are rejected. Authentication runs after transport
validation and before checkout or transaction ownership.

`WriteInput` provides the transport, bounded stream, JSON, query, UUID,
Unicode text, mathematical integer and boolean validators. Actual max+1
stream consumption ignores Content-Length as an authority, handles short
reads, and rejects oversized data, duplicate nested keys, invalid UTF-8,
NUL and isolated surrogates. Origin must equal configured browser origin;
JSON with optional UTF-8 charset and identity content encoding is accepted.

C/D reads continue calling inherited `protected_read`. The subclass changes
only their query parser and fixed error envelope. `CollaborationError` owns
the C/D vocabulary, bounded request ID and exact 404 message
`This item is unavailable.`; A/B endpoint behavior and AuthError are unchanged.

The business block must return already serialized `WriteResponse` bytes.
Only 2xx or terminal 409 responses can commit. JSON shape, Unicode validity
and response byte budget are checked while all guards remain held. Raised
errors, invalid projections, oversized responses and explicit Rails
Rollback roll back; terminal draft conflict ledgers can commit with their
serialized 409. Other error statuses must be raised, not wrapped in a
WriteResponse. This boundary does not retry business transactions.

## Database ownership and lock order

Migration `20261013000003` loads `db/be02_writes` under
`elevateo_session_owner`. It adds private session transaction/guard-user
markers and two fixed-search-path, parameterized security-definer seams:

- `begin_protected_write(text, uuid, uuid, uuid[])`: API executable. Locks
  cookie-bound session first, then distinct actor/target generation tuples
  in sorted user UUID order in the selected organization. Each missing
  generation is inserted and locked before advancing to the next tuple,
  avoiding a batch-insert inversion. READ COMMITTED is mandatory.
- `assert_protected_write(text, uuid)`: owner-only execution for C/D
  security-definer functions. Rejects absent, stale-transaction, unguarded
  actor/target or inconsistent claim proofs before business inspection.

The cookie-bound session supplies actor/organization authority; caller GUCs
only assert consistency. After the final lock, session state, wall-clock
expiry, current Auth SQL policy, access credential expiry and selected
organization membership are checked again. Ruby then checks returned status
before context/version and CSRF with existing presentation crypto. A revoked
session therefore produces 401 before a stale-proof 409. No positive TTL is
introduced and no Auth HTTP runs under these locks.

The private xid8 marker equals the current full transaction ID and cannot be
reused after commit or fabricated by setting public GUCs. It proves entry
and lock ownership to SQL business seams; context/version/CSRF presentation
validation remains Ruby's responsibility. API/worker/read roles have no new
private table or column access, no direct assertion execution, and no direct
mailbox-membership DML. Migration postconditions check effective grants.
The separate app_auth.verified_user_id permission repair remains elsewhere.

## Deadline decision and failure semantics

**Superseding write-only decision, adopted 2026-10-13:** the coordinator's
`docs/completion/be02-write-deadline-decision.md` at SHA-256
`0874d5ae89f66bd4fc1972276fe1205678a8b0e1ac6adb8d866e2f72ff293953`
and D05 amendment authorize the bounded ownership/deadline repair. The
paragraphs below describe the prior implementation and are not acceptance
evidence for that repair. Use one monotonic ten-second budget, interruptible
bounded Ruby work inside established tenancy, narrowly typed statement access,
and interrupt-deferred adapter calls and ownership transitions. Every abnormal
exit must dispose of the owned connection without checking in an adapter that
Rails removed or transferring an adapter to the wrong owner. Observe expiry
before/after statements, before body completion, after the transaction and
immediately before rendering; suppress expired protected output.

The budget is not an absolute return-time or rollback guarantee: connection
establishment, native driver calls, cleanup and COMMIT/WAL processing can
outlast it. Keep uncertain draft operation IDs, exact payload/binding, expected
versions and unsaved edits for authorized lookup or same-ID replay. A missing,
expired or inaccessible result does not authorize a replacement operation ID.
Other writes retain their existing resource identity and compare-and-swap
semantics; a reread is not causal proof and does not authorize a non-idempotent
automatic retry. Protected-read timing is outside this scoped decision.
WG-01/WG-02 guard changes apply only to new disposable test databases; no
persistent applied migration is changed. Implementation and Docker acceptance
remain pending, including real pool-size-one ownership/failure schedules.

The pinned Docker database is Supabase PostgreSQL `17.6.1.136` with digest
`sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`.
PostgreSQL 17's [transaction_timeout documentation](https://www.postgresql.org/docs/17/runtime-config-client.html#GUC-TRANSACTION-TIMEOUT)
specifies termination of sessions exceeding the transaction duration.
The [PostgreSQL 17.6 source](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/tcop/postgres.c#L3451)
(`assign_transaction_timeout`) shows that setting a positive value does not
rearm an already active timer. The helper therefore resets the local timer
to zero, recalculates remaining request budget after checkout/transaction
setup, then arms the native timer before any guard locks. Unsupported
servers fail at the setting; there is no fallback that weakens the guard.

This repairs a concrete tradeoff failure: with one second remaining, two
0.8-second SQL statements each pass a one-second statement timeout but hold
the transaction for 1.6 seconds. A native remaining-budget timer includes
successive statements and idle Ruby serialization, with statement/lock caps
also limited by remaining time. Pool checkout receives the remaining budget
and expiry is checked again immediately after checkout. Response validation
and deadline checks run before commit and again after checkin.

Only the inherited `RequestDeadline::Expired` asynchronous interrupt is
deferred while the helper owns checkout, transaction and checkin. Native PG
termination releases database locks; Rails unwinds the transaction, and a
database failure physically disconnects the adapter before checkin. The
outer body/Auth deadline remains active. No additional Ruby Timeout is
introduced around an owned transaction.

Practical limits remain explicit: pool timeout bounds queue waiting, not a
stalled connection establishment or network handshake; BEGIN and claim/timer
setup happen before the native timer is armed and before guard acquisition.
Transport/driver connection timeouts and scheduler/network latency still
bound those phases. Timer granularity is milliseconds. Server termination
during commit, lost commit acknowledgement or a deadline observed after
commit can leave the client unsure whether a transaction committed; report
503 and reconcile using the operation ID/current server state, never blindly
retry the transaction. No runtime timing claim is verified until Docker runs.

## Test inventory and remaining integration

All six suites below (41 test methods) are **NOT_RUN** and belong in the
coordinator's Docker run:

| File under `apps/server/test/be_02` | Intended evidence |
| --- | --- |
| `write_boundary_input_test.rb` | Closed/duplicate JSON and queries, UTF-8/NUL/surrogates, numerical bounds, exact Origin/media, short/max+1 reads, response errors |
| `write_boundary_controller_test.rb` | Auth before locks, guard-before-business, keyword targets, DELETE, 401/409 ordering, context/version/CSRF recheck, rollback and terminal 409 commit |
| `write_boundary_deadline_test.rb` | Pool budget/expiry/checkin, recomputed SQL budget, physical disconnect, serializer failures, precommit expiry, deferred HTTP interrupt |
| `write_boundary_database_test.rb` | Actual runtime privileges, private marker/bypass denial, transaction replay denial, selected authority, target limits, rollback |
| `write_boundary_concurrency_test.rb` | Session revoke ordering, generation/revocation races, wall-clock expiry after waiting, sorted missing-row insertion |
| `write_boundary_database_deadline_test.rb` | Native PG17 cumulative statement and idle serialization expiry, rollback and released guard locks |

`write_boundary_test_helper.rb` supplies the deterministic adapter/controller
harness. `write_boundary_database_test_helper.rb` reuses the isolated A test
fixtures; it creates and removes only test-owned extra generation tuples.
RBS declarations cover the new public/private seams. The coordinator
authorized only two existing-file seam additions: ConnectionPool `checkout`
and `checkin` in `sig/rails_seams.rbs`.

Remaining coordinator work: integrate migrations and C/D controllers/routes,
add these suites to the Docker runner, update existing exhaustive SQL ACL
allowlists for the new functions without widening A entrypoints, then run
lint, strict RBS, unit/integration/concurrency tests and endpoint acceptance.
The coordinator owns root state, documentation, code-reviews.md coverage and
defect density, adversarial review acceptance, and task Docker cleanup.
The design reviewer was sent the repaired SessionWrites/RBS for bounded
re-review; their baseline report records the latest repair as unreviewed
drift, so re-review and native execution remain outstanding. No application
completion, visual QA or publication gate is
claimed by this boundary-only handoff.
