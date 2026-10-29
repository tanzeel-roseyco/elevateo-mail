# Fleet-02 backend runner: R2 repairs pending parent validation

## Latest result: parent R3b bounded full lane PASS

Parent reports `required_failures=0` and `cleanup_exit=0` on fleet-02.
Log: `/home/tanzeel/elevateo-mail-tests-20261012-ultra/backend-full-r3b.log`.
Evidence: `/tmp/be01r1-5bb113b1-e4b8-470f-8eb3-b587ef331559.HH1bCN`.
Tenancy pool5 and pool1 each passed 12 runs / 698 assertions / 0 failures / 0 errors / 0 skips.
Worker passed 1 run / 25 assertions / 0 failures / 0 errors / 0 skips.
Ops, driver, authority, membership and catalog transitions passed. Exact task resources were removed; shared resources were retained. These are parent-reported results; this owner did not fetch remote logs or execute tests. The R2 tenancy and worker repairs now have bounded Docker verification, and the catalog lifecycle pending at R2 passed in R3b.

Validated backend/ops source and the full runner/helper/harness remain frozen. Local hashes were read only; the parent report does not provide a separate R3b artifact manifest, so this note does not infer hashes of any parent-side orchestration adaptations. Actual Compose service egress, PowerShell behavior, native Windows and remaining broader acceptance gates are not established by this full-lane pass. See [next bounded checks](be-01-r1-next-acceptance.md) for the preparation proposal; no further ultrareview is authorized.


Parent bounded static review: tenancy production SHA 6d38a972 and worker tests SHA 2212ca8a, combined 148 LOC, 0 defects, 0/KLOC. This is static-only evidence. Updated tenancy tests ebb80f9d and runner overlay lines 1-96 are under parent review; no verdict is claimed. Code and harness frozen for R3; Docker validation remains pending.


## Historical R2: two repairs prepared before R3b validation

Parent reports full R2 exit 1 (`backend-full-r2.log`), with disposable exact-name containers, volumes and network absent. Driver, authority, membership, catalog before/after and negative probes passed. Evidence: `/tmp/be01r1-ca78ba89-656c-45d4-ac8d-68efad5cdbbb.3PTWhC/{tenancy-pool5,tenancy-pool1,worker}.log`. These remote logs were reported by parent, not independently fetched by this owner. The runner stopped before the final down/bootstrap/up lifecycle; that gate remains pending.

- **BE-CORE-04:** Both tenancy pool sizes failed `test_ended_or_replaced_owned_transaction_is_rejected_and_cleaned` (pool5: 12 runs, 219 assertions, 1 failure). Expected ContextError was masked by Rails rollback on an empty transaction stack. Detect lost ownership on every block exit; normalize the unwind error only when ownership loss is established; disconnect the physical session after Rails unwinds, and always clear marker/cache. Replacement transactions and session claims are discarded. This cannot undo an explicit caller commit that already succeeded. Regression matrix covers commit/rollback, zero/one/two replacement frames and normal/error/Rollback/throw exits (24 combinations), physical disconnect, fresh backend PID, cleared claims and pool reuse. Intact-ownership NoMethodError must propagate unchanged.
- **BE-TEST-05:** Worker suite (1 run, 8 assertions, 1 error) failed during text-name privilege lookup because schema app USAGE is denied. Resolve tables through catalog OIDs, require exactly one false SELECT privilege result, assert schema USAGE is false, and require actual denied reads with PG::InsufficientPrivilege / SQLSTATE 42501. No worker grants or schema privileges changed.

Static diagnosis follows [Rails 8.1.4 transaction unwinding](https://raw.githubusercontent.com/rails/rails/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/transaction.rb) and [PostgreSQL adapter disconnect](https://raw.githubusercontent.com/rails/rails/v8.1.4/activerecord/lib/active_record/connection_adapters/postgresql_adapter.rb). Runtime behavior of these repairs is not yet verified.

The runner now overlays exactly five hashed files on frozen 5785eba before building; it retains original/effective manifests. The helper, caps, mount/ownership checks and scoped cleanup are unchanged. The synthetic harness adds rejection of each backend overlay and a valid-input sentinel control. New runner/harness syntax, synthetic execution, tenancy pool1/pool5, worker and the full lifecycle require parent Docker validation and bounded review. Earlier reviews and PASS results apply only to their recorded hashes. No tests, remote execution, Docker startup, commits, pushes or ultrareviews were performed by this owner.

### Stable physical-byte handoff hashes

| File | SHA256 |
| --- | --- |
| `apps/server/lib/elevateo/tenancy.rb` | `6d38a972fc99f2f873bbc197062dd261eb4fcace3d842125df27c02800180f6c` |
| `apps/server/test/be_01_r1/tenancy_test.rb` | `ebb80f9d45d6735d509e19d1953a654286126c7aa9ec1d09ad82b50f96744e4e` |
| `apps/server/test/be_01_r1/worker_role_test.rb` | `2212ca8a045b3fe82746c8105f693ebf11d58801013e4e7203ff40022212b57a` |
| `docs/evidence/scripts/be-01-r1-fleet02-full-run.sh` | `e2d409e0284cf486ea8894637f6376459994f4c5ae97a332b5a5c293aaf80066` |
| `ops/tests/fleet02_runner_regression.sh` | `a8ff7b5c2a616bd9542d577f239fca00f4eea23fcf96a9510e536039b523883d` |
| `docs/evidence/scripts/be-01-r1-fleet02-resources.sh` | `86681089c789e3b636f518508e8c6cf496d332f69bd69e5696bbc1dd4302aa4d` |
| `ops/tests/egress_test.rb` | `d31859d7747c9035b994f167bd84c5f80268af2d2d5c499514183838a5f237bf` |
| `ops/tests/membership-catalog.sql` | `e1a347ce15e6779b93b9b8e4f1dd2baa3d3eac520d3ad294b919193aa1cdc77a` |

Parent owns dispatch, Docker execution and bounded adversarial review. No new
ultrareviews, commits or pushes are authorized. This is a full locked-bundle
backend subset, not final backend acceptance or a production operation.

## Provenance and transfer contract

Adapted from the coordinator sibling `Elevateo Mail - Local Completion`:

- `docs/evidence/scripts/be-01-r1-full-run.sh`, SHA256
  `fbbf64d9329b9056bea105ddb8c7dfa38abd238ac85ddcc98004aafe49e50aa2`.
- Adjacent `be-01-r1-resources.sh`, SHA256
  `c134518c1122e0b4d9e51c79ebaa9a54fdcd9cf595265dfeda5d31ac0ad6637f`.
  The frozen copy remains byte-identical. Execution uses the separately named
  `be-01-r1-fleet02-resources.sh`, retaining ownership, mount, nonce and isolated
  builder checks while adding caps and the reviewed config-timeout cleanup fix.
  The runner pins the fleet-02 helper hash, not the original helper.

The application snapshot is frozen commit
`5785eba47f3709debb2815c8d86608f7e62d02f3` **plus exactly five source overlays**:
`ops/tests/egress_test.rb`, 7,262 bytes, SHA256
`d31859d7747c9035b994f167bd84c5f80268af2d2d5c499514183838a5f237bf`.
`ops/tests/membership-catalog.sql`, 2,538 bytes, SHA256`e1a347ce15e6779b93b9b8e4f1dd2baa3d3eac520d3ad294b919193aa1cdc77a`.
The three additional backend paths and hashes are listed above; stage them under R1_BACKEND_REPAIR_ROOT with their apps/server directory layout. The frozen commit does not contain these repairs. Dirty documentation is not an
application input. No other dirty application file is implicitly copied.

Parent transfers the adapted runner, adjacent fleet-02 helper and all five exact repaired files
without line-ending conversion to fleet-02. From a repository containing the
frozen commit, the prepared invocation is:

```sh
R1_EGRESS_REPAIR=/absolute/staging/egress_test.rb \
R1_CATALOG_REPAIR=/absolute/staging/membership-catalog.sql \
R1_BACKEND_REPAIR_ROOT=/absolute/staging/backend-repair-root \
  bash /absolute/staging/be-01-r1-fleet02-full-run.sh
```

Do not execute yet. Parent must verify the runner hash against the reviewed
artifact before dispatch. The runner records its own and helper hashes, restores
the original 31 canonical blobs and checks their original manifest, then copies
and verifies only the five pinned overlays. It retains both original and effective
manifests, checks effective source hashes again at completion, and makes the
assembled source read-only. There is no checkout reset, commit or patch to the
remote repository. Evidence/source staging is retained for audit.

## Coverage and resource behavior

Preserved: pinned Ruby and PostgreSQL images, locked bundle and baked Gemfile
hashes, base64 check, secrets/heartbeat/egress suites, fresh/repeated bootstrap,
foundation and membership migration, T1/T2/T3 driver with strict JSON verdicts,
authority tests, tenancy pool 5 and pool 1, worker restrictions, row fingerprints.
Added: actual `/tmp` noexec observation, runtime identity/version record,
migrator-only membership suite (up/down/up, post-grant/post-revoke rollback,
unexpected-option rejection), then down/repeated-bootstrap/up with catalog state
and fixture-fingerprint checks, and a fresh API authority check after transition.

The inherited 660-second deadline, 60-second kill grace, 420-second build limit
and 45-second app limits remain unchanged. A timeout is failure/incomplete,
never grounds for automatic retry or acceptance. Additional checks may consume
the available budget; parent decides a separately reviewed budget change.

Application containers retain read-only roots, UID 10001, no capabilities,
no-new-privileges, no Docker socket and no published ports. App, database and
dedicated builder each have 2 CPU/2 GiB limits; config probes have 0.5 CPU/256 MiB.
These conservative parent-suggested limits suit the small synthetic fixtures;
OOM/timeouts must be reported, never silently retried with larger limits.
Inspection verifies NanoCpus/memory/swap for application, database and config
containers, and CPU period/quota plus memory for BuildKit. BuildKit's driver
does not set an explicit swap cap here; its RAM cap is verified independently.
Ops suites use network
none; DB suites use only the nonce-owned internal network. Database data is
disposable tmpfs. The config volume and isolated BuildKit cache are nonce-owned;
cleanup verifies actual resources and contents before exact-name removal,
retains anything unverified, and preserves pre-existing images/persistent data.
No global prune is used. Preserve complete logs, counts/skips, cleanup exit and
retained-resource output; a suite pass does not override failed cleanup.

## Required checks still beyond this adapted runner

1. PowerShell Docker lane with `R1_POWERSHELL` set for all nine wrapper cases;
   Windows PowerShell 5.1 compatibility remains a separate platform requirement.
2. Actual Compose API/worker network isolation using both egress wrappers:
   confined denial plus a real reachable unrestricted control, topology and
   cleanup verification. Ruby protocol unit tests and `--internal` do not prove it.
3. Measured legacy bootstrap transition, unexpected bootstrap grant/options
   rejection with unchanged catalogs/data, missing owner ADMIN prerequisite
   failure, and actual API inability to read after down. The migration suite's
   negatives do not cover every administrator/bootstrap transition.
4. Baseline-vs-repair T1/T2/T3 reproduction with identical driver bytes and
   separately pinned baseline image; this runner runs only the repaired lane.
5. Actual hostile ownership/membership authority checks (including worker
   inherited privilege), beyond synthetic query-double guards.
6. Docker lint/typecheck and remaining acceptance integration gates: Auth admin
   fixtures, private Storage and tenant isolation, worker-process heartbeat
   lifecycle, and local service integration. Report missing tooling explicitly;
   do not infer broader application completion from this backend subset.

Parent should run Docker-based shell syntax/lint and hash-rejection checks
(wrong overlay/helper must fail before resource creation) before full dispatch.
Also inject a config content-probe timeout during cleanup: verify the exact task
probe is removed, timeout remains nonzero and its volume is retained. Cover
success plus foreign-label/mount/cap mismatch: unverified resources must survive.
These runner checks have not been executed here. No resource cleanup was run
while preparing these files because no resources were created.

## Stable review artifacts

- `scripts/be-01-r1-fleet02-full-run.sh` SHA256:
  `587200aba0ae06caf1c4cc088965ad926b1bbc9fb7690c594aeb62e651696456`.
- `scripts/be-01-r1-fleet02-resources.sh` SHA256:
  `86681089c789e3b636f518508e8c6cf496d332f69bd69e5696bbc1dd4302aa4d`.

Historical parent bounded re-review: runner `ba3576ed`, 157 LOC, 0 defects (0/KLOC); helper
196 LOC, 0 new defects (0 new/KLOC), prior cleanup defect statically resolved.
No syntax check, test or dispatch has been executed by this repair owner.
Current runner `587200ab` includes the catalog overlay and assertion regressions;
it requires fresh parent syntax/runtime validation and review.
Any further runner change invalidates these
hashes and requires a refreshed review handoff.

## Prepared Docker-only regression harness

Current harness SHA256: `6d8e93b1189f80ca7b8798a716baa561ba961f3916bdd0a51d4ed124494afafa`.

`ops/tests/fleet02_runner_regression.sh` runs the actual pinned helper functions
and complete runner with synthetic Docker/timeout boundaries. It covers success,
timeout status 124, exact verified force-removal, the late cleanup probe and
volume retention, plus foreign labels, wrong volume/RW mode, CPU, memory and swap
changes both before start and before removal. Hash rejection uses fresh runner
processes and a sentinel Docker executable: bad overlay/helper bytes must exit 1
without even querying Docker. These tests require no socket or nested daemon.

Parent runs it only inside a disposable Docker tools container with Bash, jq,
Git, coreutils and tar already installed, read-only repository mounted at `/src`,
network none, non-root user, capped CPU/memory and writable disposable `/tmp`.
Container command: `bash /src/ops/tests/fleet02_runner_regression.sh`.
The harness requires `/.dockerenv` and rejects a mounted conventional Docker
socket. It creates fixtures only in container temporary storage. Use the parent's
approved/pinned tools image and `--rm`; do not install tools on the host.

Prepared only, not executed or covered by the runner/helper review counts. This
is a deterministic control-flow regression, not proof of actual daemon timeout,
mount or resource-limit enforcement. Those remain full-runner/runtime checks.

Parent staging evidence: runner/helper/egress hashes matched. Both runner/helper
`bash -n` invocations passed in pinned Ruby Docker containers, network none,
read-only root, cap-drop/no-new-privileges, 0.5 CPU/256 MiB and `--rm`. An initial
compound SSH quoting error was corrected using separate invocations and is a
harness failure, not a product defect. Frozen bare repository is staged at
`/home/tanzeel/elevateo-mail-tests-20261012-ultra/backend-5785eba.git`.
That staging checkpoint is historical: the parent subsequently ran the full lane; see the failure checkpoint below.

## Full-run failure checkpoint and rerun

Parent reports full-lane secrets/heartbeat/egress PASS, then catalog SQL parser
failure at line 22 (CASE comparison, LINE 8). The catalog repair wraps CASE in
parentheses without removing any oracle checks. Updated runner additionally
requires mismatched repair-state and invalid-state probes to fail with psql 3
and their intended exception messages. Existing success and transition checks
still compare all four fixture fingerprints. Legacy oracle coverage remains a
separate pending lane; no full database pass is claimed.

Parent reports harness `39466f5a` Docker PASS and bounded review 128 LOC,
0 defects, 0/KLOC. Current harness `6d8e93b1` also tests wrong catalog overlay
rejection before any Docker call and is pending fresh execution/review.

Failed-run evidence: `/tmp/be01r1-6b96b4b5-faee-4080-9ab3-bbb3c86fd5e5.tKDuK4`;
root log `/home/tanzeel/elevateo-mail-tests-20261012-ultra/backend-full-run.log`.
`cleanup_exit=3` preserves initial psql status, not a cleanup failure. Parent
read-only exact-name inventory confirms zero task containers, volumes and
networks, plus no synthetic harness container; log tail contains no RETAIN.
Evidence is intentionally retained. No cleanup was performed by this owner.

Parent stages the two overlays and current runner/helper, verifies full hashes
above without line-ending conversion, reruns Docker syntax and synthetic checks,
then dispatches from the existing bare frozen repository with both required
environment variables shown above. Keep fresh nonce resources, caps, bounds,
original/effective manifests and scoped cleanup. Never reuse the failed source
directory as an implicitly repaired input. No execution is authorized for this
repair owner; all validation remains parent-controlled.
