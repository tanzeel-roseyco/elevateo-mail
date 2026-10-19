# Combined backend verification — 20 October 2026

The completion branch preserves the October 18 application base (`5c39dc9e`) and incorporates the unfinished Resend, draft attachment and recovery work. No production activation or live provider delivery is claimed.

## Passed backend gate

Fleet-02 Docker project `be02-c2fea63b2b74421798b751a51ee4e6bd` passed:

- 195 standard suites: 1,119 tests and 13,013 assertions, zero failures, errors or skips.
- Steep strict type checks and RuboCop across 448 files.
- Real HTTP acceptance: one test, 33 assertions.
- Worker drain for real HTTP local/global authentication revocation intents.
- Source hashes unchanged throughout execution; exact disposable resource cleanup passed.

The pilot regression uses real PostgreSQL authority and a deterministic HTTP provider. It covers consent, immutable approval, attachment scan eligibility and exact transmitted bytes, signed bounce replay, revoked sessions, and ambiguous submission held as unknown without automatic resubmission. It does not establish external Resend delivery.

Evidence is retained in [the backend result](completion1020-evidence/be02-c2fea63b2b74421798b751a51ee4e6bd/result.json), with logs and cleanup/source receipts in that directory. Earlier failed runs are preserved on fleet-02; they are not counted as passes.

## Integrated checks

The initial broad browser run (`be02-f0911ba0d164452e96812fb748feb879`) failed because its single seed did not satisfy newer per-scenario fixture identity, permissions and attachment prerequisites. It was stopped after diagnosis; cleanup passed and source was unchanged. Corrected isolated-scenario browser validation passed for the eight targeted cases recorded below; the failed broad run is not counted as a pass.

The real storage/scanner gate `be02-35840d2537534b4faa88628c24236ef8` passed attachment HTTP acceptance (1 test / 45 assertions), scanner-process acceptance (4 tests / 121 assertions), fixture lint and API HTTP acceptance. It reused the unchanged passing backend source evidence. Task cleanup passed, including removal of the task-acquired ClamAV image; shared resources were preserved. See its [result receipt](completion1020-evidence/be02-35840d2537534b4faa88628c24236ef8/result.json).

The latest frontend-only gate remains passed: [913 tests and browser/visual evidence](completion1019-web-validation.md). Android acceptance is historical at `2f9c7e50`, not a new signed native release.

## Cleanup and remaining activation

The backend gate removed its five service containers, builder container/registration, three disposable volumes, network and task image. Shared base images and persistent data were retained. Shared host free space changed from 225,270,300,672 to 224,491,929,600 bytes; concurrent workloads prevent attributing a reclaimed-space number. No Windows Docker virtual disk was used.

Production sender/domain verification, private provider credentials, webhook configuration, operational deployment verification and signed native distribution remain separate unfinished activation work. The implementation gate does not authorize live mail, spending or publication.

## Populated recovery passed

Recovery `recovery-newest1040-3ed49b4aaa2f` passed fixture unit tests, source snapshot integrity, populated Resend queue/route and draft metadata recovery, exact private object bytes/digest, migration down/up schema and data fingerprints, catalog/RLS/role reachability, restored API readiness and held-worker heartbeat. Source and restore cleanup both exited zero; temporary private credentials and snapshot files were removed. See the [recovery result](completion1020-evidence/recovery-newest1040-3ed49b4aaa2f/result.json) and logs beside it.

Build owner `be02-39607fa39c7344408e2f2e69e2b08146` verified unchanged source and removed its builder, cache volume and candidate image. The older task image `recovery1040-6ce47ff65cc8:server` was independently confirmed absent. The comparison-only normalizer handles one equivalent PostgreSQL filename-constraint parenthesization; changed operators/bounds remain detectable. This is a synthetic populated restore rehearsal, not a measured production RPO/RTO guarantee.
## Reproducible focused browser checks

`ops/tests/be02/run_focused_acceptance.py` builds shared immutable application/browser images and creates a fresh authenticated PostgreSQL stack for each affected attachment case. Run it on the Linux Docker fleet under the existing `soren-docker.lock`; it is a diagnostic subset, not the full release acceptance matrix. Private Storage authority stays in the privileged fixture, while the browser receives only a validated read-only attachment receipt. Generated compose configuration is checked before image builds. Cleanup attempts every acquired image and preserves failure/source-integrity evidence even if removal fails.

The added `SCN-QA-830-P` checks saved-draft upload/removal persistence, invalid-file recovery and narrow-screen presentation against the real backend. Its scanner is deliberately held; separate backend/scanner tests establish scan authority and outbound byte integrity. A browser-visible pending-to-clean transition is not claimed.

## Current focused browser evidence

Fresh isolated AUTH-006 (`be02-e9a0fa0ee9284caeb2729af5a715cd6f`) and QA826 (`be02-d71b0d68ca4a4cf4905e97ac51c5f31c`) passed, including cleanup. The invitation navigation locator scopes the exact mailbox link to the main landmark; the assignee fixture retires unrelated invitation membership under the existing authorization-generation lock.

QA830 (`be02-b034c0ccfd5c4a9288e3c86194b7f92d`) passed real authenticated saved-draft upload, invalid-file recovery, reload persistence and removal, with cleanup passed. QA829-P (`be02-6077cbef09ad410b8bd8d23f8af9b2a9`) passed clean/held/rejected attachment presentation and private download length/SHA-256 verification, with cleanup passed. Six current 390px screenshots were manually inspected: controls and statuses are readable, message HTML stays literal and there is no horizontal overflow.

These targeted real-backend Chromium checks supplement the earlier 28 controlled frontend scenarios. They do not establish completion of the broader integrated multi-engine acceptance matrix.

The final six-case run passed every case and its fresh-stack cleanup:

| Case | Evidence project | Verified behavior |
| --- | --- | --- |
| QA830-P | `be02-b034c0ccfd5c4a9288e3c86194b7f92d` | Saved-draft upload/removal, invalid-file recovery, reload persistence |
| QA829-P | `be02-6077cbef09ad410b8bd8d23f8af9b2a9` | Clean/held/rejected presentation and exact private download bytes |
| QA829-F1 | `be02-4ea18154c15a47f69cbd3f3b7f1b521a` | Loading, controlled transport failure and successful retry |
| QA827-P | `be02-eba328cebab6494a9204145e35a60fac` | Private API bytes/digest and safe response headers |
| QA827-F1 | `be02-95f0c87268f4473f8fed1d20f71a74f2` | Held/rejected files return 423 without bytes |
| QA827-F2 | `be02-087ea53cf2bc4c7fb704c250ab550618` | Cross-mailbox content returns uniform 404 |

Final run source remained unchanged. The application server, web and contracts were unchanged from the shared build; the browser image was recompiled after diagnostic-boundary corrections. Docker diagnostic tests passed 27/27, and the exact persisted fixture/cleanup regressions passed 6/6. Earlier fixture failures and the rejected extra-mount workaround remain failed attempts, not application passes. The extra-mount stack has a separate supplemental cleanup receipt preserving its original failed cleanup record.

The original build-owner receipt correctly reports `source_unchanged: false`: fixture/diagnostic source was repaired while its application images were retained. This is not treated as a frozen-source pass. The recorded source delta is limited to the attachment fixture helper and browser diagnostic files; server/web/contracts are unchanged. The final browser image incorporates those corrections, and the final six-case source snapshot remained unchanged.

Final browser cleanup independently verified that all 20 owned projects have no remaining containers, volumes, networks, images or builders; paused runners exited. Task-acquired image pins and disposable build cache were removed, with shared/persistent workloads preserved. Host free space increased by 14,792,925,184 bytes (about 14.79 GB), to about 235.38 GB. This is an observed shared-host delta, not an exact task-attributable reclamation figure. No local Docker/WSL virtual disk was used; Windows C: had 65,961,185,280 free bytes at the final local check. The persisted cleanup regression was copied into canonical source after the final frozen snapshot closed and is separately recorded in provenance.

The [explicit eight-case index](completion1020-evidence/control/completion1020-browser-index.json), [final cleanup receipt](completion1020-evidence/control/completion1020-final-cleanup.json), source manifests and six screenshots are committed alongside this record. The imported source/evidence archives matched SHA-256 `c952c46b04505e513c57579f38dd74afa7750008ccd517aed7860ab706e9fae3` / `91c990c04fc14f35fdbc9fadbcbb033ccb0452a041e023369b1d27abb88b1874`; all ten source files matched the tested fleet copies after LF normalization.
