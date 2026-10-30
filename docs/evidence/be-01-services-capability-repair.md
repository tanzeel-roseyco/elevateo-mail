# BE01 capability serialization repair ? frozen, runtime pending

Full-services R2 is FAILED, not accepted. Parent and child each reported `test_exit=1 cleanup_failed=1`; launch SSH=1. The outer wrapper did not save parent.status, so a separate captured parent exit is unavailable. Build/baked verification passed; initial state-volume probe profile failed before real Auth/private Storage/restart cases. No retry occurred.

## Evidence and exact retained inventory

Remote audit: `/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-services-r2-audit-a5397bfa-8b33-4a18-a0d6-7c3ddc6d7895`.
Parent evidence: `be01servicesapp-00ef5f0b-5d3a-4285-813b-b9895a0bc443.qiDe2B`; child: `be01services-6f1401a6-071b-475a-8c27-1a3de66edc4b.qXP5nL`, both under the same remote root. Sanitized `profile-booleans.json` isolates capability comparison as false. Coordinator independently confirmed all four Created probes serialize `CAP_` names.

Local independent inventory: `C:/Users/Tanzeel/AppData/Local/Temp/be01-services-capability-inventory.log`, SSH0. Earlier `be01-services-r2-reconcile-final.log` records inventory/source/shared-base exits0, cleanup incomplete. Latest enumeration shows four Created probes, four volumes, retained app image, no task network or parent-named builder/cache; buildx lists default only. This is enumeration, not cleanup success. No retained objects were mutated or deleted. Execution is stopped; no new workload or cleanup is authorized by this packet.

Child task prefix: `be01services-6f1401a6-071b-475a-8c27-1a3de66edc4b`.

| Full container ID | Probe name suffix |
| --- | --- |
| 4e6e0384c68c53a8dc5a399ac29475bd512a1c9944495c18b346d60a4a0f3c4f | probe-4f29be4c-9ffa-49c6-a22e-4732818631b7 |
| 204eb69b6ee37cfbecc49186a5135c8b64ac762bd22b958dc844b6a1a6954082 | probe-6eb9c0f5-8a4d-4099-91bc-e31f88884284 |
| 9550a43d00f4683d763bb08ac53c8e1d7c87c2ff1ea0d529d073d44fa2dbf5a9 | probe-cd747e1c-cd92-44d9-bdf2-0fb2767bd58e |
| 3fc61e99ba60e33b95254fec05751d4e6705125749643a5b75a10fd89fa3fe95 | probe-02fce9dc-9840-4b41-9493-a49ce29c61f6 |

Full names are child prefix + `-` + suffix. Retained volume names are that prefix plus `-config`, `-data`, `-state`, `-storage`. Retained image ID is `sha256:7d755994b0456f71886c92ec548e55b64f58d0c8a579c14cde401f23b715b0f8`, tag `be01servicesapp-00ef5f0b-5d3a-4285-813b-b9895a0bc443:app`. Parent builder ID was `bf0e5f1939dd6f82d6b3eb92471071e37aa710365a876cc46bdb1075c135f73c`.

Raw free bytes before272796352512, after272168771584: delta -627580928 on a shared host, not attributable reclamation. Shared base identity comparison passed. No global prune or persistent deletion.

## Repair and oracle

`profile.jq` canonicalizes a single optional `CAP_` prefix on both expected and actual CapAdd arrays and in the fingerprint. Only CHOWN, FOWNER and DAC_READ_SEARCH are supported because those are the fixture's entire capability vocabulary; stack preparation already requires zero service cap_add. Null/absent remains the empty set. Nonarrays, nonstrings, unknown names, repeated prefixes, lowercase names, duplicates (including equivalent prefixed duplicates), and added capabilities fail closed. No other profile predicate changes.

Regression covers bare/prefixed equality and stable fingerprints for the one-capability cleanup, two-capability initialization and empty profiles; fourteen capability negative cases plus seven existing security negatives. The prefixed valid fixture discriminates the original raw comparison. Checks now invoke this regression in the existing socket-free jq tools lifecycle alongside the nine volume cases and app coupling. No test or syntax execution has occurred for this repair.

## Frozen execution files

| File | LOC | SHA256 |
| --- | ---: | --- |
| `ops/tools/be01-services/profile.jq` | 47 | `d7e8a7d982b4e9bac6bbca3daf8f13494a8181a40d4d704dcd7a28fc93b9b633` |
| `ops/tools/be01-services/profile-regression.sh` | 52 | `a80ebee722656cdf1311a28ce4d6621c5332358bd336b63c2668caab8ba93889` |
| `ops/tools/be01-services-volume-check/checks.sh` | 20 | `d51f8fbe765c077f804dfe1334d33df3316571d14ab1d098325719707d72f050` |
| `ops/tools/be01-services/package.sha256` | 14 | `ad4773807748c99d23c763f2a6203a4cde276c68cca09ea6f9f030380252235d` |
| `ops/tools/be01-services-app/dispatch.sh` | 38 | `5d159340df518eaf4dcaf7c67d76728befb18b6e34f5761dee1bc124f777541c` |
| `ops/tools/be01-services-app/regression.sh` | 82 | `bdab4ccb62c24b4433d4d05c2f1b901155f4e8f4c6dcd47d88d6b42aca55518f` |
| `ops/tools/be01-services-app/package.sha256` | 3 | `e00f1937002e6efef78b3a7dd1e733f351955377e95fe43fdbddc1036c3245ef` |
| `ops/tools/be01-services-volume-check/package.sha256` | 13 | `af243965b395e7defd021b9f249958ab77b01e881bc2bae30811b63928ca99ad` |

239 executable full-file LOC plus30 manifest lines; these are review scope counts, not changed-line counts. Core slice99 (profile47 + regression52); coupling slice170 (checks20 + dispatch38 + app regression82 + manifests30). Dedicated design may cover core99 with remaining context separately. Parent code/design reviews complete:157 unique agent-reviewed LOC, zero defects,0/KLOC; design nonadditive. Root separately inspected app regression82 with zero concrete findings. Static only; runtime pending. Historical static zero findings remain historical; this is one independently confirmed runtime representation defect.

Old adapter b20a6947 -> ad477380; old app2da812bb -> e00f1937; old check5c40fbe1 -> af243965. Full hashes above. App parent643bfe925f232263dc1619352f5fc5326bb86d01544856325fad493221199434 and check parentf2499630b41ddbbfcabe018bc6e00740cbcef20e36cdc3aad4d2cc40a10076c2 unchanged. Canonical52/source03d590dd, fixture028c90c2, dependenciesb1a60a99 and all historical tools recipes remain unchanged. Do not use local CRLF source to repin remote LF files.

## Proposed reconciliation and execution sequence ? review required

1. Preserve existing private evidence and original specs/volume snapshots. Authenticate repaired inspector separately, without replacing old remote source. Before any mutation, obtain reviewed recovery procedure and fresh coordinator allocation. No automatic finish_services retry: it can allocate more probes.
2. For each of the four exact IDs above, require historical registry spec and original creation evidence, fresh matching name/image/task label and Created/stopped state, and full repaired profile including exact command/mounts/caps/limits. Failed initial profile may mean no saved fingerprint exists: do not fabricate a historical pin. Compare two fresh normalized inspections to each other AND the historical intended spec. Missing evidence means retain.
3. Only after explicit recovery approval, non-force remove each exact verified stopped container ID; immediately inspect exact ID/name absence. Do not start these retained probes. Never authorize deletion from labels alone.
4. Compare each exact volume to its historical registered snapshot and require zero consumers. Use separately reviewed bounded read-only content checks with the frozen volume oracle, independently verify and remove their exact task probes, then recheck volume identity/consumers. Delete only volumes whose identity AND content pass. Keep every uncertain volume; no empty-directory assumption or forced deletion.
5. Remove retained app image without force only after exact tag/ID/task provenance and zero consumers are verified; preserve shared/preexisting images. Independently check exact names, IDs, labels, cache and registry and report statuses/free bytes. Do not equate a failed inspect/timeout with absence.
6. After review, authenticated old-pin staging of these eight files requires a separate grant and manifests last. Run existing socket-free check parent with `VOLUME_CHECK_PACKAGE_SHA=af243965b395e7defd021b9f249958ab77b01e881bc2bae30811b63928ca99ad` under its documented environment, only after reservation. Full-services retry is a separate grant after synthetic PASS and recovery closure. Use an authenticated uploaded LF launcher, not stdin orchestration that can lose final status writes.

Outstanding: review of new executable recovery/staging/launcher packet, Docker capability/volume/app coupling tests, exact cleanup, then real Auth/private Storage/restart-before-reseed acceptance. See be-01-services-capability-execution.md. BE02 consultation gate/native Windows limits are unchanged. No ultrareviews or paid calls.
