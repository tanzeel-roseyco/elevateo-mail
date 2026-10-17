Current BE01 checkpoint: services-app socket-free Docker check PASS; staging/SSH/parent/test/source/cleanup/independent reconciliation all0. Exact task container absent; shared bases/builder/persistent resources retained. Lease RELEASED. Fresh full-services read-only preflight SSH0/source0/ready; all pinned images present. Actual Auth/private Storage/lifecycle remains pending new70-minute-plus-reconciliation reservation. See docs/evidence/be-01-services-app-check-result.md. Earlier pending/running statuses are historical; frozen execution bytes unchanged.

# Services-app socket-free packet — frozen for bounded review, not executed

Supersedes rebuild proposal: use existing immutable Ruby base22165c5f only. No tools rebuild, downloads, gems or product changes. Existing services-tools844af and services-app6721 execution bytes unchanged. Coordinator reports services-app correctness129+regression82=211 unique LOC, zero defects,0/KLOC; design129 overlapping (368 with context), nonadditive. Runtime unproven. No current lease or remote mutation.

## New review files

| File | LOC | SHA256 |
|---|---:|---|
| ops/tools/be01-services-app-check/parent-run.sh |64|1a12dd0feb2271b937cd0c2af305603a5a41603d59c8a5de51fa968dc444bae8|
| ops/tools/be01-services-app-check/checks.sh |19|170a6d29ff559958baa8ced9cdd0ae878a8331744bc49ce1464fe461c1e60467|
| ops/tools/be01-services-app-check/regression.sh |94|42aac7690a105cef719f7b0d9a30edf0b5003889d635bb918db27c8927778f44|
| ops/tools/be01-services-app-check/package.sha256 |3|cbc1fe83f8611d66a2c85fb7857550a0527498d48aba26c2706f75c320ab4b63|
| docs/evidence/scripts/be01-services-app-stage.sh |35|f2e5d58d4b789583eebd014edb723fdfb5c45f2a42df11eb7a598be8718b81da|

212 executable LOC after repair (64 parent +19 checks +94 regression +35 staging), plus3 manifest lines. Suggested bounded slices: parent/checks/staging118 LOC and regression94 LOC; design reviews parent/checks plus regression177 LOC. Repair re-review complete:212 unique executable LOC, zero defects,0/KLOC. Docker validation pending. Parent reuses bounded create/inspect/start/cleanup pattern and now has static review closure. Stage authenticates two pinned manifests and exact eight regular files before creating either destination; canonical/source/dependency checks precede writes. Trusted exclusive filesystem boundary required. Partial creation remains for reconciliation; no retry/overwrite. No archive parser or generic framework introduced.

## Additive delivery after review and staging lease

Transfer exactly eight LF files under their repository-relative paths to a fresh private delivery directory (not canonical), plus the stage script outside that directory. Four services-app members remain pinned by6721b356; four app-check members pinned bycbc1fe83. Independently SHA-check uploaded stage script before invoking it. The manifest hash pins and exact delivery member set are embedded in that script, not supplied by an untrusted uploaded allowlist. No archive is required; no canonical52 copies belong in delivery.

With fresh host/context/conflict/capacity and absent-target checks, coordinator-reviewed fixed LF launcher invokes:

```bash
TOOLS_SOURCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012 \
DELIVERY="$PRIVATE_DELIVERY" bash "$AUTHENTICATED_STAGE_SCRIPT"
```

Capture SSH/staging/source exits independently. Independently check both new package pins and members, canonical52 and existing dependencies, directory0755/files0644. Never chmod host ancestors. Existing targets including dangling links stop before either write. Directory-mode evidence is not UID runtime proof.

## Socket-free command after staging acceptance and lease

Freshly inspect existing immutable Ruby digest reference below; no pull fallback. Verify host shortname Ubuntu-noble-latest-amd64-base, selected local unix context, capacity/conflicts, all sources and zero exact task collisions. Save df-B1 and complete before container/image/volume/network/Buildx inventory. Then run externally authenticated parent:

```bash
cd /home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012
printf '%s  %s\n' cbc1fe83f8611d66a2c85fb7857550a0527498d48aba26c2706f75c320ab4b63 ops/tools/be01-services-app-check/package.sha256 | sha256sum -c -
sha256sum -c ops/tools/be01-services-app-check/package.sha256
APP_CHECK_PACKAGE_SHA=cbc1fe83f8611d66a2c85fb7857550a0527498d48aba26c2706f75c320ab4b63 \
TOOLS_SOURCE="$PWD" TOOLS_CONTEXT=default \
TOOLS_EVIDENCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra \
bash ops/tools/be01-services-app-check/parent-run.sh
```

Base: ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2. No image modification/removal. Runtime UID10001,0.5CPU256MiB,pids128,networknone,sourceRO,rootRO,32MiB noexec/nosuid/nodev tmpfs,cap-dropALL,NNP,no socket. Same container proves command availability, actual manifest/source readability, syntax and real regression. Overall240s+30s grace, start120s+5s, daemon15s+3s. Missing tools/readability fails before regression and is not test PASS.

Parent records exact container ID/name/nonce/image and inspected creation JSON before start. Cleanup requires the same full Config/HostConfig/Mounts identity fingerprint, normalizing only known OomKillDisable null/false equivalence; uncertainty retains. Exact verified task container may be force-removed after timeout. Failed create without captured identity is uncertain, not automatically recoverable. Hard outer timeout can interrupt cleanup; independent reconciliation mandatory.

After exit independently inspect complete inventories and emitted exact ID/name plus elevateo.r1.run nonce label. Old services inventory prefix validation cannot be reused unchanged: this runner uses be01appcheck-UUID. Confirm container absent, base image ID unchanged, all shared builder/cache/volumes/images retained; no image/build resources are created by this runner. Save raw df-B1 after and SSH/test/cleanup/source/independent inventory exits separately. Missing status or identity requires separate exact reconciliation, never retry. Release only after independent cleanup or explicit retained-resource coordination.

Full services is still HOLD, requiring subsequent coordinator review/adequate lease. The app parent is not invoked by this check packet. Native Windows and BE02 consultation limitations remain separate.

## Three-defect repair record

Original correctness coverage106 unique LOC:3 confirmed defects,28.30/KLOC. Design found2 overlapping defects over106 LOC,18.87/KLOC; counts are not additive. Original parent6ea52283, checks ee5874fa and stage ef46796f remain historical reviewed identities.

1. EXIT cleanup now explicitly exits nonzero for cleanup/source failure, while preserving the original nonzero test exit.
2. Every pin pipeline and manifest iteration explicitly returns its failed status even under cleanup's set +e.
3. Parent verifies frozen lane-c-app/app.sha256 pin1eeeca5c and its files before execution and during final source verification; checks independently authenticate the same imported helper before and after regression.

Docker-only regression invokes the real extracted functions:12 authentication-failure positions, successful authentication, original swallowed-failure discrimination, five process EXIT combinations including combined failures, original EXIT predicate discrimination, and real checksum helper-drift rejection. No test was executed locally or remotely. Existing frozen services-app6721, services-tools844af and canonical52 bytes are unchanged.

Outer30s termination grace cannot guarantee completion of multiple15s+3s daemon calls. Independently reconcile exact resources after every run, especially timeout or missing summaries; do not infer cleanup from trap installation. Create/profile failure before fingerprint intentionally retains uncertain resources.

## App-check repair review closure and read-only readiness

Coordinator reports independent repair review177 LOC (parent64/checks19/regression94), zero defects,0/KLOC, stable hashes. Root inspected staging35 unchanged structure and repaired package pin: zero additional defects. Total212 unique executable LOC re-reviewed,0 defects,0/KLOC. Prior106 LOC/3 defects remains historical; no runtime PASS inferred.

Fresh read-only fleet preflight: SSH=0, PREFLIGHT_EXIT=0, SOURCE_EXIT=0. Host Ubuntu-noble-latest-amd64-base; default context verified unix:///var/run/docker.sock; Docker override environment absent. Canonical52, services adapter/dependencies/fixtures/tools, identity package/parent/supplement and frozen lane-c-app manifest/files authenticate. Both new destinations ops/tools/be01-services-app and ops/tools/be01-services-app-check absent including dangling links. Existing modes root0775, ops0775, ops/tools0755. Available disk272819945472 bytes; MemAvailable37814892 kB. Existing immutable Ruby22165c5f present linux/amd64. No be01/fe01/perf task-name conflicts; label inventory empty; Buildx lists only default. Shared workloads/volumes inventoried and untouched. Observed resource state does not establish coordinator lease.

Local raw evidence: C:/Users/Tanzeel/AppData/Local/Temp/be01-appcheck-readonly-20261012.log; exact read-only script adjacent with .sh suffix. SSH connect10s/keepalive10s x2, remote overall150s+5s, individual Docker reads20s, local175s deadline. No remote files written, staging, pulls, containers, tests, cleanup or lease consumption. Next: coordinator hold/reservation, fresh conflict/capacity/pin/absence checks, authenticated eight-file additive staging, then separately authorized socket-free parent. Outer cleanup grace remains insufficient to guarantee all calls finish; independent reconciliation required. Full Auth/private Storage/lifecycle remains the next real acceptance milestone.