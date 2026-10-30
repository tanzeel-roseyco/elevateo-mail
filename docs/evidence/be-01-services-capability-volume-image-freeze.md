# Retained volume/content and image recovery executable freeze

Local preparation only. No execution authorization, remote staging, tests or recovery of volumes/images. Prior exact four-probe recovery and coordinator independent reconciliation passed; see be-01-services-capability-probe-recovery-result.md. Existing recovery56/staging92/launcher51 bytes are unchanged. Historical full-services failure remains unaccepted.

## Exact files and review slices

Manifest: `be-01-services-capability-volume-image-files.json`, SHA256 `a727ce2126c4294b8481a9c85c146ac11fb8cf71e79d8100119531439bae1a42`.

| New script under docs/evidence/scripts | LOC | SHA256 |
|---|---:|---|
|be01-capability-content-probe.sh|50|e0c8e2d50f224436e92fb5b6c9ceae6388ea5e1dc3a6f8490c02a047fd17d20c|
|be01-capability-volume-recovery.sh|106|cb9a1281dfa9a2ed34a6407b1b7012dbe1838ca39f12d3d0337d97338fb18be9|
|be01-capability-image-recovery.sh|85|8ac8a690a9dd1e31a71b226bdf10d0cc9eca04381c94c51c0c1b771deb7b8348|
|be01-capability-image-recovery-regression.sh|26|aaccab391834af57f3f8e26dd2c3397caca27f92f6bde74e0b76aa4264b92f91|

267 unique executable/test lines: driver+content156 and image+regression111 independently reviewed for correctness and dedicated design, zero remaining defects,0/KLOC. Design overlaps/nonadditive; analytical only (Obsidian unavailable). All hashes stable. Historical draft124 LOC had two unique MED findings (serial-inspection budget and implicit ancestor prune),16.13/KLOC. Both repaired statically; tests/syntax NOT_RUN. Concrete socket-free dispatcher: be-01-services-capability-validation.md.

## Scoped changes and limits

The volume driver authenticates unchanged structural volume.rb, canonical52 manifest/files, repaired inspector, both executable helper pins and all historical volume identity/intent records. All four identities and zero-consumer checks pass before probes. Each new probe registers name/spec before creation, mounts exact existing volume readonly+volume-nocopy and source readonly, network none, no ports, UID0 with only DAC_READ_SEARCH, readonly root,1CPU512MiB/equal swap/pids256/tmpfs64MiB. It rechecks volume identity after creation before start, preventing silent acceptance of Docker-created replacements. Full repaired profile/fingerprint and exited0 plus exact oracle output are required before non-force probe removal and successful inventory absence. All four content/probe cleanup statuses precede any volume removal. No init-state, secrets, failed cleanup function, global prune, or broad deletion.

Image procedure is separate. Read-only --verify authenticates historical task output/provenance and absence from preexisting image list before probes. --remove additionally requires all exact volumes and task-labelled volumes absent; two fresh strict image checks, zero consumers and exact tag resolution; only exact full ID is removed. It now uses `--no-prune`: official Docker documentation specifies that this prevents deleting untagged parents ([Docker image rm](https://docs.docker.com/reference/cli/docker/image/rm/)). Shared image inventory retention is an additional check, not a substitute for preventative scope.

Both consumer checks batch at most1000 captured full IDs into one bounded inspect and validate complete exact ID-set equality/uniqueness. Missing IDs, failed inspection, oversized inventories or changed consumers fail closed; no per-shared-container CLI loop. Each Docker call15s+3s; content start30s+3s; volume phase600s+30s including image preflight; image phase120s+10s. These are hard bounds, not guarantees of completion. Unknown create/start/removal or missing status requires independent exact reconciliation, not retry. No automatic cleanup trap mutates uncertain resources. Content proof is structural only, not database integrity or old-session survival.

## Proposed dispatch after review and explicit separate allocation

Upload four files plus manifest/profile into a fresh private delivery, authenticate expected outer/member pins before invoking; do not stage product/source or overwrite prior delivery. Keep script source private and original canonical source unchanged. Record host/context/capacity/conflict and all retained identities first. The independently reconciled old four probes must remain absent. Preparation has not uploaded this packet or acquired a lease.

Socket-free regression first using the reviewed base-only container lifecycle: delivery readonly; noexec /tmp; UID10001; no socket/network; constrained profile. Authenticate image script and regression against this manifest before:

```bash
IMAGE_RECOVERY_SOURCE=/delivery/be01-capability-image-recovery.sh bash /delivery/be01-capability-image-recovery-regression.sh
```

Also run bash -n on all four files inside Docker. The regression extracts only the real removal function: exact --no-prune/full ID/no force arguments, daemon failure37 propagation, and original command discriminator91. It does not prove real Docker parent retention, consumer concurrency, content-profile transitions, mounts or permissions; those remain review/runtime boundaries. No host tests authorized.

Only after review, regression and a new coordinator recovery allocation (fresh absolute evidence paths; DELIVERY externally authenticated):

```bash
RECOVERY_APPROVED=capability-four-volumes RECOVERY_INSPECTOR="$DELIVERY/profile.jq" RECOVERY_EVIDENCE="$DELIVERY/volumes" bash "$DELIVERY/be01-capability-volume-recovery.sh" </dev/null
```

Stop after this phase; independently reconcile exact new probe IDs/names/labels, all four volumes, unchanged app/shared images and raw free bytes. Preserve every ambiguous resource. Only after separate coordinator acceptance/allocation for the final image phase:

```bash
RECOVERY_APPROVED=capability-exact-image RECOVERY_EVIDENCE="$DELIVERY/image" bash "$DELIVERY/be01-capability-image-recovery.sh" --remove </dev/null
```

Capture true SSH/phase statuses independently; status markers exist only for reached gates (absence is NOT_RUN/unknown, not0). Use successful full inventories to prove absence; failed inspect alone is never proof. Missing/timeout status demands bounded read-only reconciliation. Full Auth/Storage/restart retry remains a separate later allocation.

Recovery socket-free validation PASS: audit.DIGxywd8, SSH/launch/parent/test/cleanup/source/inventory/independent reconciliation all0; actual UID10001 hashes/syntax and no-prune/daemon-error/original-discrimination passed. Exact container87432c68 absent; four volumes/app image/shared bases retained. Root independently accepted and RELEASED validation reservation. Raw shared-host free delta -43646976 bytes. Scope only; real Auth/private Storage/restart pending. See docs/evidence/be-01-services-capability-validation-result.md and separate recovery-invocation.md proposal (NOT_RUN, no recovery allocation). Earlier NOT_RUN statements for socket-free validation are historical; recovery remains NOT_RUN.
