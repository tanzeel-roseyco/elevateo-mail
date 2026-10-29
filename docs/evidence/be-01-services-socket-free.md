# BE01 services: next-lease socket-free execution packet

Prepared only; no commands executed. Requires explicit FE release, coordinator reservation, and parent acceptance of this command packet. FE r11 reported 209 unit /163 browser /50 skips and cleanup exit0; independent release is not inferred. No paid calls or ultrareviews.

## Frozen inputs and review closure

Adapter package SHA256 `3044a0e2df4daa6cf5372e1edd90c609f5ed9d91a2b874842e97710d09694787`; fixture package `028c90c20b356ffaa8c4ba285524d4835dd8513685c096aa41acaa12b22a476d`; canonical source manifest `03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b`. Preserve canonical 52 LF source files. Stage only authenticated new adapter/fixture files; never repin product source from the CRLF checkout. Authenticate transfer archive externally and compare these manifest hashes before trusting their entries.

Parent targeted review: prior marker P2 resolved statically, zero new defects /132 LOC /0 per KLOC. Real conditional fixture regression discriminates the original failure across four cases. Separate unchanged run.sh review (66 LOC, overlapping original coverage) confirms direct unconditional run_phases at65 under set-euo at3. Original review remains 488 unique LOC /one defect /2.05 per KLOC; no double-counting repair or caller coverage. Runtime remains unproven.

## Runtime prerequisites

Use two independently inspected immutable local image IDs: `TOOLS_IMAGE` with pinned Ruby3.4.11, Bash, coreutils, jq; `APP_IMAGE` with pinned Ruby3.4.11 and the frozen app bundle including Minitest6.0.6. Previous disposable images were cleaned; their availability is not assumed. Any prerequisite build requires the separately reviewed capped Buildx lifecycle, immutable BuildKit pin and exact cleanup. No ad-hoc install in these test containers, pulls, Docker socket, network, secrets or database. App baked-source verification is required before later full lifecycle, not established by these boundary tests.

After reservation, set `SRC` to the authenticated canonical staged tree, `CTX` to the independently verified daemon context, and both image IDs from verified build evidence. Require hostname -s `Ubuntu-noble-latest-amd64-base`, reject DOCKER_HOST, record context endpoint, image inspection and actual host free bytes. All daemon commands below have bounds. Record these commands in a reviewed LF file and run with Bash set-euo pipefail after reservation, not through nested SSH quoting.

```bash
set -euo pipefail
: "${SRC:?}" "${CTX:?}" "${TOOLS_IMAGE:?}" "${APP_IMAGE:?}"
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base && -z ${DOCKER_HOST:-} ]]
[[ $SRC == /* && -d $SRC ]]
[[ $TOOLS_IMAGE =~ ^sha256:[0-9a-f]{64}$ && $APP_IMAGE =~ ^sha256:[0-9a-f]{64}$ ]]
task="be01checks-$(cat /proc/sys/kernel/random/uuid)"
evidence=$(mktemp -d "$HOME/$task.XXXXXX")
printf '%s\n' "$task" > "$evidence/task"
timeout 20s docker --context "$CTX" context inspect "$CTX" > "$evidence/context.json"
timeout 20s docker --context "$CTX" image inspect "$TOOLS_IMAGE" "$APP_IMAGE" > "$evidence/images.json"
df -B1 "$SRC" "$evidence" > "$evidence/space-before.txt"
cd "$SRC"
printf '%s  %s\n' \
  3044a0e2df4daa6cf5372e1edd90c609f5ed9d91a2b874842e97710d09694787 ops/tools/be01-services/package.sha256 \
  028c90c20b356ffaa8c4ba285524d4835dd8513685c096aa41acaa12b22a476d ops/tests/be01-services/package.sha256 \
  03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b ops/tests/fleet02-egress-source.sha256 | sha256sum -c -
sha256sum -c ops/tools/be01-services/package.sha256
sha256sum -c ops/tools/be01-services/dependencies.sha256
sha256sum -c ops/tests/be01-services/package.sha256
sha256sum -c ops/tests/fleet02-egress-source.sha256
common=(--rm --pull never --network none --read-only --user 10001:10001
  --cpus .5 --memory 256m --memory-swap 256m --pids-limit 128
  --cap-drop ALL --security-opt no-new-privileges
  --mount "type=bind,src=$SRC,dst=/src,readonly"
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777
  --env HOME=/tmp --workdir /src --label "elevateo.lane=$task")
set +e
timeout --signal=TERM --kill-after=15s 180s docker --context "$CTX" run \
  "${common[@]}" --name "$task-synthetic" --entrypoint bash "$TOOLS_IMAGE" -ceu '
    test "$(id -u)" = 10001
    test "$(ruby -e "print RUBY_VERSION")" = 3.4.11
    command -v jq
    sha256sum -c ops/tools/be01-services/package.sha256
    sha256sum -c ops/tools/be01-services/dependencies.sha256
    sha256sum -c ops/tests/be01-services/package.sha256
    sha256sum -c ops/tests/fleet02-egress-source.sha256
    for file in ops/tools/be01-services/*.sh; do bash -n "$file"; done
    for file in ops/tools/be01-services/*.rb ops/tests/be01-services/*.rb; do ruby -c "$file"; done
    bash ops/tools/be01-services/regression.sh
    bash ops/tools/be01-services/profile-regression.sh
    bash ops/tools/be01-services/fixture-regression.sh
  ' > "$evidence/synthetic.log" 2>&1
synthetic_exit=$?
set -e
printf 'synthetic_exit=%s\n' "$synthetic_exit" > "$evidence/status"
```

Inspect the synthetic log and exact task inventory before proceeding. On failure/timeout stop; do not automatically launch boundary tests or retry. The intentional marker-redirection errors in fixture-regression are expected only when its four-case oracle subsequently succeeds.

After synthetic exit0 and independent exact container absence, run:

```bash
set +e
timeout --signal=TERM --kill-after=15s 120s docker --context "$CTX" run \
  "${common[@]}" --name "$task-boundary" --entrypoint ruby "$APP_IMAGE" \
  -e 'abort "Ruby pin" unless RUBY_VERSION == "3.4.11"; gem "minitest", "6.0.6"; load ARGV.fetch(0)' \
  /src/ops/tests/be01-services/boundary_test.rb > "$evidence/boundary.log" 2>&1
boundary_exit=$?
set -e
printf 'boundary_exit=%s\n' "$boundary_exit" >> "$evidence/status"
```

Expected boundary oracle, derived statically: seven tests /14 assertions /zero failures, errors and skips. Covers valid state/locator, external recipient injection, malformed UUID/empty password, exclusive state write, symlink/world-readable rejection, foreign/nil locator, external host and malformed request targets. Require actual output to match; exit0 alone is insufficient. The three shell oracles cover observation order/short-circuiting, exact profile plus seven drift rejections and false/null equivalence, and real conditional fixture marker/error propagation. No executable-mode assertions require exec tmpfs here.

## Independent cleanup and evidence gate

After each command, independently inspect exact names `$task-synthetic` and `$task-boundary`, and list containers using exact `elevateo.lane=$task` label (all states). Save bounded `docker --context "$CTX" ps -a --no-trunc` filtered results, task-labelled volume/network/image inventories, `buildx ls`, and `df -B1` after. These commands create no images, builders, networks or volumes; both shared input images must remain. Record actual free-byte delta without attributing unrelated fleet changes to this task.

`--rm` handles ordinary exit only. A CLI timeout is not proof the container stopped or disappeared. If anything remains, capture full ID, inspect State/Labels/Image/Mounts and security/caps; preserve uncertain resources and report cleanup pending. Do not force-remove, broaden filters, prune, or delete the source bind. A separate exact-ownership recovery requires review before mutation. Record test exits and cleanup outcome separately; release the lease only after independently verified absence or explicit coordinator handoff of retained resources.

This packet does not execute full Auth/Storage/Postgres/persistence acceptance. It cannot prove real timeout cleanup, volume retention/removal, old-session survival, native Windows behavior or BE02 readiness. Full adapter runtime remains a separate reviewed next step after these checks pass.
