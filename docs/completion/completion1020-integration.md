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

The initial broad browser run (`be02-f0911ba0d164452e96812fb748feb879`) failed because its single seed did not satisfy newer per-scenario fixture identity, permissions and attachment prerequisites. It was stopped after diagnosis; cleanup passed and source was unchanged. Corrected isolated-scenario browser validation remains in progress.

The real storage/scanner gate `be02-35840d2537534b4faa88628c24236ef8` passed attachment HTTP acceptance (1 test / 45 assertions), scanner-process acceptance (4 tests / 121 assertions), fixture lint and API HTTP acceptance. It reused the unchanged passing backend source evidence. Task cleanup passed, including removal of the task-acquired ClamAV image; shared resources were preserved. See its [result receipt](completion1020-evidence/be02-35840d2537534b4faa88628c24236ef8/result.json).

The latest frontend-only gate remains passed: [913 tests and browser/visual evidence](completion1019-web-validation.md). Android acceptance is historical at `2f9c7e50`, not a new signed native release.

## Cleanup and remaining activation

The backend gate removed its five service containers, builder container/registration, three disposable volumes, network and task image. Shared base images and persistent data were retained. Shared host free space changed from 225,270,300,672 to 224,491,929,600 bytes; concurrent workloads prevent attributing a reclaimed-space number. No Windows Docker virtual disk was used.

Production sender/domain verification, private provider credentials, webhook configuration, operational deployment verification and signed native distribution remain separate unfinished activation work. The implementation gate does not authorize live mail, spending or publication.

## Populated recovery passed

Recovery `recovery-newest1040-3ed49b4aaa2f` passed fixture unit tests, source snapshot integrity, populated Resend queue/route and draft metadata recovery, exact private object bytes/digest, migration down/up schema and data fingerprints, catalog/RLS/role reachability, restored API readiness and held-worker heartbeat. Source and restore cleanup both exited zero; temporary private credentials and snapshot files were removed. See the [recovery result](completion1020-evidence/recovery-newest1040-3ed49b4aaa2f/result.json) and logs beside it.

Build owner `be02-39607fa39c7344408e2f2e69e2b08146` verified unchanged source and removed its builder, cache volume and candidate image. The older task image `recovery1040-6ce47ff65cc8:server` was independently confirmed absent. The comparison-only normalizer handles one equivalent PostgreSQL filename-constraint parenthesization; changed operators/bounds remain detectable. This is a synthetic populated restore rehearsal, not a measured production RPO/RTO guarantee.