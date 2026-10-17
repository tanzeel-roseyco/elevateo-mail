Latest Lane P checkpoint: reviewed activation rerun PASS on fleet-02, 9 runs / 48 assertions / zero failures, errors and skips; SSH=0, test_exit=0, cleanup_failed=0. Independent exact task cleanup verified; shared bases and FE-owned fe01r8-probes-stage preserved. Backend reservation released to FE r9. Linux pwsh only; native Windows and whole BE01 acceptance remain pending. See docs/evidence/be-01-r1-lane-p-result.md. Earlier pending/failed/reservation statements below are historical.

# Lane P reviewed activation repair: prepared rerun

Both parent-supplied independent code and dedicated design reviews PASS: zero confirmed defects, 140 executable LOC / 155 including manifests, 0/KLOC. Overlapping coverage is counted once. All six hashes match the activation packet. Runtime and native Windows acceptance remain pending. Frontend r8 owns fleet-02; the following commands are proposals, not executed commands. No ultrareviews.

Local archive: C:/Users/Tanzeel/AppData/Local/Temp/be01-lane-p-activation-4509ce84.tar (16384 bytes).

Archive SHA256: `854dfcfc8b4899d44fbb89e6780b7b6264c724cb94da247fe2617ceb501e27c9`.

Exactly six regular LF files, independently matched to the reviewed hashes before packaging: Dockerfile, checks.sh, gems.rb, parent-run.sh, package.sha256 and dispatch.sha256 at their paths in [the freeze packet](be-01-r1-lane-p-activation.md). No canonical source files or prior frozen dependencies are packaged. Archive listing was inspected locally; no test or Docker execution occurred.

## Proposed staging after reservation return

Upload only this archive to /home/tanzeel/elevateo-mail-tests-20261012-ultra. Use a fresh bounded SSH session; preserve the original console/evidence. In Bash with set -euo pipefail and umask 077:

```bash
root=/home/tanzeel/elevateo-mail-tests-20261012-ultra
src=$root/lane-c-20261012
cd "$root"
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base ]]
printf '%s  %s\n' 854dfcfc8b4899d44fbb89e6780b7b6264c724cb94da247fe2617ceb501e27c9 be01-lane-p-activation-4509ce84.tar | sha256sum -c -
files=(ops/tools/lane-p-protocol/Dockerfile ops/tools/lane-p-protocol/checks.sh ops/tools/lane-p-protocol/gems.rb ops/tools/lane-p-dispatch/parent-run.sh ops/tools/lane-p-protocol/package.sha256 ops/tools/lane-p-dispatch/dispatch.sha256)
diff -u <(printf '%s\n' "${files[@]}" | sort) <(tar -tf be01-lane-p-activation-4509ce84.tar | sort)
tar -tvf be01-lane-p-activation-4509ce84.tar | awk 'substr($0,1,1)!="-" {bad=1} END {exit bad}'
stage=$(mktemp -d "$root/lane-p-activation-stage.XXXXXX")
tar -xf be01-lane-p-activation-4509ce84.tar -C "$stage"
cd "$src"
# Authenticate the previous snapshot before replacing the five known old files.
printf '%s  %s\n' d8697801281bb09109c1ac5953c0ace3aea31fc7c340071c87777813f59ad03b ops/tools/lane-p-dispatch/dispatch.sha256 | sha256sum -c -
sha256sum -c ops/tools/lane-p-dispatch/dispatch.sha256
printf '%s  %s\n' 03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b ops/tests/fleet02-egress-source.sha256 | sha256sum -c -
sha256sum -c ops/tests/fleet02-egress-source.sha256 > "$stage/source.before"
[[ ! -e ops/tools/lane-p-protocol/gems.rb && ! -L ops/tools/lane-p-protocol/gems.rb ]]
for file in "${files[@]}"; do
  [[ -f $stage/$file && ! -L $stage/$file && ! -L $src/$file ]]
  parent=$(dirname "$src/$file")
  [[ $(realpath "$parent") == "$parent" ]]
done
for file in "${files[@]}"; do install -m 644 "$stage/$file" "$src/$file"; done
printf '%s  %s\n' 4509ce8417eb93167847a67093b435eb000e11b1e82755e8ddcd0803402cdb25 ops/tools/lane-p-dispatch/dispatch.sha256 | sha256sum -c -
sha256sum -c ops/tools/lane-p-dispatch/dispatch.sha256 ops/tools/lane-p-protocol/package.sha256 ops/tests/fleet02-egress-source.sha256 > "$stage/authenticated.log"
```

Abort on unexpected old bytes, symlinks or any mismatch. This sequence deliberately rejects an already-restaged tree; inspect instead of silently overwriting a different snapshot. No canonical source manifest is regenerated.

## Preflight and exact proposed launch

Before launch, repeat the previously reviewed bounded syntax/UID10001 readability container from TEMP/be01-lane-p-stage.sh with the updated authenticated manifest, adding `ruby -c /src/ops/tools/lane-p-protocol/gems.rb` inside that pinned Ruby container. Keep its socket-free, network-none, read-only, cap-drop, no-new-privileges, 0.5CPU/256MiB profile and exact name/label inventory. Do not run the old staging script itself: its archive, old manifest and no-overwrite assumptions are obsolete. Record host free bytes and verify daemon endpoint, strict short hostname and absence of Docker host/TLS overrides. Independently inspect the same pinned Ruby and BuildKit images documented in the dispatcher before mutation; no pulls or shared-resource cleanup.

After all prerequisites succeed:

```bash
cd /home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012
printf '%s  %s\n' 4509ce8417eb93167847a67093b435eb000e11b1e82755e8ddcd0803402cdb25 ops/tools/lane-p-dispatch/dispatch.sha256 | sha256sum -c -
result=0
TOOLS_SOURCE="$PWD" TOOLS_CONTEXT=default TOOLS_HOST=Ubuntu-noble-latest-amd64-base \
TOOLS_EVIDENCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra \
bash ops/tools/lane-p-dispatch/parent-run.sh \
  > /home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-p-activation-console.log 2>&1 || result=$?
printf 'dispatcher_exit=%s\n' "$result"
```

Require fresh Ruby prerequisite PASS, then exactly nine tests / 48 assertions / zero failures, errors and skips. Capture test_exit and cleanup_failed separately. Independently inventory exact task names, IDs, labels, builder/cache/image plus syntax container and actual available bytes; preserve shared bases and uncertain resources. Do not release reservation until cleanup is reconciled. No rerun is authorized while frontend holds the reservation. Linux pwsh success would not establish native Windows acceptance.
