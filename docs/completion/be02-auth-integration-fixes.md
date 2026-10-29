# BE02 authentication integration fixes

Implemented in `Elevateo Mail - BE02 Codex` for task `task_95f3472ad038`, dispatch
`ctx_4b81714bf03f`. The original Auth checkout was not modified by this follow-up.
This is a source handoff; all application execution and acceptance remain **NOTRUN**
by this worker and reserved for the coordinator.

## Behavioral correction

`Sessions#authorize` now compares the canonical organization returned by
`authorize_session` with the organization in the authenticated identity before
returning the presentation session. A switch committed between authentication and
the protected read snapshot returns `409 context_changed`, including bootstrap
requests without context headers and requests carrying the new organization's
matching hints. Business reads cannot receive a session for a different tenant
than the principal already installed on their physical connection.

`SessionStore.check!` still runs first: definitive denial remains 401, an unavailable
organization remains generic 404, and database unavailability remains 503. The
comparison does not turn these statuses into context errors. Public Ruby/RBS
method signatures are unchanged; the signature comment states the tenant invariant.

## Authored regression coverage

Three tests were added to `session_lifecycle_test.rb`:

- Successful bootstrap authorization preserves the authenticated actor/organization.
- A canonical organization switch fails with absent hints or matching new hints.
- Database denial takes precedence over organization mismatch and stale hints.

Fifteen tests were added in `read_controller_test.rb`. They use the actual
`ApplicationController`/`ApiController`/`ReadController` request pipeline, real
`Sessions` and real `Tenancy`, with deterministic Auth/session-store/connection doubles.

| Boundary | Assertions authored |
| --- | --- |
| Successful protected read | Exact serialized bytes, security headers, physical connection identity, tenant claims, repeatable-read/read-only setup, authorize-before-read and commit-before-touch ordering |
| Organization visibility | No-organization 404 before tenant reads; bootstrap without context headers succeeds for the same organization |
| Request validation | Duplicate and encoded duplicate keys, unknown/malformed/oversized query, nonempty GET bodies and missing required context reject before authentication |
| Auth failure | Transient Auth returns 503 without a tenant snapshot, local revocation or cookie deletion |
| Context race | A switch after authentication fails bootstrap with 409 before the business projection executes |
| Revocation/expiry | Revocation during authentication precedes stale-context checks; denied or expired activity touch withholds an already rendered payload |
| Rollback/failure | Database exception, authorizer rollback and renderer rollback release no business payload and perform no activity touch |
| Serialization | Nil, oversized and invalid-encoding output fail before commit/touch |

Every request also checks tenant-frame and transaction cleanup. The adapter models
ActiveRecord's swallowed `Rollback` behavior explicitly. The expiry case models
the SQL unauthorized verdict, rather than claiming to exercise PostgreSQL clocks.

## Coordinator integration

Static inspection identified a second boundary issue: ActiveRecord can swallow
`Rollback` and return nil from the read snapshot, after which the wrapper previously
touched the session. The coordinator owns and has added the post-pool String guard
before touch in `ReadController`; both authorization and renderer rollback tests
target its controlled `500 internal_error` behavior. This worker did not edit that
controller. Coordinator acknowledgement: `msg_c9d4ed232f7a`.

The inspected controller dependency SHA-256 was
`ddc2c03838d884915b57b584d2c8f716229d0de825665b65e4f2c183a02df97b`.
No route, SQL, shared framework signature or configuration binding changes are
needed for this patch. The framework/RBS worker retains its separate ownership.

Before acceptance, the coordinator must run both changed test files inside the
authorized Docker environment, plus the relevant type/lint checks and real
Auth/PostgreSQL/RLS acceptance. These deterministic tests do not prove actual SQL
snapshot isolation, database expiry, SQL permissions, upstream Auth or concurrent
database transactions. Rails/Rack request initialization in the container is also
unverified until that execution. No host application tests, Docker allocation,
SSH, dependency change, subagent, commit, push or live action was performed here.

## Exact source handoff

Hashes are SHA-256 over the current file bytes; all paths are relative to the
integrated checkout. The report's own hash is supplied in the completion message
to avoid a self-referential manifest.

| Owned file | Lines | SHA-256 |
| --- | ---: | --- |
| `apps/server/lib/elevateo/sessions.rb` | 143 | `ba2e611ec28da3e46807a74e6bc46adc04e7b99d7b279a241769e5b9e6aab254` |
| `apps/server/sig/sessions.rbs` | 28 | `2f5d8b9e99b657fda31931cf5c01b56c519706413f692b913b64558af6b5a84c` |
| `apps/server/test/be_02/session_lifecycle_test.rb` | 160 | `2f6326edf1698ff4ae60ff497b91269260609f3a0f220f626562311358175b2f` |
| `apps/server/test/be_02/read_controller_test.rb` | 290 | `89515434f8967ed71bd498e5d9629e724e8deacb2a8d1db63ed352368fa7effb` |

For bounded coordinator review, the new controller test can be divided into lines
1-150 (adapter, pipeline and success cases) and 151-290 (denials, rollback and request
helpers), with its cross-boundary ordering assertions reviewed together. No
adversarial agent review or runtime passing result is claimed by this worker.
