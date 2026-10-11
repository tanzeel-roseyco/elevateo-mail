# BE-01-R1 — accepted repair design

Design accepted by actual Astra MAX after three verified independent opinions. Implementation, regressions and issue closure remain pending. Read [synthesis.md](synthesis.md) for dissent/provenance and [dispatch-brief.md](dispatch-brief.md) for the bounded handoff. The frozen consultation question and opinions remain unchanged.

## R1-01 — one repair task, three ordered units

Use issue 6, one Astra LOW writer, one isolated checkout and one draft fix PR. Order A: tenancy/cache and membership; B: explicit credentials, safe creation and worker liveness; C: egress verification and owned cleanup. These can be separate coherent commits, each accompanied by relevant regressions and synchronized documentation. A 200-line limit applies to each independent review assignment, not to the total commit. All three units and V01–V13 must pass before this repair closes. Remaining BE-01 work stays open; no Auth, Storage adapter, business endpoint or frontend implementation is included.

## R1-02 — own the transaction and cache boundary

The outer `with_context` validates the principal, rejects an unrelated open transaction before setting claims, clears the connection query cache, enters `connection.uncached(dirties: true)`, and opens an ordinary real transaction. Set both claims through one parameter-bound ActiveRecord adapter query on that connection, using typed binds; do not interpolate values or use the raw driver. This causes Rails to materialize its transaction before yielding. Assert the expected settings inside the transaction in regressions.

Record principal, connection object and the owned `current_transaction` object in the existing execution-local marker. Nested entry succeeds only for the same principal, identical connection and identical still-open transaction. Re-entry inside a different savepoint transaction is rejected; ordinary savepoint operations inside the outer block need no new wrapper call. Do not add transaction-ancestry traversal or propagate the marker to another thread/fiber. Reject any replaced/ended transaction before a nested yield and detect it on normal outer-block return. Application code must not manually end the owned transaction.

Only the outer invocation owns cleanup: retain its frame through transaction completion, then clear that frame and the query cache in `ensure`; a failed nested entry must not clear the outer frame. The `uncached` block restores the prior cache-enabled state. Cached rows are discarded, never restored. Commit, rollback, caller exception and connection/pool reuse must leave no effective authority. PostgreSQL may report an absent custom setting as NULL or an empty string after reset; assert denied access and no nonempty prior principal, not NULL alone.

The pinned Rails 8.1.4 adapter provides `uncached(dirties: true)` and `clear_query_cache`, forwarding to its pool. Real executor-enabled ActiveRecord tests, including the same SQL and bind values across principals, are still required. Global cache disabling and a tenant-keyed cache are unnecessary for this bounded repair.

## R1-03 — grantor-aware membership transfer

Keep the applied foundation migration unchanged. Bootstrap stops granting application read membership to API. It establishes only the narrow prerequisite that `elevateo_owner` can administer `elevateo_app_read`, with ADMIN true, INHERIT false and SET false. Do not grant CREATEROLE, SUPERUSER or BYPASSRLS to migrator/runtime roles.

Retained volumes need a narrow compatibility step in privileged bootstrap: inspect the exact API/read-role edges in `pg_auth_members`, remove only the legacy bootstrap-granted edge with an explicit verified grantor, and leave owner-granted edges untouched. PostgreSQL records a superuser's membership grant under its bootstrap superuser; that name need not equal the connecting `supabase_admin`. First reproduce the old grant on the pinned image and record its actual grantor. Do not guess the username, revoke unrelated grants, use CASCADE, or silently accept an unexpected grantor. Unexpected grantor/options are a design-gate stop.

Add one application migration whose `up`, running as `elevateo_owner`, grants API read membership with explicit intended options (ADMIN false, INHERIT true, SET false). Its `down` revokes that owner's edge only. The compatibility step never reapplies API membership; rerunning bootstrap after `down` cannot restore access. API cannot switch to the group or an owner/migrator role. Worker receives no business-table access. A brief no-read window between legacy retirement and migration is acceptable locally. Do not restore the defective bootstrap grant during rollback or alter existing rows.

This clarifies B01-03's prerequisite versus versioned-runtime-authority boundary without weakening it. Prove fresh and legacy up/down/up, repeated bootstrap, recorded grantor/options, failed-migration atomicity and preserved rows. Permission-denied after `down` is a valid denial; zero rows is not the only acceptable result.

## R1-04 — explicit service credential allowlists

Remove blanket `env_file` injection from shared server and bootstrap service definitions. Compose's CLI `--env-file` remains interpolation input only. Declare each needed environment key explicitly; retain existing typed nonsecret configuration. Do not refactor the role-specific validator unless a regression demonstrates a need.

| Process | Allowed secret material |
| --- | --- |
| Database | PostgreSQL administrator password |
| Bootstrap tool | Administrator connection password; migrator, API and worker passwords needed to establish logins |
| Auth / REST | Their existing upstream database connection password and JWT signing secret |
| Storage | Its existing upstream database password, JWT secret, anonymous key and service-role key |
| Migrator tool | Migrator password and existing Rails signing secret |
| API | API password and existing Rails signing secret |
| Worker | Worker password and existing Rails signing secret |
| Privileged fixture tool | Administrator connection password only; separate process from restricted tests |
| Restricted API / worker tests | Only the corresponding role password and Rails signing secret |

Check derived DSNs as well as named keys so a privileged password cannot hide in another variable. Inspect values privately for equality/leak checks; output only key names and assertions. API/worker must not mount the generated credential file or Docker socket. The Storage adapter is absent, so the API receives no service-role key now. Its future narrow exception remains subject to the original B01-05 contract. Shared upstream database-password design and the existing Rails signing-key sharing remain outside this repair.

## R1-05 — preserve existing credentials; atomically create once

An existing valid regular credential file is a strict no-op: do not rewrite, chmod or chown it. Parse the existing generator's supported format with a bounded read; reject duplicates, malformed required fields and inconsistent locally generated JWT role/signature material. Validate against the existing format, not a new password-rotation policy. An invalid, partial or unsafe existing target fails with key/path names only and keeps its bytes and metadata. Never repair it by regenerating against a retained database.

For an absent target, create a unique same-directory temporary file exclusively, with mode 0600 and the intended existing ownership. Write the complete data, flush/fsync and close; publish with `File.link(temp, target)`, which cannot replace a winner. If another invocation wins, validate that complete winner and discard only this invocation's temporary file. Flush the directory where supported, and always remove the owned temporary link. A failure may leave no final file or one complete installed file, never a partial final file. Do not delete a complete final file after a later flush/report failure.

This adapts the draft's atomic-rename candidate to create-only publication: existing files never need replacement, and exclusive linking avoids overwrite races or stale lock recovery. No flock, fixed `.env.tmp` lock, silent clobbering rename or merge-and-rewrite fallback. Unsupported hard links fail clearly with the old file preserved; actual Windows Docker bind-mount behavior must be tested. Linux containers do not establish host filesystem durability. An unsupported target filesystem returns to the design gate before changing the installation primitive.

Use fault injection through test-controlled filesystem operations or a test-only runner, not a production environment hook. Cover write/flush/publication failure, existing-file hash and metadata equality, first creation, concurrent winners, invalid files and unsupported installation.

## R1-06 — truthful worker liveness

Keep the worker idle and held. Publish its existing heartbeat with a same-directory temporary write and rename so the probe cannot read a truncated value. The worker-only Compose probe uses strict bounded integer parsing and accepts a timestamp only when age is between zero and five seconds inclusive. Missing, malformed, future or stale data fails. Use interval 5 seconds, timeout 3 seconds, retries 3 and start period 30 seconds. Verify the nonroot worker can write its existing `/tmp` location.

This measures loop progress, not database readiness or queue processing. No DB query, HTTP call, synthetic job or hold-release path is added. Correct the existing comment that claims a database-login check. For the stuck-loop regression, SIGSTOP the worker process while the container remains running so Docker can execute its probe; Docker-pausing the whole container is not adequate evidence that the probe itself detects a stuck process. Separately assert stopped containers cannot be counted healthy/running. Send SIGCONT or remove only the test-owned stopped fixture during cleanup.

## R1-07 — discriminating local egress evidence

Resolve actual targets by exact Compose project/service labels; require one running target, only the expected internal runtime network, no host network/secondary egress/proxy escape, and the intended hold/Mailpit settings. Cover API, worker, Auth, Mailpit, Storage and REST; keep database confinement inspected too.

Use the pinned existing Ruby image as a disposable probe in each target's network namespace (`--network container:<id>`). No probe tool is assumed inside third-party images. The probe has no Docker socket, no privileges, no secrets and no additional network. Resolve the database's current internal address from inspection and pass it as a literal for a successful in-network TCP control; do not rely on sidecar DNS configuration matching the target.

Create invocation-unique ordinary bridge E and a fixture listener whose published port is bound only to E's gateway address. That address must be outside each target network's subnet; never use the confined network's own gateway, `0.0.0.0`, a LAN address or the Internet. An unrestricted control must reach that exact endpoint through its default route. If gateway publication/DNAT is unsupported on the actual engine, report setup failure and return to the design gate; no private-sibling-bridge substitute.

Probe outcomes are explicit: connected = violation; verified ENETUNREACH/EHOSTUNREACH = expected no-route denial; timeout, refusal, missing executable, missing/stopped target, malformed output or Docker command failure = invalid evidence/failure. Both local positive and external unrestricted controls are required before accepting a denial. Also inspect the internal property and absence of a default route.

Create otherwise equivalent isolated internal/open control networks and sleepers. Run the identical checker and same endpoint: internal passes, open fails because it connects. An `Internal:false` property assertion alone does not satisfy this behavioral negative control. No second complete application stack is needed. Prove this topology on the actual Docker engine and record Windows-host invocation separately; do not claim Linux DNAT analysis as a Windows pass.

## R1-08 — owned cleanup and evidence

Use a unique random invocation ID, labels and exact IDs captured only after successful creation. Refuse a pre-existing name collision. Cleanup removes verified owned containers before owned networks, including partial-setup and interruption paths. Never remove by a static name, silently ignore failed creation, remove another Compose project's resources, or automatically remove persistent volumes. Preserve foreign resources and all existing credentials/database/Storage data.

All behavior assertions and application tests run in Docker. Host PowerShell/shell may orchestrate Docker commands; it must not run the Ruby application/tests. Preserve the existing dependency/image pins. No new dependency is authorized by this design; use Rails' existing test facilities and Ruby standard library. Any missing required runner/pin is reported for selection instead of silently adding one.

V01–V13 in the immutable brief remain binding, with the specific refinements above. Record proposed versus executed commands, expected versus observed outcomes, reviewed commit and exact resource cleanup. No repair result, full BE-01 completion, actual Obsidian connection, real Auth integration or production activation is established by this design.
