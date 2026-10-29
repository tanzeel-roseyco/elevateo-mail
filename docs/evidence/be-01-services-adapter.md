
## BE01 adapter full static review and marker repair

Parent completed original A143 zero/B135 one P2/C121 zero/D89 zero:488 unique LOC, one confirmed defect,2.05/KLOC. Design164 overlapping zero; B targeted73 overlapping found the same marker defect. B remains1/135=7.41/KLOC, not PASS0. Explicit marker failure propagation plus real-fixture conditional invocation regression are now frozen for targeted review (132 full-file LOC); runtime and syntax unexecuted. New package3044a0e2df4daa6cf5372e1edd90c609f5ed9d91a2b874842e97710d09694787. See docs/evidence/be-01-services-marker-repair.md for exact three changed execution files and four-case oracle. Original findings are not erased by this unverified repair. run_phases unconditional caller cross-check is pending parent evidence. No Docker until separate release/reservation; no ultrareviews.
# BE01 real-service lifecycle adapter freeze

Status: authored for parent bounded adversarial review; NOT executed or syntax-tested. FE r11 holds fleet-02. No remote mutation, Docker, host tests, paid calls or ultrareviews were performed for this adapter. Existing fixture/product/Lane C/tools/app execution files remain unchanged.

## Completed fixture review

Parent reports all four code slices PASS: Auth/transport137, Storage104, orchestration/tests108, persistent-state135. Unique coverage484 LOC, zero confirmed defects, 0/KLOC. Dedicated design179 overlapping LOC PASS0, 0/KLOC; overlapping coverage is not added. This closes static fixture review only. Fixture package SHA256 remains `028c90c20b356ffaa8c4ba285524d4835dd8513685c096aa41acaa12b22a476d`.

## Scope and safety boundaries

The separate adapter uses a prebuilt immutable app image, verifies baked source and UID10001 readability, authenticates canonical source and inherited helpers, and creates an isolated internal network plus four nonce-labelled data/config/storage/state volumes. All nine service identities are registered before one supported Compose create; image pulls and builds are disabled. Original helpers are imported without byte changes; only new adapter functions specialize persistent mount inspection and Compose configuration.

Service limits retain Lane C caps (app/database2CPU2GiB, other services1CPU1GiB or0.5CPU256MiB). Fixture containers use1CPU512MiB, PID256, read-only root, no-new-privileges and dropped capabilities. State initialization alone adds CHOWN/FOWNER. Read-only content inspection adds DAC_READ_SEARCH to traverse service-owned directories; no writable data mount accompanies that capability. This capability and actual image filesystem layouts require Docker validation.

Phases establish Auth IDs/private Storage/database/credential baselines, exercise repeat generation/bootstrap/migration/seed, then stop all seven long-lived services and restart the same containers. After restart only services check, database compare, authorization and credential compare run. No baseline or seed can heal lost data at that point. Fresh password grants do NOT prove survival of previously issued sessions. Mailpit/PostgREST harmless readiness GETs retry within a bound; negative acceptance assertions do not retry.

Cleanup preserves initial test status separately from cleanup failure. Exact registered IDs/profiles and volume identity, absence of consumers and read-only content inspection precede deletion. Authentication failure retains all resources; partial unpinned create retains uncertain objects. No broad prune or project down-volume deletion. Fresh exact-name and label inventories, image/builder listings and host free bytes are retained. This driver creates no builder/image and deliberately retains its preexisting immutable app and shared images; the parent build lifecycle must separately own and clean any disposable app/build resources.

## Review slices

A: run.sh66 + stack.sh70 + config.jq7 =143 LOC (authentication, environment isolation, registration).
B: fixture.sh73 + profile.jq40 + readiness.rb22 =135 LOC (secret separation, capabilities, exact profile).
C: volumes.sh94 + volume.rb27 =121 LOC (failure cleanup and retained content).
D: phases.sh43 + regression.sh19 + profile-regression.sh27 =89 LOC (oracle ordering and negative coverage).
Unique adapter executable/config coverage requested488 LOC, plus18 manifest lines =506 total added execution-package lines. Each module is at most94 LOC. Dedicated design should inspect bounded overlapping slices of these invariants. Adapter defect count/density is not assessed; no review PASS is claimed.

Socket-free regressions cover exact post-restart calls, stopping after failed services/database comparisons, named-volume ownership/mount/capability/cap/resource drift and OOM false/null equivalence. They do not yet establish real daemon partial-create/timeouts, volume layout compatibility or cleanup success. Those remain explicit review/runtime cases, not inferred PASS.

## Execution prerequisites and proposed sequence (not authorized while FE holds reservation)

1. Parent reviews this freeze, returns any findings, obtains explicit FE release and backend reservation. Authenticate the package manifest externally before invoking its scripts. Stage only these new LF files plus the previously frozen fixture package, preserving all52 canonical source files. Canonical source manifest stays `03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b`; do not repin local CRLF files.
2. Within a reviewed socket-free capped Docker tools container with Bash/jq/coreutils/Ruby, read-only source and writable temporary tmpfs: run `bash -n` on each new shell module, `ruby -c` on volume.rb/readiness.rb, then `bash /src/ops/tools/be01-services/regression.sh` and `bash /src/ops/tools/be01-services/profile-regression.sh`. No Docker socket is needed for these checks. Record exact image ID, command, exit and cleanup inventories.
3. Provide a currently available baked-source-matching immutable app image. Earlier acceptance app images were cleaned; their historical IDs are not availability proof. A separate reviewed parent build/release adaptation is still required if no matching image is present. Use the already accepted dedicated capped builder lifecycle and immutable BuildKit reference; do not invoke the old parent runner as though it dispatched this new lane.
4. Verify exact host `hostname -s` = `Ubuntu-noble-latest-amd64-base`, selected local Unix daemon/context, no conflicting workload, all five digest-pinned Compose images present, canonical source readable asUID10001, executable app bin rails/worker/worker-health, and sufficient host free space. No pulls in the adapter. Evidence directory must exist and be privately owned; resolved source path must be canonical.
5. Proposed parent invocation after those gates (variables must identify authenticated staging, daemon context, existing app image and private evidence root):

```bash
BE01_SOURCE="$CANONICAL_STAGED_SOURCE" BE01_CONTEXT="$SELECTED_CONTEXT" \
BE01_APP_IMAGE="$VERIFIED_IMMUTABLE_APP_ID" BE01_EVIDENCE="$PRIVATE_EVIDENCE_ROOT" \
BE01_PACKAGE_SHA=f2804ee51b5d914d8b2bf2dc8f6e43b5c6121d2c212946eb8b779f297d6fc58b \
bash "$CANONICAL_STAGED_SOURCE/ops/tools/be01-services/run.sh"
```

The driver applies a1200s lifecycle deadline and600s forced termination grace for bounded cleanup; individual daemon calls have independent bounds. Capture the outer exit, printed test_exit/cleanup_failed, evidence path and independent exact inventories before releasing reservation. Any RETAIN stops acceptance and requires reconciliation; it is never automatic permission for broader deletion.

## Remaining scope

Actual Auth provisioning/token/signup denial/invite recovery, private Storage roundtrip/direct denial, repeat bootstrap/migration and whole-stack retained rows/bytes/credentials remain runtime pending. Existing scripts/dev and scripts/dev.ps1 seed/check services still require the separately planned minimal wiring patch; this adapter does not silently modify frozen product wrappers. Old-session survival, native Windows acceptance and other whole-BE01 gaps remain distinct. BE02 remains two valid opinions and a failed third, with no implementation or new paid dispatch.

## Exact LF files

| File under ops/tools/be01-services | Lines | SHA256 |
|---|---:|---|
| config.jq | 7 | `4b087cfdfb4335f8509f85c806bfc3a66a85296f95e094299394f298a2d1cc35` |
| dependencies.sha256 | 6 | `b1a60a9948b4fc24288ce469a5852fb11eb321c008c6a4d821789d93622b4263` |
| fixture.sh | 73 | `080f8f4fb0004298e5030332c93a22ce5f42e4484fde3f60501c40dee5c240b9` |
| package.sha256 | 12 | `f2804ee51b5d914d8b2bf2dc8f6e43b5c6121d2c212946eb8b779f297d6fc58b` |
| phases.sh | 43 | `8546a9ecbdc18cbf1718114b5d270a622bff1eb9d86643d80921b645c0f40a49` |
| profile.jq | 40 | `803dd61d285ffcc14702002355366a18b5b93e58ee88ec2051ca94b5b838da9d` |
| profile-regression.sh | 27 | `5008cc993b651374e6eb1e5ad2912263a909991f9dd7125bb7311a2068d08a13` |
| readiness.rb | 22 | `1f0f018774675e1f1b149fc80b30df0fdd3220807d231eb95638ef259f4d91d6` |
| regression.sh | 19 | `343056a493d31046ebc2111f4d5fde5ee63a46ffcc7ab0b71ad8fafee8b2fc47` |
| run.sh | 66 | `2bcb852f2e05abdbc29a3935ec2b9bff392968614ad3acf28f9665edd575389c` |
| stack.sh | 70 | `65c9ea3762e8479832c501de89493ad30b7959bba7dad5f718fcbc4a1a06263f` |
| volume.rb | 27 | `1c9e6f6a7aeb8cedace643d9c3798bd36d6fb623bff58e2ce6876becee8d54fa` |
| volumes.sh | 94 | `e4672baae00205f056f5b866c7fc022df7549bef622c98eff4d02ec97be68cc9` |

Parent checkpoint: FE r11 reports209 unit /163 browser /50 skips and cleanup exit0. Independent FE cleanup verification and explicit release remain pending; FE retains the reservation. Adapter execution bytes are frozen with no further edits during parent code/design review. No Docker execution is authorized by this checkpoint.

## Adapter interim review: edits held

Parent reports A143 LOC: zero confirmed defects, 0/KLOC; dedicated design164 overlapping LOC: zero confirmed defects, 0/KLOC. B135 targeted reconsideration confirms ONE defect, 7.41 defects/KLOC (not PASS0): ops/tools/be01-services/fixture.sh line71 writes the gone marker without guarding failure. Because volumes.sh invokes fixture in an if/AND conditional, Bash errexit is suppressed; marker failure after container removal can fall through to the prior success return.

Queued repair: propagate marker-write failure explicitly and add a regression injecting marker-write failure under the actual conditional-call shape. HOLD all execution edits until C121/D89 reviews finish, then address this and any additional findings together. C/D pending; no whole-adapter acceptance or runtime PASS. Package remains f2804ee51b5d914d8b2bf2dc8f6e43b5c6121d2c212946eb8b779f297d6fc58b. No Docker or ultrareviews.