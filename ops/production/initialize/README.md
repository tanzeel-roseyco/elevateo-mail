# Held production initialization

This operator utility does nothing to a database by default. It is not a test runner,
deployment controller, signup endpoint, restore tool or authority to release outbound mail.
Keep `--apply` disabled until Callum accepts the exact isolated restore and independent reviews. Historical references to root below mean the approving coordinator, not automatic authorization.
Do not run `fleet-test.sh` on a production network or against a live DSN.

The gate target string remains `elevateo-mail-live/postgres` in `admission.py`; it is not the current Compose project name and does not identify a live host. Jeison must reconcile that legacy operator convention with the reviewed target before any apply. Fleet harnesses below are historical evidence, not current execution instructions. Use [the handoff](../../../docs/handoff/README.md).

## Runtime and commands

Use a separately reviewed private, immutable runner containing Python 3.11+, PostgreSQL 17
`psql`, Ruby 3.4.11, and the existing Rails locked bundle in `/usr/local/bundle`.
A disposable combined runner completed all 43 forward migrations against an isolated
Supabase restore; it is removed after rehearsal. Provision and independently accept the
exact private operator runner and real-data restore before any production apply.
Mount the complete reviewed repository read-only at any absolute root, evidence read-only
outside it, and inject only the protected environment described below. No Docker socket.
For apply, join only the independently verified target private network where `db` resolves
to the intended existing Supabase database. The offline digest does not identify a server.
No database ports or public network access are needed.

```sh
python3 ops/production/initialize/initialize.py schema
# Tenant plan additionally requires --organization-id, --user-id, --name, --role, --receipt and --subject.
# For either phase, append --apply --gate /absolute/protected/accepted-gate.json only after acceptance.
```

The first command prints the source digest and a HELD message without requiring credentials
or opening a connection. Tenant plans validate canonical nonzero UUIDs, a trimmed printable
1..200-character name, an existing role enum and a nonsecret 16..200-character receipt ref.
Organization/user UUIDs and name are operator-supplied reviewed values, never email lookups.
The Auth UUID must already exist, be email-confirmed, unbanned and undeleted, and have a
verified `custom:authentik` identity whose subject matches the approved UUID and whose email matches the Auth user and the company domain enforced by `tenant.sql` (`elevateoco.com`). The initializer never creates Auth users, identities or passwords.

Protected environment: `PGPASSWORD` is the existing Supabase administrator password.
Schema also requires `MIGRATOR_DB_PASSWORD`, `API_DB_PASSWORD`, `WORKER_DB_PASSWORD`,
`ATTACHMENT_GATEWAY_DB_PASSWORD` (32..4096 bytes, no NUL/newline), and `SECRET_KEY_BASE`
(64..4096 bytes). Supply the intended existing role passwords: reviewed bootstrap rotates
them on every invocation. Never put values in command arguments, reports or source.
Do not give this utility service tokens, signing keys, provider secrets or live mail settings.
It constructs an allowlisted environment and discards caller PGOPTIONS/RUBYOPT and other keys.

## Backup, restore and approval gate

1. Root identifies the actual private database/container/volume and Storage objects; no
   inference from Docker DNS or a similarly named stack. Stop application writers and
   require outbound hold. Preserve existing database, roles, Auth, Storage and uploads.
2. An authorized backup operator creates a consistent full database backup, role/global
   backup, and Storage content manifest plus recoverable content snapshot. Do not back up
   only the app schema: Auth and Storage dependencies are part of recovery.
3. Restore those backups into an isolated disposable environment with no production
   network, provider credentials or mail routes. Prove recovery of Auth users/identities,
   Storage metadata AND content, pre-existing tenant data, ownership, grants and forced RLS.
   Root verifies usable restore instructions and records exact backup/report SHA-256 values.
4. Independently review these initializer packets and the existing bootstrap/migrations.
   Rehearse this exact schema phase on the restore, then tenant phase with approved real
   Auth identity semantics. A simulated Auth fixture regression is not restore acceptance.
5. Root creates a protected gate JSON after accepting that evidence. Separate schema and
   tenant gates are required. The JSON must contain exactly matching `target` value
   `elevateo-mail-live/postgres`, `phase` (`schema` or `tenant`), `source_sha256` printed by
   the offline command, and `approval` (nonsecret 16..200-character reference).
   Set these booleans to true only with evidence: `services_stopped`, `outbound_held`,
   `independent_review_passed`, `isolated_restore_passed`, `auth_storage_preserved`,
   `restore_instructions_verified`. Each of `database_backup`, `globals_backup`,
   `storage_manifest`, `restore_report` is an object with absolute `path` and matching
   lowercase hex `sha256`. `tenant` is null for schema; for tenant it is an object with
   exact `organization_id`, `user_id`, `name`, `role`, `receipt`, `subject` strings.
6. Apply only the requested phase. Root compares pre/post protected data and grants before
   restarting anything. A successful exit is initialization evidence, not runtime or UI acceptance.

Gate hashing validates evidence identity, not the truth of an operator attestation. Keep the
gate and backups outside the repo with restricted permissions; source/evidence must remain
read-only during execution. No sample gate ships with true attestations. No automatic restore,
database reset, seed, drop, rollback migration or replacement Supabase schema is provided.
If a step fails, keep services stopped and outbound held; inspect partial schema privately.
Do not blindly retry or restore over current production. Root chooses reviewed forward repair
or a separately authorized recovery of the verified backup. Schema steps span multiple
transactions; successful earlier bootstraps/migrations can persist after a later failure.

## Implementation and verification scope

Schema: read-only Supabase/Postgres17 preflight; exact existing `bootstrap.sql`,
`bootstrap-send.sql`, `bootstrap-auth-grants.sql`, `bootstrap-gateway.sql`; then only
`bundle exec rails db:migrate` as the restricted migrator/default owner role.
Auth grants are intentionally adjusted by the reviewed bootstrap; Auth/Storage rows are
not initialized or reset. Existing migration bodies still require isolated-restore review.

Tenant: one administrator transaction with bounded locks/timeouts, a shared initializer
advisory lock, Auth row locks, generation lock ordering, ownership/forced-RLS checks,
and org + membership + grant + receipt inserts. New org requires owner first; a second owner
or nonowner before owner fails. Exact retries preserve existing rows. Different name, role,
receipt, missing/invalid Auth or an unreceipted membership fails closed and rolls back.
No runtime RLS policy is weakened. Operator bypass is deliberate: enrollment uses the verified Auth identity and explicit
operator transaction. Backend migration 20261023000042 separately permits migrator-session
definer locks; this wrapper does not infer runtime enrollment authority from that policy.

Historical `fleet-test.sh` uses only task namespace init62817, an existing pinned Supabase17 image,
the shared fleet lock, internal network, tmpfs and read-only source. It creates an empty
template0 test database inside that disposable instance; minimal Auth doubles are test-only.
Tests use exact reviewed foundation/access/receipt/locking SQL slices, not full Rails migrations.
Cleanup inspects mounts, removes exact owned container/network, and verifies absence.
No images, build caches or named dependency/data volumes are created or pruned.

### Full disposable rehearsal (initrepair20261023)

`fleet-rehearsal.sh` is a separate fleet-only harness under the shared Docker lease. It uses
pinned Supabase PostgreSQL, Auth and Storage images on internal networks, with disposable
passwords and no published ports. Real service migrations create the Auth/Storage schemas;
`rehearsal.py` inserts synthetic sentinel rows before the application schema exists.
The harness backs up database/globals and a Storage filesystem fixture, restores them into
a second isolated same-version instance, then executes all four existing bootstraps and
`bundle exec rails db:migrate` through the initializer. It verifies the exact migration set,
tenant replay, two failure rollbacks, forced RLS and unchanged whole-row Auth/Storage hashes.
It also checks restored Storage fixture content and that the source database is unchanged.
The Storage content fixture is constructed directly, not uploaded through the Storage API.
These synthetic data do not establish restoration of actual production data.

`quality.sh` runs pinned strict mypy/Ruff, syntax/ShellCheck and the offline admission tests
inside a disposable fleet container. `test_source.py` covers checkout-relative digest binding,
required nonempty source/migrations, relocation, content/name changes and symlink rejection.
Review ranges and hashes are in `review-packets-initrepair.json`; runtime and cleanup receipts
belong to the completion report. No test outcome grants permission for production writes.
The final disposable rehearsal passed all 43 Rails migrations including 20261023000042.
`test_builder.sh` covers three builder cleanup ownership failures; `stage-final.sh` binds
the final reviewed migration into the owned source snapshot under the shared lease.
See `rehearsal-final-initrepair.log`, `quality-final43-initrepair.log` and the completion
report for exact source digests, evidence limits and task cleanup.

Offline quality runs source/admission tests; database-dependent tenant regressions use their separate disposable PostgreSQL gate. The full final-service rehearsal additionally verifies actual tenant creation, replay and rollback after all 43 migrations. test_stage.sh runs the actual staging helper inside the disposable quality container and rejects five symlink and two hard-link escape cases.
