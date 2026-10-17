# BE02 private parameter repair

Status: **PATCHED / DOCKER NOT_RUN**. The coordinator owns the runtime rerun. This worker executed no Docker, SSH, host application tests, purchases, model/agent dispatches, or commits.

## Failure and cause

The coordinator reported that the second isolated fleet attempt passed through `auth-exact-four-column-read`, then failed `named-default-acl-boundary` at `helpers.sql:34`: `permission denied to set parameter app_auth.verified_user_id`. The failing load uses `SET LOCAL ROLE elevateo_session_owner`. This worker did not reproduce that runtime failure independently.

The required source of truth remains `supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`, launched with `/etc/postgresql/postgresql.conf`. No image, extension allowlist, role attribute, Compose configuration, function owner, facade signature, or product SQL function was changed by this repair.

Upstream PostgreSQL 17.6 establishes the narrow cause:

- [`functioncmds.c:608-629`](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/commands/functioncmds.c#L608-L629) processes function configuration through `GUCArrayAdd`.
- [`guc.c:6329-6342`](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/utils/misc/guc.c#L6329-L6342) requires superuser authority or an explicit `ACL_SET` grant when validating a function setting for an unknown/custom-placeholder parameter; the rejection emits the observed error.
- [`guc.c:1104-1141`](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/utils/misc/guc.c#L1104-L1141) creates ordinary custom placeholders as `PGC_USERSET`. Thus lacking the parameter ACL does **not** prohibit a runtime session's ordinary `SET`/`set_config` of that placeholder.
- [`fmgr.c:656-721`](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/utils/fmgr/fmgr.c#L656-L721) establishes function GUC nesting, switches to the definer, applies saved settings, and restores them on normal return; its error handling relies on transaction/subtransaction cleanup.

The official [function `SET` documentation](https://www.postgresql.org/docs/17/sql-createfunction.html) describes restoration on function exit, including function-local `SET LOCAL`. The [parameter privilege documentation](https://www.postgresql.org/docs/17/ddl-priv.html#DDL-PRIV-SET) distinguishes privileges for parameters otherwise requiring superuser access. Applying these upstream rules to the pinned Supabase build is a source-backed diagnosis; the actual pinned-image execution remains required evidence.

## Bounded repair

`ops/db/bootstrap.sql` now rejects unexpected ACL entries on exactly `app_auth.verified_user_id`, then grants only `SET` to the existing NOLOGIN, non-superuser `elevateo_session_owner`, without grant option. It permits the bootstrap administrator's own ACL entries and that one owner grant; PUBLIC, runtime, migration-role, unrelated-role, delegable owner, and owner `ALTER SYSTEM` grants fail closed. Postconditions verify the owner privilege and absence of effective parameter privileges on API, worker, read, owner, and migrator roles. Existing role-graph validation still runs first.

Only this 22-line parameter block was added to the pre-existing bootstrap work in the shared checkout. The coordinator's sequence-predicate fixes and other existing changes were preserved.

The authorization boundary is the existing narrow callable facade, role-specific RLS, and trusted principal binding inside functions. A runtime-supplied placeholder value is untrusted. Existing function-entry blanking, `set_config(..., true)`, saved caller-state restoration, private helper permissions, and Rails/Auth attestation requirements remain intact. This repair does not assert that arbitrary direct database clients may safely choose the facade's attested principal arguments; that existing trusted-server boundary is unchanged.

## Regressions added

All cases are wired into the existing Docker-only guard entrypoint; no new runtime path is needed.

| File | New coverage |
| --- | --- |
| `ops/tests/be02-guards/membership.sh` | Six forbidden grantees times two privileges = 12 hostile parameter ACL cases; owner grant option, owner ALTER SYSTEM, and unrelated grantee rejection = 3 more; missing owner SET grant repaired narrowly = 1. Total: 16 new top-level cases. |
| `ops/tests/be02-guards/fixture.sql` | Deterministic Auth session and two independent users/organizations; FORCE RLS with the actual private-owner policy expressions, plus an API read policy based on separate `app.user_id`/`app.org_id` context. |
| `ops/tests/be02-guards/private-grants.sql` | Real function definitions load as the non-superuser owner under hostile default ACLs; owner helper sees its own membership, denies a foreign membership/null principal, and restores its caller sentinel. |
| `ops/tests/be02-guards/private-grants.sql` | API forges the private setting with empty normal app context: direct membership query stays empty, owner role assumption fails, Auth token/private table/helper access remains denied. Session creation and organization listing return only the bound user's organization and restore the forged caller value. Wrong principal binding returns unauthorized and restores state. A duplicate digest raises after identity assignment and restores state on exception. |
| `ops/tests/be02-guards/private-grants.sql` | Worker forges the same setting and still cannot assume the owner, read membership data, or invoke API/helper functions; its allowed empty-queue facade still works. |

Runtime checks use `SET SESSION AUTHORIZATION` so their `SET ROLE` denial is evaluated for the actual runtime session identity, not a superuser session merely acting under another role. Hostile ACL injections and private function objects remain transactional and roll back. The existing scratch database cleanup and task-isolation logic is unchanged.

## Validation and coordinator handoff

Static inspection followed the actual bootstrap ordering, guard fixture, private policies, and session/helper code. A scoped `git diff --check` returned zero for tracked changes; guard files were already untracked in the shared checkout, so that command alone does not validate their content. SQL parsing/execution, shell execution, lint/type checks, Ruby tests, integration tests, and pinned-image parameter behavior are **NOT_RUN** by this worker. No runtime pass or completed independent review is claimed.

Use the existing bounded isolated harness on the approved fleet checkout; it runs the updated `guards` service before Auth/API/worker consumers and owns cleanup:

```sh
timeout --signal=TERM --kill-after=300s 2100s \
  python3 -B ops/tests/be02/run.py \
  --context default --expect-host Ubuntu-noble-latest-amd64-base
```

This is a proposed coordinator invocation, not a command executed by this worker. The harness's verified host, context, pre-cached image, disposable project, and credential requirements remain as documented in [the runtime harness](be02-runtime-harness.md). Do not run this against a shared application database: parameter ACLs and roles are cluster-wide even though the guard data lives in a scratch database.

The exact bounded database probe is the existing `named-default-acl-boundary` case under this harness: it loads the real function SQL as `elevateo_session_owner`, then exercises owner binding and both runtime identities, normal return, early return, exception restoration, and hostile default privileges in one rolled-back transaction. The preceding 16 parameter cases probe deny/repair behavior with 15-second statement and 5-second lock limits. Preserve any new failing label, SQLSTATE/error, and pinned-image evidence; no broader grants or removal of function-entry settings is justified without that evidence.

## Handoff file hashes

SHA-256 of exact on-disk bytes after this worker's patch; staging with newline conversion will produce different hashes. The bootstrap hash includes the coordinator's pre-existing changes. The report's own hash is supplied separately in the completion message to avoid a self-referential digest.

| File | SHA-256 |
| --- | --- |
| `ops/db/bootstrap.sql` | `5A665CF865CF84246F38EC8819F6E64E6A49E14105768A46BA8B3BA1DF15A225` |
| `ops/tests/be02-guards/membership.sh` | `4B507C8A0B7B79284C7A2135C13C2B651E48B06F2DFD64BA87E8A050F15F1675` |
| `ops/tests/be02-guards/fixture.sql` | `48F1B6CBF9D6C31989D0204D92FD7E1CB7BFCFA253317B02DF111D5DBE5181D9` |
| `ops/tests/be02-guards/private-grants.sql` | `37480C9B5C2DD2D1F442D556F0E09C6E9F0CEF4DE9E0331F9BF761932C226C02` |
