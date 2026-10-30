# BE-02 D collaboration implementation handoff

Dispatch: `ctx_af4f21caa253`; task: `task_4b86fabe6d6a`; branch: `feature/codex-be02-integration`.

Implemented the five thread collaboration actions against canonical contract `1.0.0-collaboration.1`, using accepted D01-D08 and the shared protected-write foundation. This is an implementation snapshot, not a passing-runtime claim. No Docker command, host application test, commit, publication, agent spawn, or paid session was run by this worker. Existing unrelated dirty work was preserved.

## Implemented behavior

- Read state derives the actor from the authenticated identity. An absent false state returns version 0 and null time without inserting; a changed state increments the bounded version and timestamp. No-ops preserve both, including at the maximum version. B continues deriving unread from the existing `is_read` boolean, and GET remains read-only.
- Assignment GET returns null/version 0/null when absent. PUT checks current thread visibility and target organization/mailbox readership before comparing the expected version, including before a no-op. The first competing writers contend on a zero-version row; later writers lock that row. Only a real change at maximum version returns 503. Former assignee UUID attribution survives membership removal.
- Notes preserve exact plaintext, including whitespace and valid control characters, up to 4,096 code points. NUL, empty text, invalid encoding, oversized text, unknown keys, invalid UUIDs, and invalid versions are rejected at the shared boundary. Notes are immutable and unique by organization and note UUID. A first insert returns 201; exact same-author retries return 200; a currently visible own-note binding/body mismatch returns 409; hidden or other-author collisions return the canonical generic 404.
- Note lists use the existing signed cursor authority and `ReadResponse.page`, ordered by `created_at ASC, id ASC`, with at most 50 whole entries and a 262,144-byte serialized response. Current resource authorization precedes cursor validation. POST accepts and returns at most 65,536 bytes; other writes retain 8,192-byte requests and 4,096-byte responses.
- All unavailable collaboration resources use the shared closed `CollaborationError` message `This item is unavailable.`; legacy A/B `AuthError` was not widened by this worker.

## Integration seams

The controllers inherit `V1::WriteController` and reuse `protected_read` for GET. Mutations return `Elevateo::WriteResponse` from the caller-owned READ COMMITTED transaction; they never start a nested transaction or call Auth HTTP while locks are held. Serialization and response validation occur before commit.

`guard_users` is a keyword callable receiving `input:` and `query:`. Assignment returns `[canonical_assignee_id]` for a non-null target and `[]` for clearing; the foundation always adds the actor and locks sorted generation guards. Other D writes supply a validation callback returning `[]`. The shared foundation owns syntax/byte/proof checks, session locking, deadline checks, sorted generation locks, and rollback on raised errors.

`app_auth.collaboration_reader(digest, mailbox, target)` uses the foundation's owner-only `assert_protected_write` helper and its private transaction marker. The helper checks actor mailbox visibility and target membership with scoped session-owner RLS; it does not trust caller-set guard claims. The API receives only EXECUTE on this helper, not mailbox membership DML. The foundation author confirmed the interface and added rollback-safe handling for shared response projection/overflow exceptions.

Required routing is already present in coordinator-owned `apps/server/config/routes.rb`:

| Verb | Path | Controller action |
| --- | --- | --- |
| PUT | `/v1/threads/:thread_id/read-state` | `v1/thread_read_states#update` |
| GET | `/v1/threads/:thread_id/assignment` | `v1/thread_assignments#show` |
| PUT | `/v1/threads/:thread_id/assignment` | `v1/thread_assignments#update` |
| GET | `/v1/threads/:thread_id/notes` | `v1/thread_notes#index` |
| POST | `/v1/threads/:thread_id/notes` | `v1/thread_notes#create` |

Controllers read `request.path_parameters` rather than `params`, so Rails cannot parse a JSON body before the raw duplicate-key/actual-byte boundary. The matching ActionDispatch RBS declaration lives in `sig/thread_collaboration.rbs`; avoid adding a duplicate declaration elsewhere.

## Database and fixture integration

Migration `20261013000005_create_app_collaboration.rb` runs `tables.sql`, `policies.sql`, and `target_reader.sql`. It must follow the protected-write migration `20261013000003` and existing B schema. Normal numeric migration order also includes C `20261013000004` before D and membership `20261013000006` after D.

The new migration adds `read_state_version` to the existing B table. Existing persisted B rows become version 1 without changing their boolean or timestamp; absent rows remain the version-0 wire state. Assignment and note relations use composite organization/mailbox/thread foreign keys and forced RLS. Notes permit INSERT only, assignments permit INSERT of identity columns and UPDATE of mutable state columns, and read-state writes cannot update actor or scope identity columns. No direct membership writes are granted.

The D down script removes only D tables, helper/policies/grants, and the added read-state version. It leaves existing B booleans/timestamps and C/membership structures intact. For a B down/reapply probe, remove D and C before B, reapply B then C then D, and roll back the whole probe. Membership revisions reference mailboxes, so they stay installed in that probe. Never remove the protected-write foundation while the D helper still depends on it.

The coordinator explicitly delegated `apps/server/test/be_02/thread_database_test.rb` for narrow compatibility changes: D metadata is now selectable, a claims-free allowed-column UPDATE affects zero rows and preserves data, identity-column updates remain denied, and the B rollback probe respects C/D dependencies. No shared fixture helper was edited. The new D fixture helper uses real API connections, guards authorization-changing fixture DML, and cleans only its own actors/foreign organizations.

The coordinator's `ops/tests/be02/test-suites.sh` already discovers all new `test/be_02/*_test.rb` suites. Its database must apply the complete migration sequence before these suites run. A shared fixture initializer that enumerates SQL parts manually must include D's three up parts in migration order; there is no D-specific seed requirement.

## Verification status and prepared coverage

| Check | Status | Prepared evidence |
| --- | --- | --- |
| Source/contract/interface inspection | Performed | Shared foundation, routes, cursor/projection, D SQL, service/controller tests, B compatibility inspected |
| Ruby syntax, RuboCop, Steep | NOT_RUN | Coordinator must execute inside Docker |
| Service and controller tests | NOT_RUN | Exact envelopes, status/error ordering, no-ops/maxima, raw bytes/duplicate keys, immutable replay, Unicode/control characters |
| Actual PostgreSQL service/RLS tests | NOT_RUN | Actor/private/foreign/revoked isolation, minimum grants, UUID history, composite relations, database bounds |
| Concurrency tests | NOT_RUN | Differing read states across sessions, assignment CAS winner, both sides of target-revocation barrier, duplicate-note collapse and other-author collision |
| Migration reversal and B compatibility | NOT_RUN | Scoped D down/up and transactional B+C+D rollback/reapply probes |
| Adversarial agents/design review | NOT_RUN | Coordinator owns reviews; worker was explicitly prohibited from spawning agents |
| Actual UI/end-to-end validation | NOT_RUN | Outside this backend worker's ownership; required before publication |

New tests exercise actual services rather than a duplicate business implementation. Controller tests use the real protected-write/read paths with canned database responses; separate database tests use the actual API login and SQL guards. Concurrency ordering uses observed PostgreSQL lock waits, and fixture SQL has bounded statement/lock timeouts.

Five issues found during worker self-inspection were corrected: cursor decoding preceding visibility, a missing read-pool method in the controller test harness, unguarded foreign fixture teardown, obsolete B read-state privilege expectations, and B rollback ignoring C/D dependencies. Self-inspection defect count: 5 corrected; density: 2.71 per 1,000 lines over the 1,844-line submitted review surface (including the full delegated B file). This is not an adversarial-review result or a claim that remaining defects are zero. The coordinator must record formal review findings and density in its owned `code-reviews.md`.

## File ownership and bounded review slices

Each row below is a separate review assignment of at most 200 lines, with written contract/context supplied separately. Do not combine rows past the cap. Line counts are the handoff snapshot and include blank/comment lines. The delegated B file has two slices; all other files are new. Formatting belongs to the coordinator's linters.

| File, relative to `apps/server/` | Lines |
| --- | --- |
| `db/be02_collaboration/down.sql` | 1-14 |
| `db/be02_collaboration/policies.sql` | 1-38 |
| `db/be02_collaboration/tables.sql` | 1-36 |
| `db/be02_collaboration/target_reader.sql` | 1-40 |
| `db/migrate/20261013000005_create_app_collaboration.rb` | 1-18 |
| `lib/elevateo/thread_collaboration.rb` | 1-71 |
| `lib/elevateo/thread_read_state.rb` | 1-50 |
| `lib/elevateo/thread_assignment.rb` | 1-80 |
| `lib/elevateo/thread_notes.rb` | 1-99 |
| `app/controllers/v1/thread_read_states_controller.rb` | 1-20 |
| `app/controllers/v1/thread_assignments_controller.rb` | 1-32 |
| `app/controllers/v1/thread_notes_controller.rb` | 1-34 |
| `sig/thread_collaboration.rbs` | 1-27 |
| `sig/thread_read_state.rbs` | 1-14 |
| `sig/thread_assignment.rbs` | 1-21 |
| `sig/thread_notes.rbs` | 1-27 |
| `test/be_02/collaboration_concurrency_test.rb` | 1-112 |
| `test/be_02/collaboration_controller_helper.rb` | 1-80 |
| `test/be_02/collaboration_controller_test.rb` | 1-98 |
| `test/be_02/collaboration_database_helper.rb` | 1-184 |
| `test/be_02/collaboration_database_test.rb` | 1-140 |
| `test/be_02/collaboration_schema_test.rb` | 1-81 |
| `test/be_02/collaboration_services_test.rb` | 1-142 |
| `test/be_02/thread_notes_database_test.rb` | 1-85 |
| `test/be_02/thread_database_test.rb` | 1-200 |
| `test/be_02/thread_database_test.rb` | 201-301 |

Dedicated design review should examine the zero-row first-assignment contention, historical UUID attribution, target verification under sorted generation guards, and hidden-note replay behavior. Those choices follow accepted D01-D08; no new architecture approval is requested. The coordinator retains shared integration, Docker verification/cleanup, adversarial/design review and its required tradeoff evidence, root documentation, and any eventual commit.
