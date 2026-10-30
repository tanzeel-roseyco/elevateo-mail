# BE02 isolated runtime harness

Status: **NOT_RUN**. This snapshot is prepared for coordinator review and first execution on fleet-02. No Docker command, SSH connection, host application test, or build was run by this worker. Static parsing is not runtime evidence.

The coordinator integrated the privilege guard service, per-suite failure collection, Steep and RuboCop checks, and explicit disposable database identity after the worker's initial static parsing. This revised ten-service snapshot has not executed yet. `ops/tests/be02/snapshot.sha256` records the harness source/document snapshot; the runner records the larger integrated input snapshot at execution time.

The standalone `ops/compose.be02-test.yaml` defines ten allowlisted services: Postgres, Auth, Mailpit, privilege guards, bootstrap, migrate, API, worker, Ruby checks, and trusted HTTP fixtures. At most six service containers plus the dedicated builder are needed concurrently. It does not merge foundation Compose or alter the existing 300-container bootstrap cap. Existing unrelated containers are inventoried by name only and never stopped, pruned, or included in cleanup.

## Coordinator invocation

Use the integrated checkout on the reviewed Linux fleet host. Python 3.10+, GNU timeout, Docker Compose supporting `up --wait`, and Buildx supporting JSON `ls` output are required. The exact pinned Postgres/Auth/Mailpit, Ruby, and BuildKit images must already be present; preflight fails if they are absent. No image is selected by searching arbitrary Rails tags.

From the staged checkout, after reviewing the patch and confirming the local Docker context is `default`:

```sh
timeout --signal=TERM --kill-after=300s 2100s \
  python3 -B ops/tests/be02/run.py \
  --context default --expect-host Ubuntu-noble-latest-amd64-base
```

The runner checks the explicit hostname and requires that context to target `unix:///var/run/docker.sock`; ambient remote Docker variables are rejected. If the fleet context has a different name, pass that verified name explicitly. A previously reviewed dependency image can optionally be passed with `--server-image sha256:<its actual 64-hex image ID>`; it is retained, not treated as task-owned. The default builds the existing pinned `apps/server/Dockerfile` and exact `Gemfile.lock`, labels a unique image, and uses a unique BuildKit container/cache volume. It does not change the selected global builder. Shared pinned base images are retained; the isolated builder may need to fetch pinned base layers and locked gems into its own empty cache.

Each run generates a UUID Compose project and a private ignored directory `ops/local/be02-<uuid>/`. Generated database passwords, session encryption key, Rails secret, and isolated Auth signing key exist only in its mode-0600 `.env.runtime`, which is removed after cleanup attempts. Local dotenv files in source mounts are rejected before building. Do not print `docker compose config`, container environments, the secrets file, invite links, cookies, or Auth response bodies. Evidence is private, redacted, and deliberately omits raw inspect/config output. `source.sha256.json` fingerprints the mounted server, contracts, harness, and bootstrap inputs; changing them during the run makes the run fail.

## Phase ordering and bounds

1. Inspect cached immutable images and snapshot names/free space; create the task builder/cache and build (720 seconds maximum).
2. Start only task Postgres and Mailpit; run the disposable privilege regression database before Auth/API/worker start, then run `ops/db/bootstrap.sql` as `supabase_admin`.
3. Start real pinned Auth and wait for `/health`; run `ops/db/bootstrap-auth-grants.sql`, which asserts the actual `auth.sessions` schema and four-column grant boundary.
4. Run Rails migrations as `elevateo_migrator`, which assumes the existing NOLOGIN migration owner.
5. Run each integrated `test/be_02/*_test.rb` in its own Ruby process, then Steep and RuboCop lint checks. Collect independent failures before exiting nonzero. Each suite and lint has a 90-second bound, Steep 180 seconds, and their outer container 480 seconds. Database suites verify the explicit `BE02_TASK_DATABASE_NAME=postgres` and run serially before live consumers.
6. Start API, inspect runtime credential separation, and poll real Rails `/health` for up to 55 seconds. Execute the real HTTP Minitest container (180 seconds maximum).
7. Start the production worker only after SQL suites finish, inspect its credentials, and verify completed durable logout intents (30 seconds of polling). This avoids the worker draining synthetic database-test intents.
8. Capture bounded redacted logs and clean task resources on success, failure, SIGINT, or SIGTERM. Each Docker operation has a timeout, the run has a 1,800-second command budget, and cleanup receives a separate 240-second budget.

The existing Rails configuration disables schema dumping after migration, so this phase does not require `pg_dump` in the Rails image. The `guards` service invokes `ops/tests/be02-guards/run.sh` with a disposable-database opt-in and read-only bootstrap/server sources. It checks role memberships, private function permissions and Auth column grants; its own trap removes its exact scratch database before normal bootstrap. The server Dockerfile creates writable log/tmp directories explicitly and invokes Rails through Bundler, so Windows archive executable bits are not required.

## Trust and fixture boundaries

API receives only its database password, Rails secret, and session encryption key. Worker receives only its separate database password and those application keys. Neither receives Auth signing/admin credentials, the admin database URL, the migrator password, or the other runtime password. Source mounts are individually restricted to `apps/server`, `contracts`, and this harness; the repository's ignored secrets/evidence directory is not mounted. Runtime containers have a read-only filesystem with bounded writable tmpfs, no host ports, and an internal Docker network. Storage is outside this test scope; its configuration URL is present for the existing configuration validator but no Storage service is claimed healthy.

The trusted SQL-test container gets all three required URLs: `BE02_ADMIN_DATABASE_URL`, `BE02_API_DATABASE_URL`, and `BE02_WORKER_DATABASE_URL`, with actual distinct database logins. Existing SQL tests create their scoped Auth fixtures as documented by their helper; the separate HTTP acceptance path does not write Auth identities or sessions through SQL.

The trusted HTTP fixture container alone receives `BE02_FIXTURE_SIGNING_SECRET` and the admin fixture URL. It mints a two-minute service-role JWT solely to call pinned Auth `/invite`. Mailpit supplies the real email callback token. Scanner GET, browser-style stage/challenge/accept, password login, online Auth verification, refresh, and logout all pass through production HTTP/SQL boundaries. Trusted parameterized SQL seeds only app organizations, membership, mailboxes, and plaintext thread/message fixtures for the Auth-issued user. Fixture data disappears with the dedicated database volumes.

Auth configuration uses issuer `http://auth:9999`, audience `authenticated`, HS256, browser origin `http://api:3000`, and `/auth/accept` mail callback paths. The application receives the new 32-byte Base64 session key, explicit `ELEVATEO_COOKIE_SECURE=false` plus `ELEVATEO_LOCAL_HTTP=true`, and password minimum 12. API and worker receive no JWT signing secret. These are isolated HTTP settings, not production cookie/TLS settings.

## Evidence and cleanup

`result.json` records test and cleanup outcomes separately. Numbered logs contain the Ruby assertion summaries, Steep result, real HTTP assertions, migration/bootstrap output, and sanitized service logs. `server-image.json` records the immutable image ID. `cleanup-mounts.json` records inspected task container mounts; `cleanup.json` lists exact removed IDs/names and any failures. Before/after Docker usage and host free bytes allow the coordinator to report space changes without claiming unrelated fleet changes as task reclamation.

Cleanup first verifies the exact Compose project, allowlisted service, no published ports, read-only source mounts, and exact labeled database volumes. It removes those container IDs, verifies the named builder's pinned image and cache mount, and deletes only that builder registration/cache, labeled task image, and isolated empty network/volumes. Unknown mounts, foreign tags, ownership mismatches, or remaining consumers fail closed and produce a failing cleanup outcome; they never trigger a prune. Shared base images, source, evidence, and every unrelated container/volume remain. A daemon outage or SIGKILL can prevent cleanup; retained identities in evidence require coordinator disposition before any retry. No shared-host trim/compaction is attempted by this Linux harness.

## Coverage and outstanding evidence

Auth/SQL/Minitest/Steep/build/Compose/HTTP/worker/cleanup execution: **NOT_RUN**. The HTTP suite covers disabled public signup, unauthenticated rejection, real invite acceptance after scanner staging, cookie flags, opaque-token response boundary, default-false capabilities, hidden private mailbox denial, plaintext thread detail, rejected Origin/CSRF mutation, tenant switch/stale-context rejection, refresh, local logout, fresh login, global logout, and completed worker revocation intents.

The HTTP cookie jar is not a browser engine. Actual browser SameSite behavior, UI rendering, recovery-email completion, native-platform evidence, TLS/secure-cookie deployment, and provider/live-mail activation remain outside this first harness snapshot. Existing isolated Auth unit tests still cover their recovery/error logic; this document does not claim a real recovery or browser pass. Integration may expose mismatches in the concurrently integrated Rails controllers, pinned Auth mail link behavior, or resource cleanup assumptions; preserve the failing evidence and assign concrete fixes before rerunning.
