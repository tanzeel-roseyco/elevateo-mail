# Self-hosted initialization delivery - 2026-10-23

Prepared only; actual production database unchanged by this task. No production connection,
credential inspection, deployment, external mail, DNS/cloud mutation, purchase or commit occurred.
Ownership is limited to `ops/production/initialize/` and this report. Coordinator owns global
state/docs, code-reviews.md, independent source/design review and actual apply authority.

## Delivered behavior

`initialize.py schema` defaults to offline HELD and prints a source digest. Applying requires
a bounded absolute JSON gate binding phase, source digest, exact tenant arguments, independent
review acceptance, stopped writers/outbound hold, accepted isolated restore, preserved Auth and
Storage, recovery instructions, and SHA-256-verified database/global/Storage/restore evidence.
No gate with true attestations is supplied. Protected credentials are allowlisted and never
printed; arbitrary PGOPTIONS/RUBYOPT/provider settings are discarded. See the scoped README
for complete gate fields, required protected settings and operator recovery procedure.

Schema apply performs read-only Supabase17/admin preflight, the four existing reviewed
bootstrap scripts, then only the existing restricted production `rails db:migrate` path.
No test runner, schema load, seed, reset, drop or destructive recovery command is used.
The existing bootstrap rotates app-role passwords and changes reviewed Auth session grants;
root must retain intended existing passwords and rehearse those exact changes on the restore.
Steps are not globally atomic: a later error can leave earlier schema steps committed.

Tenant apply is an operator-only atomic transaction: confirmed active real Auth UUID with
Google identity, canonical org UUID/name/role/receipt, bounded locks/timeouts, initialization
serialization, Auth locks and existing authorization-generation lock ordering. It checks
existing table owner/forced-RLS and restricted role roster, inserts organization + membership
+ role grant + receipt, requires owner first, and accepts exact idempotent retries only.
It refuses unknown/unconfirmed/banned/deleted identities, missing Google identity, conflicting
org name/role/receipt or an unreceipted membership. No email-based authority or fixture user
creation exists in apply. No runtime policy is weakened.

## Fleet regression receipt

Root approved namespace `init62817`, stage `/tmp/elevateo-init62817`, existing pinned images,
and shared `/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock` lease.
Final harness obtained that lease and used a dedicated internal Docker network, no published
ports, tmpfs PostgreSQL data, read-only staged sources and no production network/DSN.

Final execution: **13 unittest tests PASS, 0 failures/errors, 0.465 seconds**, process exit 0.
Durable stdout/cleanup receipt: `ops/production/initialize/fleet-runtime.txt` (SHA-256 in packet manifest).
Pinned Supabase PostgreSQL17 image:
`sha256:94b8c87f0970c71e7a2b24fdeec849254ed30f4fd12f4402f4be3faada9e69e7`.
Its existing Python 3.8.10 executes compatibility regressions; approved production runner
must supply Python 3.11+, PostgreSQL17 psql, Ruby3.4.11 and the reviewed locked Rails bundle.
Final tested apply-source digest:
`72a82a9241a1eaa4710c8e4bcc43dba038b6b2f6a96405d12cebc291ffc21159`.

Coverage: default plan/no connection; apply without gate; valid/tampered backup evidence;
UUID/name/role/receipt bounds; missing/multiline protected settings; stripped environment;
exact forward-only schema command order; actual PostgreSQL tenant happy path and retry;
forced-RLS owner visibility remains zero; runtime direct access denied; unknown Auth rollback;
unconfirmed Auth rejection; conflicting name/role/receipt and bare-membership elevation rejection.
Database fixtures reuse exact foundation/access/receipt/generation-lock SQL slices. Auth tables
are minimal doubles in a template0 test database inside the disposable instance, never live.
Full migration execution, real Auth integration, generation-trigger integration and restored
production-data preservation are NOT established by these focused regressions.

Earlier harness attempts are retained as failed history, not acceptance: newest PostgreSQL
image lacked Python; initial readiness accepted bootstrap socket before TCP; Supabase precreated
Auth schema conflicted with a fixture; createdb initially prompted for password. Corrections
pin an existing compatible image, wait on TCP, use separate template0 database and explicit
noninteractive password handling. The interrupted createdb attempt left an empty task network;
it was inspected and removed by exact name before rerun. Final cleanup independently verifies
exact container/network absence and prints mounts/tmpfs configuration before removal.

## Review packets and inherited defect

`ops/production/initialize/review-packets.json` records exact per-file SHA-256 and inclusive
line ranges. Assign each file as its own packet (all <200 lines), with dedicated design review
of admission/transaction boundaries. No nested agents were started; independent review is
pending coordinator assignment. Implementation review defect density is not yet established.

Inherited app enrollment defect: `apps/server/db/sec802/access.sql:203-230` (28 lines;
full file SHA-256 `fb971c837f8a8a5b46bbb4ed7d4c1084f2804fc5a1808033fa043ede663ed6e2`).
The SECURITY DEFINER owner attempts `FOR UPDATE` on forced-RLS organizations with no matching
owner visibility policy. Focused runtime proves owner sees zero organization rows while the
operator can initialize without weakening RLS. One identified inherited defect / 28-line
packet = **35.71 defects/KLOC**; this is not whole-project defect density or independent review.
Root explicitly approved the initializer-only administrator transaction via message
`msg_2ed623d19efe`; existing application function and policies remain untouched.

## Remaining gates and cleanup

Root must independently review packets/design, provision/review the combined immutable runner,
obtain real protected operator settings and verified Auth UUID mapping, accept actual backup
+ isolated restore + exact migration/tenant rehearsal, and approve a source-bound gate before
any production write. The current Rails image lacks Python/psql, so it cannot run this wrapper
unchanged. No real gate/evidence or credentials were invented. Runtime app/UI acceptance and
release/outbound authority remain separate. No static typechecker/linter/full Rails suite was
claimed; these tests do not qualify as complete production acceptance.

Final Docker cleanup removed only `init62817-db` and `init62817-net`; tmpfs data vanished.
No named volumes, images or build caches were created/deleted; shared images/resources remained.
No Docker build occurred, so Windows Docker/WSL compaction is inapplicable. Fleet free space
before staging cleanup was 69,874,507,776 bytes; task staging occupied 5,975,522 bytes.
Final source archive/staging cleanup and resource-absence receipt are recorded separately in
`ops/production/initialize/cleanup-receipt.txt`; host free-space changes include other workloads
and cannot be attributed solely to this task. Repository source and durable evidence are retained.

## Initrepair continuation - 2026-10-23

Dispatch `ctx_f5eab65ab665` continues the historical `init62817` record above; historical
runtime and review receipts remain scoped to their exact prior sources. The accepted independent
review identified two admission defects in 168 reviewed lines: one HIGH absolute-path exclusion
and one MEDIUM directory-symlink escape (11.90 defects/KLOC). Both are repaired in this continuation:
exclusions are relative to the approved checkout; paths and ancestors reject symlinks before
hashing; required bootstrap/Gemfile/initializer inputs and every Rails migration are nonempty.
Missing source directories and an empty migration set fail closed. Relative path names remain
part of the digest, so moving the checkout preserves its binding and renaming a source changes it.

`test_source.py` adds excluded ancestor, content mutation, relocation, relative rename,
missing/empty input/migration, leaf/directory/nested symlink, and relative cache regressions.
`quality.sh` runs Python 3.12, pinned mypy 1.19.1 `--strict`, Ruff 0.14.14, compileall,
shell syntax/ShellCheck, and offline tests in a disposable fleet Docker container. Temporary
linters are installed only inside that container; no host tests or dependency installation.
No production gate is generated, and the original apply attestations remain mandatory.

`prepare-runner.sh` layers Python 3.11 and PostgreSQL17 client onto a coordinated immutable
backend image, using a disposable tool-preparation container rather than a shared build cache.
`fleet-rehearsal.sh` and `rehearsal.py` provide a separate real Supabase service rehearsal:
actual Auth/Storage migrations, synthetic sentinel rows, pre-app database/globals/content
backup, isolated same-version restore, four forward bootstraps, every Rails migration,
tenant replay and failure rollback, unchanged Auth/Storage whole-row hashes and forced RLS.
The Storage content is an explicitly constructed filesystem sentinel, not an HTTP upload;
these disposable data never establish restoration of actual production data.

Runtime completion, exact packet/evidence hashes and cleanup will be recorded below once
execution settles. Production, real-data restore acceptance, runtime/UI acceptance, live
mail and public release remain separate root-owned gates. No commits or nested workers.

Final admission source review received from reviewer terminal
`term_d976f85c-6d7d-4bd5-874b-1c4270e1db18`, message `msg_f24cee114b80`:
`admission.py` 1-115 SHA256 `77521674eab0cdb3bca05e84075d79f117e38f5112241ab2cf1f82c234a5e8a8`
and `test_source.py` 1-91 SHA256 `a5f94f5d7829356db38559894f8fd270a846c5965d75917974f26c13d66cf212`.
Zero confirmed actionable defects across the two bounded packets, 206 physical LOC, 0/KLOC.
This is source review, not execution. Fleet Docker quality independently passed strict mypy
for six Python modules, Ruff, compileall, Bash syntax, ShellCheck and all 13 admission tests;
receipt: `ops/production/initialize/quality-initrepair.log`. Actual full runtime remains pending.
### Continuation quality and intermediate runtime receipts

Independent review also found a MEDIUM quality-harness path error (the original script
relied on extra root staging copies). Workdir-relative paths repaired it; the corrected
`2f840af50354ee2c3bba71cf8f02532f51a2c33a8e1912fc8371f78925668232`
passed in Docker (`quality-layout-fixed.log`). Reviewer message `msg_9e806672317b`
records 231 unique reviewed LOC, one historical defect (4.33/KLOC), zero unresolved.
A later HIGH builder-cleanup finding was accepted: negated inspect under `set -e` did
not exit, and cleanup could remove a pre-existing builder. The final explicit guard
runs before staging; cleanup requires a successfully created task-owned builder.
`test_builder.sh` checks existing-builder, failed-create and failed-build paths inside
Docker. Final independent report `selfhosted-review-initializer-build-final-20261023.md`
records 66 physical LOC, zero unresolved actionable defects (0/KLOC).

`quality-final-initrepair.log` records exit 0 with strict mypy (six modules), Ruff,
compileall, Bash syntax, ShellCheck, 13 admission tests and three builder ownership cases.
Final build/quality/test-builder hashes and bounded ranges appear in the packet manifest.
These command doubles test cleanup guards; the actual backend build separately completed.

The first real-service attempt failed before migrations because an empty tmpfs hid required
Supabase PostgreSQL configuration. Exact disposable cleanup passed; removing that mount
and checking a stopped database repaired the harness. `rehearsal-baseline-initrepair.log`
records the subsequent actual released Auth/Storage startup, whole-database/globals/content
backup, isolated restore, all 42 baseline Rails migrations and tenant rehearsal PASS.
This intermediate source digest is `fe3d653b8abbb1b2e16676eb58c941903bb79266e9b4ba3ad7a39c913f06d6e0`;
protected five-row digest `81db67c5aaa199bbd50f6013d3efd83738387bc8544364c6d33687cb93c44c16`,
Storage fixture digest `47dcb079a40b61970729c51f8db307b800d78239a04ae3dfa1a79a9f91bc15b6`.
Two expected tenant failures rolled back, exact tenant replay passed, four tables retain
forced RLS/owner checks, and the source database remained without app schema and unchanged.
The final backend migration `20261023000042` was added afterward and is not covered by this
intermediate receipt; the final-source rehearsal remains pending below.

The combined runner `sha256:17fb6ed0382d8c0a9675d0a8a3fe1891adae01ea090bbf12f96f06d9235f3371`
provides Python 3.11.2, PostgreSQL client 17.11 and Ruby 3.4.11. It was built from a private
copy of the reviewed backend snapshot and extended only inside a task-owned preparation
container. The actual task builder and inspected build cache volume were removed after build;
shared Ruby/BuildKit/Supabase/quality base images were retained. Final image/staging cleanup
is recorded after the final-source run, rather than inferred from per-run container cleanup.

### Final 43-migration execution (supersedes the pending final-run statement above)

`ops/production/initialize/rehearsal-final-initrepair.log` records exit 0 against the
isolated pinned Supabase PostgreSQL/Auth/Storage services. All four actual bootstrap
SQL inputs and all 43 Rails migrations completed, including reviewed migration
`20261023000042` SHA256 `82e7c115e8714145b1e59c20f22c75864559e38b09afcc2d61c58fa95030277a`.
The immutable initializer source digest was
`5efac0c5703257aacc113e8ca7c03fced5cecc35b20a2d7c5ce9ba738bcfe042`.
The whole database/custom-format backup, role globals and Storage filesystem fixture
restored into a separate disposable database/network before forward initialization.
Tenant creation, exact replay, two expected failure rollbacks and four forced-RLS
ownership checks passed. Auth users/identities/sessions and Storage buckets/objects
retained whole-row digest
`72c68c980a208122a7546cb67fa5b294a2829cb9ba13a5c163220a909278e8d9`;
filesystem content retained SHA256
`47dcb079a40b61970729c51f8db307b800d78239a04ae3dfa1a79a9f91bc15b6`.
The source database remained unchanged and had no application schema. Exact source
file hashes are retained in `backend-final-source.sha256`; no raw backup or credentials
are copied into the repository.

Offline quality deliberately runs admission/source tests; `test_tenant.py` requires a
separate disposable PostgreSQL gate, rather than an implicit host/live connection.
The final real-service rehearsal independently exercises the production tenant SQL,
idempotency and failure rollback paths after every actual migration.

Final staging review found one MEDIUM symlink-following defect over 175 assigned
lines (5.71 defects/KLOC), repaired by rejecting canonical-root, ancestor, source,
destination and manifest symlinks before copying. The dedicated Docker-only staging
regressions execute the actual helper, including a successful copy and five symlink
rejections while preserving an external sentinel. Final review and cleanup receipts
are recorded below when complete.

One diagnostic SSH command lost nested shell quoting and traversed remote-home paths
for read-only hashes instead of the intended owned-stage manifest. The exact command
processes were stopped; its task-only output was removed and the guarded staging
script recreated the correct manifest. Only paths/digests were emitted, with no file contents printed or network/database access.
No source or persistent data was modified; the unintended read scope was reported to the coordinator.

Final independent staging re-review accepted exact 21/34/5-line packets: 60 unique
physical LOC, zero new defects (0 defects/KLOC). The earlier 57-line packet had one
MEDIUM hard-link defect (17.54 defects/KLOC); link-count admission and two hard-link
sentinel regressions repair it. See `selfhosted-review-staging-repair-20261023.md`.
Final source hashes: stage-final.sh `f7372d9503ac776005ddf209cafbe9b552cc90696b30342cf9c2c3639be07c42`,
test_stage.sh `591182d5e9e5eb957aebacf8618e58b614ce99aaad9d23e63b0c1dbb8edb4cef`,
quality.sh `2aa03257ee65aaf74cfa1ce67f0cbea54445ce2edb07648ed48c62a67479876a`.
`quality-final43-initrepair.log` records final Docker exit 0: strict mypy six modules,
Ruff, compileall, Bash syntax/ShellCheck, 13 admission/source tests, three builder
ownership regressions and actual staging baseline plus five symlink/two hard-link
rejections. Both offline plans compute the exact final source digest above.

### Final exact cleanup

`cleanup-initrepair-receipt.txt` and `cleanup-verification-initrepair.txt` record
successful deletion of task-only runner image `17fb6ed0382d8c0a9675d0a8a3fe1891adae01ea090bbf12f96f06d9235f3371`
and backend image `9cce7a1f822506e17bbe03ac803b150372af0933a888b76c099d4bce9caa81b5`.
Task-labelled containers/networks, task image tags and the inspected task BuildKit
cache volume are absent. Both database runs used tmpfs with no named data volume.
The canonical `/tmp/elevateo-initrepair20261023` tree measured 3,841,159 bytes before
cleanup and is absent, including database/globals backups, synthetic Storage fixture,
private backend build context and temporary logs copied to the durable receipts.
The first ordinary removal could not delete container-owned Storage files; sudo was
unavailable, so a task-labelled no-network `--rm` container removed only those exact
fixture directories before the remaining exact staging directory was removed.

Shared Ruby, BuildKit, Python quality, Supabase PostgreSQL/Auth/Storage images and all
other tasks' containers, volumes and caches were retained; no global prune occurred.
The final Docker inventory is 82 images/103.9GB, 362 containers/4.883GB, 260 local
volumes/16.99GB and one active 4.62MB build cache belonging outside this task.
Host free space was 72,103,342,080 bytes before cleanup and 73,138,110,464 afterward:
an observed increase of 1,034,768,384 bytes across concurrent workloads, not an exact
attribution to this task. Removed image reported sizes total 483,896,936 bytes before
layer sharing; Docker did not report exclusive reclaimed bytes. This is remote Linux,
so Windows/WSL virtual-disk compaction does not apply.

The initializer work is complete for the isolated synthetic acceptance scope. No live
credentials, production database, public release, DNS/provider configuration or mail
sending was used or authorized. Actual production-data backup acceptance, operator
attestations and a maintained production combined runner remain separate activation
requirements. No backend files or commits were made by this worker.
