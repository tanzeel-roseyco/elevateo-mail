# Diagnostic-only Docker validation proposal — NOT EXECUTED

## Current local prerequisite and reconciliation freeze

Authorized local download completed without installation/execution: `C:/Users/Tanzeel/AppData/Local/Temp/be01-diagnostic-input-20261012-154354/minitest-6.0.6.gem`, from https://rubygems.org/downloads/minitest-6.0.6.gem. Observed SHA256 `153ea36d1d987a62942382b61075745042a2b3123b1cd48f4c3675af9cc7d6f1` matches the frozen requirement. Earlier missing-cache statements below are historical. No remote action or allocation occurred. Initial shell process creation failed before execution; explicit Windows PowerShell successfully performed the download and hash read.

Dispatcher98/checks14/input manifest8 hashes below remain unchanged. Separate `docs/evidence/repairs/be01-services-observability/reconcile.sh`:44 LOC, SHA256 `0a0e73b595445c3848a961d650f03f5b147f09c84856a1abfcec957eac4cf101`. Total new executable review scope156 LOC, plus8 manifest entries; coordinator correctness review156 unique LOC zero defects/0 per KLOC; dedicated design76 overlapping LOC zero defects, no runtime claim. Existing Ruby225-LOC static closure remains separate. No frozen product/fixture edits.

Reconciliation requires successful fresh preflight artifacts in AUDIT: retained-config.before.json from exact volume inspect, retained-image-ids.before containing validated immutable IDs for retained Python and all shared bases, and builders.before containing sorted unique names from bounded `docker --context default buildx ls --format '{{.Name}}'`. Caller must validate those image IDs against their historical provenance and verify canonical52/nested manifests independently before/after; the small script verifies its input manifest, not the entire canonical checkout. Fresh lease/conflict and successful baseline gates precede allocation. Missing captured container ID fails closed and requires separate read-only investigation; this script does not infer identity or delete anything.

Upload/authenticate reconcile.sh outside the mounted source. After the dispatcher finishes, invoke independently even when its process exit is nonzero, using the same exact AUDIT/NONCE/SRC/INPUT_SHA:

```bash
printf '%s  %s\n' 0a0e73b595445c3848a961d650f03f5b147f09c84856a1abfcec957eac4cf101 "$AUDIT/reconcile.sh" | sha256sum -c -
set +e
bash "$AUDIT/reconcile.sh" </dev/null > "$AUDIT/reconciliation.log" 2>&1
reconciliation_exit=$?
set -e
printf 'reconciliation_exit=%s\n' "$reconciliation_exit" > "$AUDIT/reconciliation.status"
```

Capture native SSH exit immediately separately. Reconciler180+15 watchdog; missing status/timeout is UNKNOWN. Exact ID/name/label absence requires successful inventories. It compares config identity without reading contents, requires zero consumers, retains all listed baseline image IDs and verifies builder names. Builder-name equality alone is not builder identity proof; caller retains existing historical ownership inspection evidence. No removals in reconciliation. Preserve retained config and historical Python limitations; shared-host df delta is not attributable reclamation.

No allocation exists. Local Docker pipe is unavailable; do not start it. Fresh FE receipt4b453144-c04f-4ebf-9ebc-569003c25e7a confirms no reservation/SSH/transfers/scheduled work; r9 stale, r11 release e78cd0cc final. Wait for explicit allocation regardless. No full services, config mount, recovery, image build/pull, canonical-source overwrite or paid invocation belongs to this packet.

## Immutable inputs and staging

Fresh UUID task name `be01diagnostic-<UUID>`; private outer evidence directory `/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01diagnostic-<UUID>` mode0700. Its new `source` directory0755 contains ONLY the following paths (intermediate dirs0755/files0644). Preserve relative paths because the regression loads original http.rb and services.rb. Never chmod existing ancestors. Authenticate each file before invoking; refuse existing/dangling delivery targets. Hash-copy originals as canonical LF, never repin to checkout CRLF.

| Relative path | SHA256 |
| --- | --- |
| docs/evidence/repairs/be01-services-observability/services.rb | b2fedbbbb2634d3eba2cf9b88a5127b0b829e5d49ec46c0ee43f8813c30e2368 |
| docs/evidence/repairs/be01-services-observability/diagnostic.rb | 35d30ed56f8d1590ad333803e481f65bad6d1e7ba076f8a24c551937874f52eb |
| docs/evidence/repairs/be01-services-observability/regression.rb | ac7f7c541b35604cd477df24bddc64d40805899d89d6974c69d8fcdd2731c5a6 |
| docs/evidence/repairs/be01-services-observability/package.sha256 | f048bb6f640ae835a6886d476e7f2d496e2b9ddaac1f69c028ce08b5d2cf3f56 |
| ops/tests/be01-services/http.rb | 79375775aa33cb39756e07d819119bf3e426a921f206b791d6b323d45f8b4acb |
| ops/tests/be01-services/services.rb | 82198f2503f4a23fc5b0406d966d6b8dd84e5d768623510f904fc0de669860fa |
| minitest-6.0.6.gem | 153ea36d1d987a62942382b61075745042a2b3123b1cd48f4c3675af9cc7d6f1 |

Minitest is a prerequisite, not assumed present in the base. Reuse exact authenticated cached gem if available. Its pin comes from frozen ops/tools/be01-services-tools/Dockerfile. If unavailable, stop and report prerequisite; any acquisition requires coordinator-approved delivery. Install offline into disposable /tmp only; no product dependency changes. Verify original two source pins against canonical staging before copying; stop on disagreement.

## Preflight and exact constrained command

Fresh bounded reads must establish hostname -s Ubuntu-noble-latest-amd64-base; selected default context endpoint unix:///var/run/docker.sock; no DOCKER_HOST/TLS overrides; no conflicting task lease; exact UUID name/label collision absent; available disk >=2GiB and MemAvailable >=512MiB; successful full inventories and canonical52/nested manifests unchanged. Record raw df -B1 before. Capture current retained config volume identity/no consumers, retained Python/shared bases/builders. Do not mount or inspect config content.

Existing immutable base ONLY:
`ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2`.
Authenticate platform linux/amd64, RepoDigest and actual immutable image ID with established compatible image-store checks; absent/mismatched image stops without pull. All daemon reads/create/remove bounded15+3 seconds. Administrative overall watchdog300+30; test180+10. AUDIT/SRC/NAME/NONCE/IMAGE below are exact preflight-captured paths/identities, not shell-generated substitutions in uploaded script contents.

The concrete LF dispatcher below supersedes the earlier inline command. Authenticate it separately outside the mounted source; mount only the manifest-listed inputs. Caller must complete the canonical52/nested-source, lease/conflict and retained-resource baseline gates above before invocation. Dispatcher rechecks host/context/capacity/base and exact task collisions; it does not replace those external gates.

| Local file under docs/evidence/repairs/be01-services-observability/ | Lines | SHA256 |
| --- | ---: | --- |
| dispatch.sh | 98 | 63501c5f2b16e1f6d6db5fb53a56dde104260f97c43f39db9d7c81b6ef7f1007 |
| checks.sh | 14 | 8cecdca8d33721cc2b92d7f15b6de3dedfee83ccfac0f28622058353346a359e |
| inputs.sha256 | 8 | 380bc01a2bb830133cb385be4f5e825b514cb283635a28fad9b565767b3fd573 |

Stage checks.sh at source/checks.sh, inputs.sha256 at source/inputs.sha256; preserve the remaining manifest relative paths. Authenticated gem and eleven-member delivery are now available; see current delivery section below.

Proposed invocation after allocation, delivery authentication and fresh gates (AUDIT is the fresh exact private delivery, NONCE its UUID; no script substitution):

```bash
printf "%s  %s\n" 63501c5f2b16e1f6d6db5fb53a56dde104260f97c43f39db9d7c81b6ef7f1007 "$AUDIT/dispatch.sh" | sha256sum -c -
export AUDIT NONCE
export SRC="$AUDIT/source"
export INPUT_SHA=380bc01a2bb830133cb385be4f5e825b514cb283635a28fad9b565767b3fd573
set +e
bash "$AUDIT/dispatch.sh" </dev/null > "$AUDIT/process.log" 2>&1
process_exit=$?
set -e
printf "process_exit=%s\n" "$process_exit" > "$AUDIT/process.status"
```

Native PowerShell caller must capture `$LASTEXITCODE` immediately after SSH, independently from process.status. Dispatcher writes create/test/cleanup/inventory/source/base/space exits to status and preserves original nonzero process exit. Failure before allocation can lack status; missing status is never success. Its internal overall watchdog is300+30, test180+10, each daemon call15+3. Outer timeout can cut cleanup short; independent reconciliation remains mandatory. Signal handling can wait for the bounded foreground command.

Profile checks exact captured ID/name/image/nonce, user10001:10001, entrypoint/command, sole read-only bind, network none, read-only root, CPU/memory/swap/PIDs, no capabilities/devices/ports, no-new-privileges and exact tmpfs. Cleanup force-removes only that verified disposable ID; failed/missing identity retains uncertainty. No images or volumes are removed. Runtime UID readability and Ruby syntax are unproven until the single container runs. Repeated seed coverage is stub branch selection, not real durable-state survival.

## Cleanup and independent reconciliation

Install exact-task cleanup before allocation. On every outcome, inspect captured ID and require exact name/image/nonce label plus sole read-only bind source/destination and expected constrained profile. Only then remove that disposable container by ID (force only if still running after deadline and exact ownership remains proved). Bounded15+3 daemon calls. Missing ID or failed inspection means UNKNOWN: preserve resource, inventory independently, never blind name-based deletion/retry. No image/volume/cache removal; no builder exists for this packet.

Require successful fresh full container inventory independently proving captured ID/name/nonce label absent, plus unchanged source hashes, retained config identity and consumer set, Python/shared base IDs and shared builders. Capture df -B1 after; report raw delta as shared-host change, not reclamation. Keep evidence: create.log/container.id, created.json, checks.log, remove.log, process.status, independent/status and full before/after inventories under AUDIT; fetch to matching local Temp/be01diagnostic-UUID. Missing status or timeout remains UNKNOWN until independently reconciled. Retain evidence and disclose any cleanup uncertainty before releasing reservation.

## Review/runtime boundary

Original services58+regression104 and diagnostic39:201 unique LOC static zero defects,0/KLOC; analytical design only, Obsidian unavailable. Supplemental regression128 passed delta adversarial review0; current unique coverage225 LOC (58+39+128), zero defects,0/KLOC. Runtime NOT_RUN. Services and diagnostic unchanged. Generic timeout output remains an accepted limitation. Underlying Auth assertion and unexpected config contents remain unresolved. This proposal does not authorize remote staging or execution.

## Accepted delivery and exact invocation (preparation only)

Coordinator static closure: dispatch98 + checks14 + reconcile44 =156 unique executable LOC, zero confirmed defects,0/KLOC; dedicated design76 overlapping LOC zero defects, nonadditive. Ruby coverage remains225 unique LOC static0. All execution bytes remain frozen. No runtime proof or remote allocation.

Local archive: `C:/Users/Tanzeel/AppData/Local/Temp/be01-diagnostic-delivery-6081ca98-9972-4568-b3ab-135f12dc0671.tar`
SHA256 `1b2631a11e91e231399b71e18ac9a0fbcb783204bfcf6cd209f2b33a8978cf87`.
Exact eleven regular members and individual hashes: `docs/evidence/repairs/be01-services-observability/delivery.json`. Archive listing checked locally; no symlinks, directory entries, absolute paths or traversal members. Original two Ruby files were copied as LF and matched canonical pins; canonical source was not edited. Archive modes666 must become0644 on extraction; only new source directories become0755, fresh outer AUDIT0700. Never change existing ancestors.

After a fresh allocation, use NONCE=6081ca98-9972-4568-b3ab-135f12dc0671 ONLY if the exact remote delivery is absent including dangling links. Otherwise stop, do not retry/overwrite. Upload archive to a separately fresh private incoming directory, authenticate outer SHA before listing/extraction, compare all eleven names/types against delivery.json, then extract into the newly created AUDIT. Reject duplicate/additional/nonregular entries. Verify dispatcher/reconciler hashes separately and source inputs manifest before any container creation. No canonical checkout staging.

Fresh prerequisite record must include expected hostname/context, no conflicting BE/FE/PERF lease, exact task name/label absence, disk>=2GiB, MemAvailable>=512MiB and authenticated existing Ruby linux/amd64 RepoDigest/ID. No pulls. All Docker reads use timeout15+3 and explicit context; failed inventory stops. Capture full successful inventories and actual image IDs, not volatile formatted-list equality.

Canonical source is `/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012`. Before AND after execution, authenticate every manifest hash in the current exact authentication-chain table in `be-01-services-next-runtime.md`, then run each manifest's `sha256sum -c` from canonical root. Canonical52 manifest SHA is `03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b`. Keep each native exit and bounded source log separate from dispatcher source_exit (which covers only diagnostic inputs).

Retained config historical baseline is `/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-full-services-d25b2424-838c-4c2e-8a7c-c8c7abdfa1ab/evidence/be01services-d07cdf3e-f525-49e2-8b35-e940eb3451c6.ahYiWs/resources/config.volume`. Require successful JSON inspection of exact volume name and compare stable Name/Driver/Scope/CreatedAt/Labels/Options/Mountpoint against fresh inspect before launch. Do not mount/read its contents. Require zero consumers. Any mismatch stops.

Concrete baseline and invocation below assumes authenticated delivery, canonical/historical gates above and coordinator lease already passed. Save this block as LF for invocation; no nested SSH interpolation or broad substitution. Authenticate any uploaded command file against its final local hash before use. Outer SSH watchdog must allow dispatcher330s plus reconciliation195s and bounded preflight; missing transport/status remains UNKNOWN.

```bash
set -euo pipefail
export NONCE=6081ca98-9972-4568-b3ab-135f12dc0671
export AUDIT=/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01diagnostic-6081ca98-9972-4568-b3ab-135f12dc0671
export SRC="$AUDIT/source"
export INPUT_SHA=380bc01a2bb830133cb385be4f5e825b514cb283635a28fad9b565767b3fd573
daemon() { timeout -k 3s 15s docker --context default "$@"; }
printf '%s  %s\n' 63501c5f2b16e1f6d6db5fb53a56dde104260f97c43f39db9d7c81b6ef7f1007 "$AUDIT/dispatch.sh" 0a0e73b595445c3848a961d650f03f5b147f09c84856a1abfcec957eac4cf101 "$AUDIT/reconcile.sh" | sha256sum -c -
(cd "$SRC" && printf '%s  inputs.sha256\n' "$INPUT_SHA" | sha256sum -c - && sha256sum -c inputs.sha256)
volume=be01services-d07cdf3e-f525-49e2-8b35-e940eb3451c6-config
daemon volume inspect "$volume" > "$AUDIT/retained-config.before.json"
daemon container ls -a -q --no-trunc --filter "volume=$volume" > "$AUDIT/config-consumers.before"
[[ ! -s $AUDIT/config-consumers.before ]]
daemon image ls -a -q --no-trunc > "$AUDIT/images.before.raw"
sort -u "$AUDIT/images.before.raw" > "$AUDIT/retained-image-ids.before"
[[ -s $AUDIT/retained-image-ids.before ]]
while IFS= read -r id; do [[ $id =~ ^sha256:[a-f0-9]{64}$ ]]; done < "$AUDIT/retained-image-ids.before"
daemon buildx ls --format '{{.Name}}' > "$AUDIT/builders.before.raw"
sort -u "$AUDIT/builders.before.raw" > "$AUDIT/builders.before"
df -B1 "$AUDIT" > "$AUDIT/df.before"
# Historical identity/canonical gates are mandatory before this invocation.
set +e
bash "$AUDIT/dispatch.sh" </dev/null > "$AUDIT/process.log" 2>&1
process_exit=$?
set -e
printf 'process_exit=%s\n' "$process_exit" > "$AUDIT/process.status"
set +e
bash "$AUDIT/reconcile.sh" </dev/null > "$AUDIT/reconciliation.log" 2>&1
reconciliation_exit=$?
set -e
printf 'reconciliation_exit=%s\n' "$reconciliation_exit" > "$AUDIT/reconciliation.status"
# Independently repeat canonical and historical retention checks before lease release.
(( process_exit == 0 && reconciliation_exit == 0 ))
```

Capture native SSH LASTEXITCODE immediately into a separate local transport status. Do not pipe SSH into logging that masks its exit. Capture after-canonical, historical volume identity, shared image digest/ID and builder ownership results independently even on failed dispatch. Retain Python/shared bases; no image deletion. Name-only builder equality is supplemented by successful before/after registration/ownership inspection, not a claim of identity proof from names.

Reconciler missing/invalid container.id stops BEFORE inventory: independent nonzero, identity UNKNOWN, never cleanup success. Obtain separate read-only full inventory/label evidence in that case; no inferred ID, blind removal or retry. Only the reviewed dispatcher may remove its profile-proven task container. Report process/test/cleanup/canonical/source/inventory/retention/native SSH separately. Raw df change is shared-host delta, not attributable reclamation.

Remaining prerequisites: coordinator allocation, authenticated remote delivery and fresh gates, actual UID10001 readability, Docker Ruby syntax/regression and independent cleanup. No full-services assertion, real Auth/private Storage/restart or retained-config-content proof is supplied by this regression.
