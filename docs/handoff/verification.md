# Local setup and release verification

Jeison runs these checks on the accepted release commit and gives Callum the results. [Handoff state and gates](README.md) describe what is still pending. These commands were source-checked for this guide; this documentation task did not rerun the application suites. Keep logs and screenshots under `docs/completion/<topic>-<date>/`, without secrets or message bodies.

## Local bootstrap

Use a fresh local checkout of the accepted revision, Git, a POSIX shell, Python 3.12+ and Docker Desktop's Linux engine. Windows users can use Git Bash for the shell commands; PowerShell environment syntax is `$env:DOCKER_CONTEXT='desktop-linux'`. Do not inherit the broken default `fleet02` context.

```sh
export DOCKER_CONTEXT=desktop-linux
git status --short
git rev-parse HEAD
docker context show
docker version
sh scripts/dev bootstrap
sh scripts/dev migrate
sh scripts/dev up
docker compose -f compose.yaml --env-file ops/local/.env ps
```

Expected: intended clean revision, `desktop-linux`, successful bootstrap/migrations and healthy runtime services. Bootstrap generates local secrets under `ops/local/`; never commit or print them. There is no maintained `scripts/dev seed` or `check` command. This stack is an isolated backend, not proof of company SSO or live email.

Checkpoint: run the configured API health check, then the web suite below. Use `docker compose -f compose.yaml --env-file ops/local/.env exec -T api ruby -rnet/http -e "r=Net::HTTP.get_response(URI('http://127.0.0.1:3000/health')); exit(r.code=='200' ? 0 : 1)"`. Expected: exit zero. If startup fails, retain the volumes and inspect redacted service errors; do not regenerate secrets over an existing database. Stop with `sh scripts/dev stop`.

## Web checks and visual QA

```sh
docker build -f apps/web/docker/test.Dockerfile -t elevateo-web-check .
docker run --rm elevateo-web-check
docker build -f ops/tests/email-finder/web.Dockerfile -t elevateo-web-browser-check .
docker run --rm --ipc=host elevateo-web-browser-check
```

The first image runs both contract checks, lint, typecheck, unit coverage, production build and bundle budget. The second uses the pinned Playwright image and runs lint/typecheck/unit/browser tests, including the configured 1440- and 390-pixel projects. Pass requires zero failed commands/tests and no unexplained skipped release criteria. The finder receipt's unrelated browser/contract failures are not waived by these instructions.

For manual fixture inspection, run `docker run --rm -p 127.0.0.1:5173:5173 elevateo-web-check npm run dev:fixtures -- --host 0.0.0.0` and open the explicitly labelled fixture entry `/dev-fixtures.html`. Loopback is used only to view the containerized application. Verify light/dark at 1440 and 390 widths, keyboard/focus behavior and empty/loading/error states. Fixtures do not prove backend integration: repeat relevant flows against the approved integrated environment, including SSO, read/search/draft, permissions, attachments, revocation and held-send behavior. No live send without its separate gate.

## Backend, database, protocol and recovery

These commands use the existing harnesses. Python runs orchestration on the host; application tests execute inside containers. Capture the image IDs produced by `docker image inspect`, not old receipt IDs.

```sh
docker build -t elevateo-handoff-server apps/server
SERVER_IMAGE=$(docker image inspect --format '{{.Id}}' elevateo-handoff-server)
docker build -f ops/tests/completion/Dockerfile.mox --build-arg SERVER_IMAGE="$SERVER_IMAGE" -t elevateo-handoff-mox .
MOX_IMAGE=$(docker image inspect --format '{{.Id}}' elevateo-handoff-mox)
python3 ops/tests/completion/local_backend.py --execute-final-gate --server-image "$SERVER_IMAGE" --mox-image "$MOX_IMAGE"
docker run --rm "$MOX_IMAGE"
```

Pass: backend tests, Steep/RuboCop, real-role database suites/migrations and local application chain pass; standalone Mox protocol exits zero. `local_app_chain.py` is a helper imported by the backend harness, not a standalone executable test command. The harness verifies isolation; no public SMTP is required.

Recovery uses the operations-image build recipe. Supply `DOCKER_IMAGE` as an approved repository-qualified Docker CLI image digest containing the Docker binary and Compose plugin, and `HELPER_IMAGE` as a reviewed repository-qualified digest containing GNU tar/sh. These are operator-selected build inputs, not credentials or hashes to copy blindly from a receipt:

```sh
docker build -f ops/tests/completion/Dockerfile.operations --build-arg SERVER_IMAGE="$SERVER_IMAGE" --build-arg DOCKER_IMAGE="$DOCKER_IMAGE" -t elevateo-handoff-operations .
OPERATIONS_IMAGE=$(docker image inspect --format '{{.Id}}' elevateo-handoff-operations)
REVISION=$(git rev-parse HEAD)
python3 ops/tests/completion/local_restore.py --execute-final-gate --server-image "$SERVER_IMAGE" --operations-image "$OPERATIONS_IMAGE" --helper-image "$HELPER_IMAGE" --revision "$REVISION"
```

Pass: six-volume byte/hash validation, old sessions/grants revoked, unfinished sends held and no replay, restricted roles/RLS verified. The harness retains data where required; inspect its cleanup receipt. The local drill does not test company SFTP. Perform the separately approved [off-host backup and restore](production.md) before go-live.

The final backend harness includes Ruby contract tests. Run the additional Node contracts, MCP and operations unit checks explicitly:

```sh
docker run --rm -v "$PWD/contracts:/source/contracts:ro" elevateo-web-check sh -ec 'cp -R /source/contracts /tmp/contracts; cd /tmp/contracts/tooling; npm ci --ignore-scripts; node --test ../v2/completion_schema_test.cjs'
docker build -f apps/mailbox-mcp/Dockerfile -t elevateo-handoff-mcp .
docker run --rm --network none elevateo-handoff-mcp npm test
docker run --rm --network none "$OPERATIONS_IMAGE"
```

The Node command needs registry access for the pinned tooling install; it copies the read-only contracts into its disposable container. Pass: every test exits zero. For native bridge unit checks, select an approved digest-pinned Debian-based Rust image as `RUST_IMAGE`, then:

```sh
docker build -f apps/native/src-tauri/src/agents/Dockerfile.check --build-arg RUST_IMAGE="$RUST_IMAGE" --build-arg DOCKER_IMAGE="$DOCKER_IMAGE" -t elevateo-handoff-agents apps/native/src-tauri/src/agents
docker run --rm --network none elevateo-handoff-agents
docker run --rm --network none elevateo-handoff-agents sh -ec 'cargo clippy --locked --all-targets -- -D warnings; cargo fmt --check'
```

Pass: Rust/Python unit tests, Clippy and formatting exit zero. These checks do not reproduce the separate real-container lifecycle receipt or prove client integration; those remain release evidence requirements. The [finder harness](../../ops/tests/email-finder/check.ps1) contains an obsolete `deploy.sh config --quiet` invocation and modifies generated API types; do not treat its failure as deployment failure or silently accept generated changes. Repair/review that harness separately before using it as a release gate.

## Required release evidence

Callum receives: accepted commit and image/artifact hashes; all contract/lint/type/unit/integration results; migration and RLS tests; SMTP/IMAP and attachment failure-path tests; revoked-access checks; restore and backup receipts; desktop/mobile screenshots; platform packaging and real-device results from [clients](clients.md). Review P24–P34 and the pending Windows/schema/modular branches before claiming a merged-product pass. A branch receipt does not cover later changes.

Before live traffic, also demonstrate SSO allowed/denied/revoked membership, private bucket behavior, quarantined/unauthorized download denial, MCP scope/revocation, hold/quotas, ambiguous-send handling and monitoring/abort ownership. Mail DNS and a single approved live send are separate gates, not automatic follow-ups to green tests.

## Docker cleanup

Coordinate a local engine window before builds: the mandated prune commands remove all unused images/cache on that engine, not just this checkout. Do not interrupt another task's containers or builds. Use `--rm` for one-off runs. Immediately after the required tests/preview, inspect task-owned containers/mounts, stop only disposable task services, then run:

```sh
export DOCKER_CONTEXT=desktop-linux
docker builder prune -a -f
docker image prune -a -f
docker system df
```

Never prune volumes. Remove a disposable volume only by exact name after verifying ownership and contents; keep local databases and source data. Record deleted resources, reclaimed space and retained data. On Windows verify host free space too; use supported Docker/WSL trim/compaction only when safe. Report if active workloads or privileges prevent compaction. No Docker resources were created by the documentation task.
