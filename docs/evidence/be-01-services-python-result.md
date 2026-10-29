# BE01 frozen Python sequence — runtime PASS

Fleet-02 lease RELEASED after independent cleanup on 2026-10-12. No full-services workload was started. Frozen execution bytes and canonical52 are unchanged.

Evidence root: `/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-python-sequence-audit-20261012-r1`.
Original runner evidence: `/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01stagepy-fb089dc1-36e8-476c-b9ec-352efe4f7989.rI1chD`.

| Phase | Actual outcome |
|---|---|
| Fresh preflight | Host/context/capacity/conflicts, all staged packages and canonical52 PASS; SSH0, before inventory0 |
| Python acquisition | Exact f0408636 digest absent before; pull0, repaired real-inspect identity0, SSH0 |
| Dependency stager | 9 tests PASS; test0, both name/label inventories0, source0, package0, SSH0 |
| Direct identity stager | 3 tests PASS; test0, both name/label inventories0, source0, package0, SSH0 |
| Original stager | 1 mode +3 boundary tests PASS; test0, cleanup_failed0, inventory0, source0, SSH0 |
| Independent reconciliation | Container inventory0, source0, image removal0, image inventory0, shared-base comparison0, SSH0 |

Each supplemental workload used the frozen command: UID10001, readonly root/binds, network none, cap-drop ALL, no-new-privileges, 0.5CPU/256MiB, PID64, noexec32MiB tmpfs and90s deadline. Actual successful UID10001 execution is now separate evidence beyond static mode assertions. Independent name/label inventories were empty before advancing each phase. No staging or overwrite occurred.

Acquired image ID and reference digest: `sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a`. Real containerd identity matched the manifest; the repaired predicate authenticated the manifest/config chain. Before inventories proved both supported identities absent. Fresh inspect, tags/digests and ancestor-container inventories authorized exact non-force removal. Final full image inventory confirms both identities/digest absent.

All three exact task names/labels are absent from independently repeated full/container-filter inventories. Supplemental names are retained in `dependency.task` and `identity.task`; original task is `be01stagepy-fb089dc1-36e8-476c-b9ec-352efe4f7989`. Docker event-history queries returned empty arrays: auto-removed container immutable IDs were not recovered, so no ID-specific removal claim is made. No surviving container requires recovery; complete inventory plus exact names/labels provides absence evidence. Python tests created no Docker builders, volumes or networks.

Shared builder container `8f5fbab3e0e5eca575e9557e4de5f0baf0c9588c7c6f972bcdfe0d94f6902e43`, its `buildx_buildkit_fleet02_state` volume and pinned Ruby/BuildKit bases remain unchanged. Buildx registry lists default only; the unrelated shared builder container remains retained. Persistent/shared workloads were untouched.

Available bytes before272808804352; after272822501376; raw shared-host delta **+13697024 bytes**, not attributable reclamation. Prior jq delta remains **-17620992 bytes**, likewise shared-host only.

Authenticated LF transport scripts (not product or frozen package changes): preflight1b3fc4783b155de4d882eb78d6bab750453cd1b5033836f609670c0927625d2e; acquire a73be24a0f5509e7e025d4ea5655b71169c7ca53e985c0625381c10e272ff57e; dependency5e686af154aa3d13d78df86a6d88953aed306a2bf8458b5f72d270a4a4b63567; identity ba65de11da75be90f028c0a5b3672ac170a906405eaed9bc4da241560848759f; reconciliation6c2b3320762e0ceb1b64df633440e027c4e0f13e3f173099067e622c512e8a53. Scripts/logs preserved in local TEMP and remote evidence. No failures or retries in this sequence.

Next: [full-services prerequisites and concrete commands](be-01-services-next-runtime.md). This PASS establishes stager/identity behavior, not real Auth/Storage/persistence or whole BE01 completion.
